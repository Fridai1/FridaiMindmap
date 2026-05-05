<script lang="ts">
	import type { PageData } from './$types';

	type Light = 'low' | 'medium' | 'bright_indirect' | 'direct';

	interface Plant {
		id: number;
		name: string;
		species: string | null;
		light: Light;
		wateringIntervalDays: number;
		waterCount: number;
		lastWatered: Date | null;
		nextWatering: Date;
		notes: string | null;
		createdAt: Date;
	}

	const LIGHT_OPTIONS: Record<Light, { label: string; hint: string }> = {
		low: { label: 'Low', hint: 'Shade tolerant' },
		medium: { label: 'Medium', hint: 'Soft ambient light' },
		bright_indirect: { label: 'Bright indirect', hint: 'Near a bright window' },
		direct: { label: 'Direct', hint: 'Some direct sun' }
	};

	let { data }: { data: PageData } = $props();

	let plants = $derived<Plant[]>(
		data.plants.map((plant) => ({
			...plant,
			light: plant.light as Light,
			lastWatered: plant.lastWatered ? new Date(plant.lastWatered) : null,
			nextWatering: new Date(plant.nextWatering),
			waterCount: plant.waterCount ?? 0,
			createdAt: new Date(plant.createdAt)
		}))
	);

	let showAdd = $state(false);
	let plantPendingDelete = $state<Plant | null>(null);
	let flippedCards = $state<Record<number, boolean>>({});
	let remindersEnabled = $state(false);
	let form = $state({
		name: '',
		species: '',
		light: 'bright_indirect' as Light,
		wateringIntervalDays: 7,
		lastWatered: dateInputValue(new Date()),
		notes: ''
	});
	let reminderTimers: number[] = [];

	let sortedPlants = $derived(
		[...plants].sort((a, b) => a.nextWatering.getTime() - b.nextWatering.getTime())
	);
	let dueCount = $derived(plants.filter((plant) => daysUntil(plant.nextWatering) <= 0).length);

	function dateInputValue(date: Date) {
		return date.toISOString().slice(0, 10);
	}

	function localDateFromInput(value: string) {
		const [year, month, day] = value.split('-').map(Number);
		return new Date(year, month - 1, day, 9);
	}

	function daysUntil(date: Date) {
		const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
		const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
	}

	function daysSince(date: Date) {
		const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
		const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		return Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000));
	}

	function statusFor(plant: Plant) {
		const days = daysUntil(plant.nextWatering);
		if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: 'overdue' };
		if (days === 0) return { label: 'Due today', tone: 'due' };
		if (days === 1) return { label: 'Due tomorrow', tone: 'soon' };
		return { label: `Due in ${days}d`, tone: 'ok' };
	}

	function fmt(date: Date) {
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	async function addPlant() {
		if (!form.name.trim()) return;

		const res = await fetch('/api/plants', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: form.name,
				species: form.species,
				light: form.light,
				wateringIntervalDays: Number(form.wateringIntervalDays),
				lastWatered: form.lastWatered ? localDateFromInput(form.lastWatered).toISOString() : null,
				notes: form.notes
			})
		});

		const saved = await res.json();
		plants = [
			...plants,
			{
				...saved,
				light: saved.light as Light,
				lastWatered: saved.lastWatered ? new Date(saved.lastWatered) : null,
				nextWatering: new Date(saved.nextWatering),
				waterCount: saved.waterCount ?? 0,
				createdAt: new Date(saved.createdAt)
			}
		];
		form = {
			name: '',
			species: '',
			light: 'bright_indirect',
			wateringIntervalDays: 7,
			lastWatered: dateInputValue(new Date()),
			notes: ''
		};
		showAdd = false;
		scheduleReminders();
	}

	async function markWatered(plant: Plant) {
		const res = await fetch(`/api/plants/${plant.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ wateredToday: true })
		});
		const saved = await res.json();
		plants = plants.map((item) =>
			item.id === plant.id
				? {
						...saved,
						light: saved.light as Light,
						lastWatered: saved.lastWatered ? new Date(saved.lastWatered) : null,
						nextWatering: new Date(saved.nextWatering),
						waterCount: saved.waterCount ?? 0,
						createdAt: new Date(saved.createdAt)
					}
				: item
		);
		scheduleReminders();
	}

	async function deletePlant(plant: Plant) {
		await fetch(`/api/plants/${plant.id}`, { method: 'DELETE' });
		plants = plants.filter((item) => item.id !== plant.id);
		const nextFlipped = { ...flippedCards };
		delete nextFlipped[plant.id];
		flippedCards = nextFlipped;
		plantPendingDelete = null;
		scheduleReminders();
	}

	function toggleStats(plant: Plant) {
		flippedCards = { ...flippedCards, [plant.id]: !flippedCards[plant.id] };
	}

	function wateringPace(plant: Plant) {
		const age = Math.max(daysSince(plant.createdAt), 1);
		const expected = Math.max(1, Math.floor(age / plant.wateringIntervalDays));
		return `${plant.waterCount}/${expected} expected`;
	}

	async function enableReminders() {
		if (!('Notification' in window)) return;
		const permission = await Notification.requestPermission();
		remindersEnabled = permission === 'granted';
		if (remindersEnabled) scheduleReminders();
	}

	function scheduleReminders() {
		for (const timer of reminderTimers) window.clearTimeout(timer);
		reminderTimers = [];
		if (!remindersEnabled || !('Notification' in window) || Notification.permission !== 'granted')
			return;

		for (const plant of plants) {
			const delay = plant.nextWatering.getTime() - Date.now();
			const notify = () =>
				new Notification(`Water ${plant.name}`, { body: 'This plant is due for watering.' });
			if (delay <= 0) {
				notify();
			} else if (delay < 2_147_483_647) {
				reminderTimers.push(window.setTimeout(notify, delay));
			}
		}
	}

	function exportCalendar(plant: Plant) {
		const start = plant.nextWatering
			.toISOString()
			.replace(/[-:]/g, '')
			.replace(/\.\d{3}Z$/, 'Z');
		const end = new Date(plant.nextWatering.getTime() + 30 * 60 * 1000)
			.toISOString()
			.replace(/[-:]/g, '')
			.replace(/\.\d{3}Z$/, 'Z');
		const body = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Mindmap Plants//EN',
			'BEGIN:VEVENT',
			`UID:plant-${plant.id}-${plant.nextWatering.getTime()}@mindmap`,
			`DTSTAMP:${new Date()
				.toISOString()
				.replace(/[-:]/g, '')
				.replace(/\.\d{3}Z$/, 'Z')}`,
			`DTSTART:${start}`,
			`DTEND:${end}`,
			`SUMMARY:Water ${plant.name}`,
			`DESCRIPTION:Watering reminder for ${plant.name}`,
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n');
		const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `${plant.name.toLowerCase().replace(/\s+/g, '-')}-watering.ics`;
		link.click();
		URL.revokeObjectURL(url);
	}

	function closeModalFromBackdrop(e: MouseEvent) {
		if (e.target !== e.currentTarget) return;
		showAdd = false;
		plantPendingDelete = null;
	}
</script>

<div class="plants-page">
	<header class="hero">
		<div>
			<p class="eyebrow">Plant care</p>
			<h1>Keep your plants alive</h1>
			<p>Track watering cadence, light needs, and local reminders for every plant.</p>
		</div>
		<div class="hero-actions">
			<button class="ghost-btn" onclick={enableReminders}>Enable reminders</button>
			<button class="add-btn" onclick={() => (showAdd = true)}>Add Plant</button>
		</div>
	</header>

	<section class="stats">
		<div><strong>{plants.length}</strong><span>Total plants</span></div>
		<div><strong>{dueCount}</strong><span>Due now</span></div>
		<div><strong>{remindersEnabled ? 'On' : 'Off'}</strong><span>Browser reminders</span></div>
	</section>

	<section class="plant-grid">
		{#if sortedPlants.length === 0}
			<div class="empty-card">Add your first plant to start tracking watering.</div>
		{/if}

		{#each sortedPlants as plant (plant.id)}
			{@const status = statusFor(plant)}
			<article class="plant-card status-{status.tone}" class:is-flipped={flippedCards[plant.id]}>
				<div class="plant-card-inner">
					<div class="plant-card-face plant-card-front">
						<div class="card-top">
							<div>
								<h2>{plant.name}</h2>
								{#if plant.species}<p>{plant.species}</p>{/if}
							</div>
							<div class="card-menu">
								<button class="icon-btn" aria-label="Show stats" onclick={() => toggleStats(plant)}
									>↻</button
								>
								<button
									class="delete-btn"
									aria-label="Delete plant"
									onclick={() => (plantPendingDelete = plant)}>×</button
								>
							</div>
						</div>
						<span class="status-pill">{status.label}</span>
						<div class="care-row">
							<span>Light</span>
							<strong>{LIGHT_OPTIONS[plant.light].label}</strong>
						</div>
						<div class="care-row">
							<span>Water every</span>
							<strong>{plant.wateringIntervalDays} days</strong>
						</div>
						<div class="care-row">
							<span>Next watering</span>
							<strong>{fmt(plant.nextWatering)}</strong>
						</div>
						{#if plant.notes}<p class="notes">{plant.notes}</p>{/if}
						<div class="card-actions">
							<button onclick={() => markWatered(plant)}>Watered today</button>
							<button class="ghost-btn" onclick={() => exportCalendar(plant)}>Calendar</button>
						</div>
					</div>

					<div class="plant-card-face plant-card-back">
						<div class="card-top">
							<div>
								<p class="eyebrow">Stats</p>
								<h2>{plant.name}</h2>
							</div>
							<button
								class="icon-btn"
								aria-label="Show care details"
								onclick={() => toggleStats(plant)}>↻</button
							>
						</div>
						<div class="stat-grid">
							<div><strong>{daysSince(plant.createdAt)}</strong><span>days tracked</span></div>
							<div><strong>{plant.waterCount}</strong><span>times watered</span></div>
							<div>
								<strong>{plant.lastWatered ? fmt(plant.lastWatered) : 'Never'}</strong><span
									>last watered</span
								>
							</div>
							<div><strong>{wateringPace(plant)}</strong><span>watering pace</span></div>
						</div>
						<p class="stats-note">
							{status.tone === 'overdue'
								? 'This plant is overdue. Give it a check before watering.'
								: `Next care window is ${status.label.toLowerCase()}.`}
						</p>
					</div>
				</div>
			</article>
		{/each}
	</section>
</div>

{#if showAdd}
	<div
		class="backdrop"
		role="button"
		tabindex="-1"
		onclick={closeModalFromBackdrop}
		onkeydown={(e) => e.key === 'Escape' && (showAdd = false)}
	>
		<form
			class="modal"
			onsubmit={(e) => {
				e.preventDefault();
				addPlant();
			}}
		>
			<h2>Add Plant</h2>
			<label>Name<input bind:value={form.name} placeholder="Monstera" required /></label>
			<label>Species<input bind:value={form.species} placeholder="Monstera deliciosa" /></label>
			<label>
				Light
				<select bind:value={form.light}>
					{#each Object.entries(LIGHT_OPTIONS) as [value, option] (value)}
						<option {value}>{option.label} - {option.hint}</option>
					{/each}
				</select>
			</label>
			<label>
				Water every N days
				<input type="number" min="1" max="365" bind:value={form.wateringIntervalDays} required />
			</label>
			<label>Last watered<input type="date" bind:value={form.lastWatered} /></label>
			<label
				>Notes<textarea
					bind:value={form.notes}
					rows="3"
					placeholder="Prefers to dry out between watering"
				></textarea></label
			>
			<div class="modal-actions">
				<button type="button" class="ghost-btn" onclick={() => (showAdd = false)}>Cancel</button>
				<button type="submit" class="add-btn">Add Plant</button>
			</div>
		</form>
	</div>
{/if}

{#if plantPendingDelete}
	<div
		class="backdrop"
		role="button"
		tabindex="-1"
		onclick={closeModalFromBackdrop}
		onkeydown={(e) => e.key === 'Escape' && (plantPendingDelete = null)}
	>
		<div class="confirm-modal" role="dialog" aria-modal="true" aria-label="Delete plant">
			<div class="confirm-icon">×</div>
			<div>
				<p class="eyebrow">Delete Plant</p>
				<h2>{plantPendingDelete.name}</h2>
				<p>
					This removes the plant and its watering history from your local database. This cannot be
					undone.
				</p>
			</div>
			<div class="modal-actions">
				<button type="button" class="ghost-btn" onclick={() => (plantPendingDelete = null)}
					>Keep it</button
				>
				<button type="button" class="danger-btn" onclick={() => deletePlant(plantPendingDelete!)}>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.plants-page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.hero,
	.stats,
	.plant-card,
	.modal {
		border: 1px solid rgba(255, 255, 255, 0.09);
		background: rgba(255, 255, 255, 0.045);
		border-radius: 22px;
	}
	.hero {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: clamp(1.25rem, 4vw, 2rem);
		background:
			radial-gradient(circle at top right, rgba(34, 197, 94, 0.2), transparent 28rem),
			rgba(255, 255, 255, 0.045);
	}
	.eyebrow {
		margin: 0 0 0.5rem;
		color: rgba(255, 255, 255, 0.45);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	h1,
	h2,
	p {
		margin: 0;
	}
	h1 {
		font-size: clamp(2rem, 6vw, 4rem);
		letter-spacing: -0.05em;
	}
	.hero p,
	.plant-card p,
	.notes {
		color: rgba(255, 255, 255, 0.62);
		line-height: 1.55;
	}
	.hero-actions,
	.card-actions,
	.modal-actions {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.add-btn,
	.ghost-btn,
	.card-actions button {
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		padding: 0.65rem 0.9rem;
		color: #fff;
		cursor: pointer;
	}
	.add-btn {
		background: #16a34a;
		border-color: rgba(34, 197, 94, 0.45);
		font-weight: 800;
	}
	.danger-btn {
		border: 1px solid rgba(248, 113, 113, 0.35);
		border-radius: 999px;
		padding: 0.65rem 0.9rem;
		background: rgba(248, 113, 113, 0.16);
		color: #fecaca;
		cursor: pointer;
		font-weight: 800;
	}
	.danger-btn:hover {
		background: rgba(248, 113, 113, 0.24);
		color: #fff;
	}
	.ghost-btn,
	.card-actions button {
		background: rgba(255, 255, 255, 0.06);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
		padding: 0.85rem;
	}
	.stats div {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.8rem;
		border-radius: 16px;
		background: rgba(0, 0, 0, 0.16);
	}
	.stats strong {
		font-size: 1.35rem;
	}
	.stats span {
		color: rgba(255, 255, 255, 0.45);
		font-size: 0.75rem;
	}
	.plant-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 0.9rem;
	}
	.empty-card {
		grid-column: 1 / -1;
		padding: 2rem;
		border: 1px dashed rgba(255, 255, 255, 0.14);
		border-radius: 22px;
		color: rgba(255, 255, 255, 0.45);
		text-align: center;
	}
	.plant-card {
		position: relative;
		min-height: 340px;
		padding: 0;
		perspective: 1100px;
		box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18);
	}
	.plant-card-inner {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 340px;
		transition: transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1);
		transform-style: preserve-3d;
	}
	.plant-card.is-flipped .plant-card-inner {
		transform: rotateY(180deg);
	}
	.plant-card-face {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1rem;
		border-radius: 22px;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		background: rgba(255, 255, 255, 0.045);
	}
	.plant-card-back {
		transform: rotateY(180deg);
		background:
			radial-gradient(circle at top left, rgba(34, 197, 94, 0.18), transparent 18rem),
			rgba(255, 255, 255, 0.045);
	}
	.card-top {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.card-menu {
		display: flex;
		gap: 0.3rem;
		align-items: flex-start;
	}
	.icon-btn,
	.delete-btn {
		width: 1.65rem;
		height: 1.65rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.52);
		cursor: pointer;
		font-size: 0.9rem;
		line-height: 1;
	}
	.icon-btn:hover {
		color: #86efac;
		border-color: rgba(134, 239, 172, 0.3);
	}
	.delete-btn:hover {
		color: #fca5a5;
		border-color: rgba(252, 165, 165, 0.35);
	}
	.card-top h2 {
		font-size: 1.1rem;
	}
	.status-pill {
		height: fit-content;
		white-space: nowrap;
		padding: 0.24rem 0.55rem;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 800;
	}
	.status-overdue .status-pill {
		background: rgba(248, 113, 113, 0.2);
		color: #fca5a5;
	}
	.status-due .status-pill {
		background: rgba(251, 191, 36, 0.2);
		color: #fde68a;
	}
	.status-soon .status-pill {
		background: rgba(59, 130, 246, 0.2);
		color: #93c5fd;
	}
	.status-ok .status-pill {
		background: rgba(34, 197, 94, 0.16);
		color: #86efac;
	}
	.care-row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.55rem 0.65rem;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.16);
		font-size: 0.82rem;
	}
	.care-row span {
		color: rgba(255, 255, 255, 0.45);
	}
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.55rem;
	}
	.stat-grid div {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-height: 4.4rem;
		justify-content: center;
		padding: 0.7rem;
		border-radius: 14px;
		background: rgba(0, 0, 0, 0.18);
	}
	.stat-grid strong {
		font-size: 1.05rem;
	}
	.stat-grid span,
	.stats-note {
		color: rgba(255, 255, 255, 0.48);
		font-size: 0.74rem;
		line-height: 1.45;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.56);
		z-index: 300;
	}
	.modal {
		width: min(100%, 430px);
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 1.25rem;
		background: #141922;
	}
	.confirm-modal {
		width: min(100%, 390px);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		border: 1px solid rgba(248, 113, 113, 0.2);
		border-radius: 22px;
		background:
			radial-gradient(circle at top left, rgba(248, 113, 113, 0.14), transparent 18rem), #141922;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.52);
	}
	.confirm-modal p:not(.eyebrow) {
		color: rgba(255, 255, 255, 0.62);
		line-height: 1.6;
	}
	.confirm-icon {
		width: 2.4rem;
		height: 2.4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border: 1px solid rgba(248, 113, 113, 0.25);
		background: rgba(248, 113, 113, 0.14);
		color: #fca5a5;
		font-size: 1.35rem;
		font-weight: 800;
	}
	.modal label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		color: rgba(255, 255, 255, 0.66);
		font-size: 0.8rem;
		font-weight: 700;
	}
	.modal input,
	.modal select,
	.modal textarea {
		width: 100%;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.06);
		color: #fff;
		padding: 0.65rem 0.7rem;
		font: inherit;
	}
	.modal textarea {
		resize: vertical;
	}
	@media (max-width: 720px) {
		.hero,
		.stats {
			grid-template-columns: 1fr;
			flex-direction: column;
		}
		.stats {
			display: grid;
		}
	}
</style>

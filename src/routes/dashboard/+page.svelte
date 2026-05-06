<script lang="ts">
	import type { Category, Recurrence } from '$lib/domain';
	import type { PageData } from './$types';

	type PromotedSlot = 'major' | 'minor';

	interface BrainItem {
		id: number;
		text: string;
		category: Category;
		dateAdded: Date;
		deadline: Date | null;
		priority: number | null;
		project: string | null;
		completedAt: Date | null;
		archivedAt: Date | null;
		recurrence: Recurrence | null;
		promotedDate: string | null;
		promotedSlot: PromotedSlot | null;
	}

	interface Plant {
		id: number;
		name: string;
		species: string | null;
		nextWatering: Date;
	}

	let { data }: { data: PageData } = $props();
	let query = $state('');
	function mapBrainItem(item: PageData['items'][number]): BrainItem {
		return {
			...item,
			category: item.category as Category,
			dateAdded: new Date(item.dateAdded),
			deadline: item.deadline ? new Date(item.deadline) : null,
			completedAt: item.completedAt ? new Date(item.completedAt) : null,
			archivedAt: item.archivedAt ? new Date(item.archivedAt) : null,
			recurrence: item.recurrence as Recurrence | null,
			promotedSlot: item.promotedSlot as PromotedSlot | null
		};
	}

	let items = $derived<BrainItem[]>(data.items.map(mapBrainItem));
	let plants = $derived<Plant[]>(
		data.plants.map((plant) => ({
			...plant,
			nextWatering: new Date(plant.nextWatering)
		}))
	);

	const todayKey = new Date().toISOString().slice(0, 10);
	let activeItems = $derived(items.filter((item) => !item.completedAt && !item.archivedAt));
	let completedItems = $derived(
		items
			.filter((item) => item.completedAt)
			.sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))
			.slice(0, 8)
	);
	let archivedItems = $derived(
		items
			.filter((item) => item.archivedAt)
			.sort((a, b) => (b.archivedAt?.getTime() ?? 0) - (a.archivedAt?.getTime() ?? 0))
			.slice(0, 8)
	);
	let todayItems = $derived(
		activeItems.filter((item) => item.promotedDate === todayKey && item.promotedSlot)
	);
	let majorTask = $derived(todayItems.find((item) => item.promotedSlot === 'major') ?? null);
	let minorTasks = $derived(todayItems.filter((item) => item.promotedSlot === 'minor').slice(0, 2));
	let dueItems = $derived(
		activeItems
			.filter((item) => item.deadline && item.deadline.getTime() <= todayEndTime())
			.sort((a, b) => (a.deadline?.getTime() ?? 0) - (b.deadline?.getTime() ?? 0))
	);
	let duePlants = $derived(plants.filter((plant) => daysUntil(plant.nextWatering) <= 0));
	let searchResults = $derived(
		query.trim()
			? {
					brain: items.filter((item) => matchesItem(item, query)),
					plants: plants.filter((plant) => matchesPlant(plant, query))
				}
			: { brain: [], plants: [] }
	);

	function daysUntil(date: Date) {
		const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
		const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
	}

	function todayEndTime() {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
	}

	function fmt(date: Date | null) {
		return date?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? 'No date';
	}

	function matchesItem(item: BrainItem, value: string) {
		const haystack = [
			item.text,
			item.category,
			item.project,
			item.recurrence,
			item.priority ? `p${item.priority}` : ''
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase();
		return haystack.includes(value.toLowerCase());
	}

	function matchesPlant(plant: Plant, value: string) {
		return [plant.name, plant.species]
			.filter(Boolean)
			.join(' ')
			.toLowerCase()
			.includes(value.toLowerCase());
	}

	async function patchItem(id: number, body: Record<string, unknown>) {
		const response = await fetch(`/api/brain/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) return;

		const saved = mapBrainItem(await response.json());
		items = items.map((item) => (item.id === id ? saved : item));
	}

	function promote(item: BrainItem, slot: PromotedSlot) {
		patchItem(item.id, { promotedDate: todayKey, promotedSlot: slot });
	}

	function demote(item: BrainItem) {
		patchItem(item.id, { promotedDate: null, promotedSlot: null });
	}

	function complete(item: BrainItem) {
		patchItem(item.id, {
			completedAt: new Date().toISOString(),
			promotedDate: null,
			promotedSlot: null
		});
	}

	function archive(item: BrainItem) {
		patchItem(item.id, {
			archivedAt: new Date().toISOString(),
			promotedDate: null,
			promotedSlot: null
		});
	}

	function restore(item: BrainItem) {
		patchItem(item.id, { completedAt: null, archivedAt: null });
	}

	function setRecurrence(item: BrainItem, recurrence: Recurrence | null) {
		patchItem(item.id, { recurrence });
	}
</script>

<div class="dashboard">
	<header class="hero">
		<div>
			<p class="eyebrow">Today</p>
			<h1>Daily Dashboard</h1>
			<p>Pick one major task and two minor tasks, then work from a single view.</p>
		</div>
		<input bind:value={query} placeholder="Search brain and plants..." />
	</header>

	{#if query.trim()}
		<section class="panel search-panel">
			<h2>Search</h2>
			<div class="result-grid">
				<div>
					<h3>Brain</h3>
					{#each searchResults.brain as item (item.id)}
						<div class="mini-card">
							<span>{item.text}</span><small
								>{item.project ? `!${item.project}` : item.category}</small
							>
						</div>
					{/each}
				</div>
				<div>
					<h3>Plants</h3>
					{#each searchResults.plants as plant (plant.id)}
						<div class="mini-card">
							<span>{plant.name}</span><small>{fmt(plant.nextWatering)}</small>
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<section class="today-grid">
		<div class="panel major">
			<h2>Major</h2>
			{#if majorTask}{@render taskCard(majorTask)}{:else}<p class="empty">
					Promote one major task.
				</p>{/if}
		</div>
		<div class="panel">
			<h2>Minor</h2>
			{#each minorTasks as item (item.id)}{@render taskCard(item)}{/each}
			{#if minorTasks.length === 0}<p class="empty">Promote up to two minor tasks.</p>{/if}
		</div>
	</section>

	<section class="board">
		<div class="panel">
			<h2>Due Brain Items</h2>
			{#each dueItems as item (item.id)}
				<div class="task-row">
					<div>
						<strong>{item.text}</strong><span
							>{fmt(item.deadline)} {item.project ? ` · !${item.project}` : ''}</span
						>
					</div>
					<div class="row-actions">
						<button onclick={() => promote(item, 'major')}>Major</button><button
							onclick={() => promote(item, 'minor')}>Minor</button
						>
					</div>
				</div>
			{/each}
		</div>
		<div class="panel">
			<h2>Plants Due</h2>
			{#each duePlants as plant (plant.id)}
				<div class="task-row">
					<div>
						<strong>{plant.name}</strong><span
							>{daysUntil(plant.nextWatering) < 0 ? 'Overdue' : 'Due today'}</span
						>
					</div>
				</div>
			{/each}
		</div>
		<div class="panel">
			<h2>Promote Candidates</h2>
			{#each activeItems.filter((item) => !item.promotedDate).slice(0, 8) as item (item.id)}
				<div class="task-row">
					<div>
						<strong>{item.text}</strong><span
							>{item.project ? `!${item.project}` : item.category}</span
						>
					</div>
					<div class="row-actions">
						<button onclick={() => promote(item, 'major')}>Major</button><button
							onclick={() => promote(item, 'minor')}>Minor</button
						>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="board">
		<div class="panel">
			<h2>Evening Review</h2>
			<p class="empty">
				Completed today and recently archived items stay available here for restore.
			</p>
			{#each completedItems as item (item.id)}
				<div class="task-row">
					<div><strong>{item.text}</strong><span>Completed {fmt(item.completedAt)}</span></div>
					<div class="row-actions"><button onclick={() => restore(item)}>Restore</button></div>
				</div>
			{/each}
		</div>
		<div class="panel">
			<h2>Archive</h2>
			{#each archivedItems as item (item.id)}
				<div class="task-row">
					<div><strong>{item.text}</strong><span>Archived {fmt(item.archivedAt)}</span></div>
					<div class="row-actions"><button onclick={() => restore(item)}>Restore</button></div>
				</div>
			{/each}
		</div>
	</section>
</div>

{#snippet taskCard(item: BrainItem)}
	<article class="task-card">
		<strong>{item.text}</strong>
		<span
			>{item.project ? `!${item.project}` : item.category}
			{item.deadline ? ` · ${fmt(item.deadline)}` : ''}</span
		>
		<div class="row-actions">
			<button onclick={() => complete(item)}>Complete</button><button onclick={() => archive(item)}
				>Archive</button
			><button onclick={() => demote(item)}>Demote</button><button
				onclick={() => setRecurrence(item, item.recurrence ? null : 'weekly')}
				>{item.recurrence ? `Repeat ${item.recurrence}` : 'Repeat weekly'}</button
			>
		</div>
	</article>
{/snippet}

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.hero,
	.panel {
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 22px;
		background: rgba(255, 255, 255, 0.045);
	}
	.hero {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: clamp(1.25rem, 4vw, 2rem);
		background:
			radial-gradient(circle at top right, rgba(124, 58, 237, 0.2), transparent 28rem),
			rgba(255, 255, 255, 0.045);
	}
	.hero input {
		width: min(100%, 360px);
		height: 2.75rem;
		align-self: center;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.18);
		color: #fff;
		padding: 0 0.95rem;
	}
	.eyebrow {
		margin: 0 0 0.45rem;
		color: rgba(255, 255, 255, 0.45);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	h1,
	h2,
	h3,
	p {
		margin: 0;
	}
	h1 {
		font-size: clamp(2rem, 6vw, 4rem);
		letter-spacing: -0.05em;
	}
	.hero p,
	.empty,
	.task-card span,
	.task-row span,
	.mini-card small {
		color: rgba(255, 255, 255, 0.55);
	}
	.today-grid {
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 1rem;
	}
	.board,
	.result-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
	}
	.panel {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.task-card,
	.task-row,
	.mini-card {
		display: flex;
		gap: 0.7rem;
		padding: 0.75rem;
		border-radius: 14px;
		background: rgba(0, 0, 0, 0.18);
	}
	.task-card {
		flex-direction: column;
	}
	.task-row,
	.mini-card {
		justify-content: space-between;
		align-items: center;
	}
	.task-row div:first-child,
	.mini-card {
		min-width: 0;
	}
	.task-row strong,
	.mini-card span {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	button {
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.06);
		color: #fff;
		cursor: pointer;
		padding: 0.42rem 0.65rem;
		font-size: 0.75rem;
	}
	button:hover {
		background: rgba(255, 255, 255, 0.12);
	}
	@media (max-width: 760px) {
		.hero,
		.today-grid {
			grid-template-columns: 1fr;
			flex-direction: column;
		}
	}
</style>

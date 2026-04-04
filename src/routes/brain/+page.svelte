<script lang="ts">
	import type { PageData } from './$types';

	type Category = 'todo' | 'thought' | 'idea' | 'note';
	type OrderMode = 'freeform' | 'category' | 'date';

	interface BrainItem {
		id: number;
		text: string;
		category: Category;
		dateAdded: Date;
		x: number;
		y: number;
		rotation: number;
		baseX: number;
		baseY: number;
	}

	const CATEGORY_CONFIG: Record<Category, { color: string; bg: string; label: string; emoji: string }> = {
		todo: { color: '#ff8fab', bg: 'rgba(255, 107, 107, 0.12)', label: 'Todo', emoji: '✓' },
		thought: { color: '#74c0fc', bg: 'rgba(116, 192, 252, 0.12)', label: 'Thought', emoji: '💭' },
		idea: { color: '#ffd43b', bg: 'rgba(255, 212, 59, 0.12)', label: 'Idea', emoji: '💡' },
		note: { color: '#8ce99a', bg: 'rgba(140, 233, 154, 0.12)', label: 'Note', emoji: '📝' }
	};

	function rand(min: number, max: number) {
		return Math.random() * (max - min) + min;
	}

	let { data }: { data: PageData } = $props();

	// items is locally mutable (drag, add, delete) but stays in sync with
	// server data when the load function re-runs (e.g. same-route navigation).
	let items = $state<BrainItem[]>([]);
	$effect(() => {
		items = data.items.map((row) => ({
			...row,
			category: row.category as Category,
			dateAdded: new Date(row.dateAdded)
		}));
	});

	let containerEl: HTMLElement;
	let dragging: { id: number; offsetX: number; offsetY: number } | null = $state(null);
	let orderMode = $state<OrderMode>('freeform');
	let displacements = $state<Record<number, { x: number; y: number }>>({});
	let showAdd = $state(false);
	let newText = $state('');
	let newCategory = $state<Category>('thought');

	const REPEL_RADIUS = 15;
	const REPEL_STRENGTH = 10;

	function startDrag(e: MouseEvent, id: number) {
		if (orderMode !== 'freeform' || !containerEl) return;
		const item = items.find((i) => i.id === id)!;
		const rect = containerEl.getBoundingClientRect();
		dragging = {
			id,
			offsetX: item.x - ((e.clientX - rect.left) / rect.width) * 100,
			offsetY: item.y - ((e.clientY - rect.top) / rect.height) * 100
		};
		e.preventDefault();
	}

	function onMove(e: MouseEvent) {
		if (!dragging || !containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		const mx = ((e.clientX - rect.left) / rect.width) * 100;
		const my = ((e.clientY - rect.top) / rect.height) * 100;
		const nx = Math.max(1, Math.min(80, mx + dragging.offsetX));
		const ny = Math.max(1, Math.min(80, my + dragging.offsetY));

		const idx = items.findIndex((i) => i.id === dragging!.id);
		items[idx] = { ...items[idx], x: nx, y: ny };

		const newDisp: Record<number, { x: number; y: number }> = {};
		for (const item of items) {
			if (item.id === dragging!.id) continue;
			const dx = item.x - nx;
			const dy = item.y - ny;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < REPEL_RADIUS && dist > 0.1) {
				const force = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * REPEL_STRENGTH;
				newDisp[item.id] = { x: (dx / dist) * force, y: (dy / dist) * force };
			} else {
				newDisp[item.id] = { x: 0, y: 0 };
			}
		}
		displacements = newDisp;
	}

	function stopDrag() {
		if (!dragging) return;
		const id = dragging.id;
		dragging = null;

		// Collect all items whose positions changed
		const toSave: { id: number; x: number; y: number }[] = [];

		items = items.map((item) => {
			if (item.id === id) {
				toSave.push({ id: item.id, x: item.x, y: item.y });
				return { ...item, baseX: item.x, baseY: item.y };
			}
			const d = displacements[item.id] ?? { x: 0, y: 0 };
			if (Math.abs(d.x) > 0.05 || Math.abs(d.y) > 0.05) {
				const nx = Math.max(1, Math.min(80, item.x + d.x));
				const ny = Math.max(1, Math.min(80, item.y + d.y));
				toSave.push({ id: item.id, x: nx, y: ny });
				return { ...item, x: nx, y: ny, baseX: nx, baseY: ny };
			}
			return item;
		});
		displacements = {};

		// Fire-and-forget — UI is already updated, no need to await
		for (const { id: itemId, x, y } of toSave) {
			fetch(`/api/brain/${itemId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ x, y, baseX: x, baseY: y })
			});
		}
	}

	function setOrder(mode: OrderMode) {
		orderMode = mode;
		displacements = {};
		if (mode === 'freeform') {
			items = items.map((i) => ({ ...i, x: i.baseX, y: i.baseY }));
			return;
		}
		let sorted = [...items];
		if (mode === 'category') {
			const order: Category[] = ['todo', 'idea', 'thought', 'note'];
			sorted.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
		} else {
			sorted.sort((a, b) => a.dateAdded.getTime() - b.dateAdded.getTime());
		}
		const cols = 4;
		items = sorted.map((item, i) => ({
			...item,
			x: 2 + (i % cols) * 24,
			y: 6 + Math.floor(i / cols) * 26,
			rotation: 0
		}));
	}

	async function addItem() {
		if (!newText.trim()) return;
		const x = rand(2, 70);
		const y = rand(4, 65);
		const rotation = rand(-7, 7);

		const res = await fetch('/api/brain', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text: newText.trim(), category: newCategory, x, y, rotation })
		});

		const saved = await res.json();
		items = [
			...items,
			{
				id: saved.id,
				text: saved.text,
				category: saved.category as Category,
				dateAdded: new Date(saved.dateAdded),
				x: saved.x,
				y: saved.y,
				rotation: saved.rotation,
				baseX: saved.baseX,
				baseY: saved.baseY
			}
		];

		newText = '';
		showAdd = false;
	}

	function deleteItem(id: number) {
		items = items.filter((i) => i.id !== id);
		fetch(`/api/brain/${id}`, { method: 'DELETE' });
	}

	function fmt(d: Date) {
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<svelte:window onmousemove={onMove} onmouseup={stopDrag} />

<div class="page">
	<div class="toolbar">
		<div class="title">🧠 Brain</div>
		<div class="order-btns">
			<span class="arrange-label">Arrange by</span>
			<button class:active={orderMode === 'freeform'} onclick={() => setOrder('freeform')}>Freeform</button>
			<button class:active={orderMode === 'category'} onclick={() => setOrder('category')}>Category</button>
			<button class:active={orderMode === 'date'} onclick={() => setOrder('date')}>Date</button>
		</div>
		<button class="add-btn" onclick={() => (showAdd = true)}>＋ Add</button>
	</div>

	<div class="brain" bind:this={containerEl}>
		<div class="glow glow-a"></div>
		<div class="glow glow-b"></div>
		<div class="glow glow-c"></div>

		{#if items.length === 0}
			<div class="empty-state">
				<p>Your brain is empty.</p>
				<p>Add a thought to get started.</p>
			</div>
		{/if}

		{#each items as item (item.id)}
			{@const cfg = CATEGORY_CONFIG[item.category]}
			{@const d = displacements[item.id] ?? { x: 0, y: 0 }}
			{@const isDrag = dragging?.id === item.id}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				class="card"
				class:is-dragging={isDrag}
				class:is-ordered={orderMode !== 'freeform'}
				style:left="{item.x + d.x}%"
				style:top="{item.y + d.y}%"
				style:transform="rotate({isDrag ? 0 : item.rotation}deg) scale({isDrag ? 1.07 : 1})"
				style:background={cfg.bg}
				style:border-color="{cfg.color}55"
				style:--accent={cfg.color}
				style:z-index={isDrag ? 100 : 1}
				onmousedown={(e) => startDrag(e, item.id)}
				role="button"
			>
				<div class="card-header">
					<div class="card-tag" style:color={cfg.color}>{cfg.emoji} {cfg.label}</div>
					<button
						class="delete-btn"
						onclick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
						aria-label="Delete item"
					>×</button>
				</div>
				<p class="card-text">{item.text}</p>
				<div class="card-date">{fmt(item.dateAdded)}</div>
			</div>
		{/each}
	</div>
</div>

{#if showAdd}
	<div
		class="backdrop"
		role="button"
		tabindex="-1"
		onclick={() => (showAdd = false)}
		onkeydown={(e) => e.key === 'Escape' && (showAdd = false)}
	>
		<div
			class="modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={() => {}}
			role="dialog"
			aria-modal="true"
			aria-label="Add a thought"
			tabindex="0"
		>
			<h2>Add to Brain</h2>
			<div class="cat-picker">
				{#each Object.entries(CATEGORY_CONFIG) as [cat, cfg] (cat)}
					<button
						class="cat-btn"
						class:selected={newCategory === cat}
						style:--accent={cfg.color}
						onclick={() => (newCategory = cat as Category)}
					>{cfg.emoji} {cfg.label}</button>
				{/each}
			</div>
			<textarea
				bind:value={newText}
				placeholder="What's on your mind?"
				rows={3}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						addItem();
					}
				}}
			></textarea>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => (showAdd = false)}>Cancel</button>
				<button class="btn-add" onclick={addItem} disabled={!newText.trim()}>Add</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.page {
		height: calc(100vh - 2.5rem);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* ── Toolbar ── */
	.toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		backdrop-filter: blur(10px);
		flex-shrink: 0;
	}

	.title {
		font-size: 1.15rem;
		font-weight: 700;
		color: #fff;
		margin-right: auto;
		letter-spacing: -0.01em;
	}

	.arrange-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
		margin-right: 0.2rem;
	}

	.order-btns {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.order-btns button {
		padding: 0.28rem 0.7rem;
		border-radius: 20px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: transparent;
		color: rgba(255, 255, 255, 0.55);
		cursor: pointer;
		font-size: 0.78rem;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
	}

	.order-btns button:hover {
		background: rgba(255, 255, 255, 0.08);
		color: #fff;
	}

	.order-btns button.active {
		background: rgba(255, 255, 255, 0.14);
		color: #fff;
		border-color: rgba(255, 255, 255, 0.28);
	}

	.add-btn {
		padding: 0.32rem 0.9rem;
		border-radius: 20px;
		border: 1px solid rgba(255, 255, 255, 0.25);
		background: rgba(255, 255, 255, 0.07);
		color: #fff;
		cursor: pointer;
		font-size: 0.82rem;
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.add-btn:hover {
		background: rgba(255, 255, 255, 0.14);
		border-color: rgba(255, 255, 255, 0.4);
	}

	/* ── Brain canvas ── */
	.brain {
		flex: 1;
		position: relative;
		border-radius: 20px;
		background: rgba(0, 0, 0, 0.22);
		border: 1px solid rgba(255, 255, 255, 0.07);
		overflow: hidden;
	}

	.glow {
		position: absolute;
		border-radius: 50%;
		pointer-events: none;
		opacity: 0.18;
	}

	.glow-a {
		width: 500px;
		height: 500px;
		background: radial-gradient(circle, #7c3aed 0%, transparent 70%);
		top: -180px;
		left: -120px;
		filter: blur(60px);
	}

	.glow-b {
		width: 350px;
		height: 350px;
		background: radial-gradient(circle, #1d4ed8 0%, transparent 70%);
		bottom: -100px;
		right: -80px;
		filter: blur(50px);
	}

	.glow-c {
		width: 250px;
		height: 250px;
		background: radial-gradient(circle, #0e7490 0%, transparent 70%);
		bottom: 20%;
		left: 40%;
		filter: blur(60px);
		opacity: 0.1;
	}

	/* ── Empty state ── */
	.empty-state {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		pointer-events: none;
	}

	.empty-state p {
		margin: 0;
		color: rgba(255, 255, 255, 0.2);
		font-size: 0.9rem;
	}

	.empty-state p:first-child {
		font-weight: 600;
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.3);
	}

	/* ── Cards ── */
	.card {
		position: absolute;
		width: 175px;
		padding: 0.7rem 0.8rem;
		border-radius: 12px;
		border: 1px solid;
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		cursor: grab;
		user-select: none;
		transition:
			left 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94),
			top 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94),
			transform 0.2s ease,
			box-shadow 0.2s ease;
		box-shadow:
			0 4px 16px rgba(0, 0, 0, 0.35),
			inset 0 1px 0 rgba(255, 255, 255, 0.06);
	}

	.card:hover:not(.is-dragging) {
		box-shadow:
			0 8px 28px rgba(0, 0, 0, 0.45),
			0 0 0 1px var(--accent),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
	}

	.card:hover .delete-btn {
		opacity: 1;
	}

	.card.is-dragging {
		cursor: grabbing;
		transition:
			transform 0.1s ease,
			box-shadow 0.1s ease;
		box-shadow:
			0 20px 50px rgba(0, 0, 0, 0.6),
			0 0 0 1.5px var(--accent),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
	}

	.card.is-ordered {
		cursor: default;
		transition:
			left 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
			top 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
			transform 0.45s ease,
			box-shadow 0.2s ease;
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.45rem;
	}

	.card-tag {
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.09em;
	}

	.delete-btn {
		opacity: 0;
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.35);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		padding: 0;
		transition:
			opacity 0.15s,
			color 0.15s;
	}

	.delete-btn:hover {
		color: #ff8fab;
	}

	.card-text {
		margin: 0 0 0.5rem;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.82);
		line-height: 1.45;
	}

	.card-date {
		font-size: 0.62rem;
		color: rgba(255, 255, 255, 0.3);
	}

	/* ── Add modal ── */
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(5px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 300;
	}

	.modal {
		background: #16162a;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1.5rem;
		width: 360px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
	}

	.modal h2 {
		margin: 0;
		font-size: 1.05rem;
		color: #fff;
		font-weight: 600;
	}

	.cat-picker {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.cat-btn {
		padding: 0.28rem 0.7rem;
		border-radius: 20px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: transparent;
		color: rgba(255, 255, 255, 0.55);
		cursor: pointer;
		font-size: 0.78rem;
		transition:
			border-color 0.15s,
			color 0.15s,
			background 0.15s;
	}

	.cat-btn.selected {
		border-color: var(--accent);
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, transparent);
	}

	.modal textarea {
		width: 100%;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.7rem 0.8rem;
		color: #fff;
		font-size: 0.88rem;
		resize: none;
		font-family: inherit;
		box-sizing: border-box;
		transition: border-color 0.15s;
	}

	.modal textarea:focus {
		outline: none;
		border-color: rgba(255, 255, 255, 0.22);
	}

	.modal textarea::placeholder {
		color: rgba(255, 255, 255, 0.3);
	}

	.modal-footer {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.btn-cancel {
		padding: 0.4rem 1rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: transparent;
		color: rgba(255, 255, 255, 0.55);
		cursor: pointer;
		font-size: 0.83rem;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.btn-cancel:hover {
		background: rgba(255, 255, 255, 0.06);
		color: #fff;
	}

	.btn-add {
		padding: 0.4rem 1.1rem;
		border-radius: 8px;
		border: none;
		background: #7c3aed;
		color: #fff;
		cursor: pointer;
		font-size: 0.83rem;
		font-weight: 600;
		transition: background 0.15s;
	}

	.btn-add:hover:not(:disabled) {
		background: #6d28d9;
	}

	.btn-add:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
</style>

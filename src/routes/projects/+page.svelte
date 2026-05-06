<script lang="ts">
	import type { ProjectColumn } from '$lib/domain';
	import type { PageData } from './$types';

	type PromotedSlot = 'major' | 'minor';

	interface Item {
		id: number;
		text: string;
		category: string;
		project: string | null;
		deadline: Date | null;
		priority: number | null;
		completedAt: Date | null;
		archivedAt: Date | null;
		projectColumn: ProjectColumn | null;
		promotedDate: string | null;
		promotedSlot: PromotedSlot | null;
	}

	const COLUMNS: { id: ProjectColumn; label: string }[] = [
		{ id: 'backlog', label: 'Backlog' },
		{ id: 'next', label: 'Next' },
		{ id: 'doing', label: 'Doing' },
		{ id: 'done', label: 'Done' }
	];

	let { data }: { data: PageData } = $props();
	function mapItem(item: PageData['items'][number]): Item {
		return {
			...item,
			deadline: item.deadline ? new Date(item.deadline) : null,
			completedAt: item.completedAt ? new Date(item.completedAt) : null,
			archivedAt: item.archivedAt ? new Date(item.archivedAt) : null,
			projectColumn: item.projectColumn as ProjectColumn | null,
			promotedSlot: item.promotedSlot as PromotedSlot | null
		};
	}

	let items = $derived<Item[]>(data.items.map(mapItem));
	let projects = $derived(
		Array.from(new Set(items.map((item) => item.project).filter(Boolean) as string[])).sort()
	);

	function projectItems(project: string) {
		return items.filter((item) => item.project === project && !item.archivedAt);
	}

	function lane(items: Item[], column: ProjectColumn) {
		return items.filter((item) => (item.projectColumn ?? 'backlog') === column);
	}

	async function moveItem(id: number, projectColumn: ProjectColumn) {
		const previousItems = items;
		items = items.map((item) => (item.id === id ? { ...item, projectColumn } : item));
		const response = await fetch(`/api/brain/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ projectColumn })
		});
		if (!response.ok) {
			items = previousItems;
			return;
		}
		const saved = mapItem(await response.json());
		items = items.map((item) => (item.id === id ? saved : item));
	}

	async function archiveItem(id: number) {
		const previousItems = items;
		const archivedAt = new Date().toISOString();
		items = items.map((item) =>
			item.id === id ? { ...item, archivedAt: new Date(archivedAt) } : item
		);
		const response = await fetch(`/api/brain/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ archivedAt })
		});
		if (!response.ok) {
			items = previousItems;
			return;
		}
		const saved = mapItem(await response.json());
		items = items.map((item) => (item.id === id ? saved : item));
	}

	function onDragStart(e: DragEvent, item: Item) {
		e.dataTransfer?.setData('text/plain', String(item.id));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onDrop(e: DragEvent, column: ProjectColumn) {
		e.preventDefault();
		const id = Number(e.dataTransfer?.getData('text/plain'));
		if (!id) return;
		moveItem(id, column);
	}

	function fmt(date: Date | null) {
		return date?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? '';
	}
</script>

<div class="projects-page">
	<header class="hero">
		<p class="eyebrow">Projects</p>
		<h1>Project Boards</h1>
		<p>Every `!project` from Brain becomes a lightweight board. Drag cards between columns.</p>
	</header>

	{#if projects.length === 0}
		<section class="empty">Add `!project-name` to a brain item to create a project board.</section>
	{/if}

	{#each projects as project (project)}
		{@const scoped = projectItems(project)}
		<section class="project-board">
			<div class="project-heading">
				<div>
					<p class="eyebrow">!{project}</p>
					<h2>{project}</h2>
				</div>
				<span>{scoped.filter((item) => !item.completedAt && !item.archivedAt).length} open</span>
			</div>
			<div class="lanes">
				{#each COLUMNS as column (column.id)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="lane"
						ondragover={(e) => e.preventDefault()}
						ondrop={(e) => onDrop(e, column.id)}
					>
						<h3>{column.label}</h3>
						{#each lane(scoped, column.id) as item (item.id)}
							<article
								class="project-card"
								draggable="true"
								ondragstart={(e) => onDragStart(e, item)}
							>
								<strong>{item.text}</strong>
								<span
									>{item.deadline ? fmt(item.deadline) : item.category}{item.priority
										? ` · P${item.priority}`
										: ''}</span
								>
								<div class="move-actions">
									{#each COLUMNS as target (target.id)}
										{#if target.id !== column.id}
											<button onclick={() => moveItem(item.id, target.id)}>{target.label}</button>
										{/if}
									{/each}
									{#if column.id === 'done'}
										<button class="archive-action" onclick={() => archiveItem(item.id)}
											>Archive</button
										>
									{/if}
								</div>
							</article>
						{/each}
					</div>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.projects-page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.hero,
	.project-board,
	.empty {
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 22px;
		background: rgba(255, 255, 255, 0.045);
	}
	.hero {
		padding: clamp(1.25rem, 4vw, 2rem);
		background:
			radial-gradient(circle at top right, rgba(59, 130, 246, 0.2), transparent 28rem),
			rgba(255, 255, 255, 0.045);
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
	.project-card span,
	.project-heading span,
	.empty {
		color: rgba(255, 255, 255, 0.56);
	}
	.project-board {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.project-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
	}
	.lanes {
		display: grid;
		grid-template-columns: repeat(4, minmax(180px, 1fr));
		gap: 0.75rem;
		overflow-x: auto;
	}
	.lane {
		min-height: 12rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.7rem;
		border-radius: 16px;
		background: rgba(0, 0, 0, 0.18);
	}
	.lane h3 {
		color: rgba(255, 255, 255, 0.55);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.project-card {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.7rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.06);
		cursor: grab;
	}
	.project-card:active {
		cursor: grabbing;
	}
	.move-actions {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
		opacity: 0;
		transition: opacity 0.15s ease;
	}
	.project-card:hover .move-actions,
	.project-card:focus-within .move-actions {
		opacity: 1;
	}
	.move-actions button {
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.62);
		cursor: pointer;
		font-size: 0.66rem;
		padding: 0.22rem 0.45rem;
	}
	.move-actions button:hover {
		background: rgba(255, 255, 255, 0.13);
		color: #fff;
	}
	.move-actions .archive-action {
		border-color: rgba(251, 191, 36, 0.18);
		color: #fde68a;
	}
	.move-actions .archive-action:hover {
		background: rgba(251, 191, 36, 0.16);
	}
	.empty {
		padding: 1.5rem;
		text-align: center;
	}
</style>

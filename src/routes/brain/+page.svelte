<script lang="ts">
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import type { PageData } from './$types';

	type Category = 'todo' | 'thought' | 'idea' | 'note';
	type OrderMode = 'freeform' | 'category' | 'date' | 'priority' | 'deadline';
	type Priority = 1 | 2 | 3;

	interface BrainItem {
		id: number;
		text: string;
		category: Category;
		dateAdded: Date;
		deadline: Date | null;
		priority: Priority | null;
		project: string | null;
		x: number;
		y: number;
		rotation: number;
		baseX: number;
		baseY: number;
	}

	const CATEGORY_CONFIG: Record<
		Category,
		{ color: string; bg: string; label: string; emoji: string }
	> = {
		todo: { color: '#ff8fab', bg: 'rgba(255, 107, 107, 0.12)', label: 'Todo', emoji: '✓' },
		thought: { color: '#74c0fc', bg: 'rgba(116, 192, 252, 0.12)', label: 'Thought', emoji: '💭' },
		idea: { color: '#ffd43b', bg: 'rgba(255, 212, 59, 0.12)', label: 'Idea', emoji: '💡' },
		note: { color: '#8ce99a', bg: 'rgba(140, 233, 154, 0.12)', label: 'Note', emoji: '📝' }
	};
	const WEEKDAYS: Record<string, number> = {
		sunday: 0,
		monday: 1,
		tuesday: 2,
		wednesday: 3,
		thursday: 4,
		friday: 5,
		saturday: 6
	};
	const DEADLINE_PATTERN =
		/(?:^|\s)@(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi;
	const PRIORITY_PATTERN = /(?:^|\s)p([123])\b/gi;
	const CATEGORY_PATTERN = /(?:^|\s)#(todo|thought|idea|note)\b/gi;
	const PROJECT_PATTERN = /(?:^|\s)!([a-z0-9_-]{1,40})\b/gi;

	function rand(min: number, max: number) {
		return Math.random() * (max - min) + min;
	}

	let { data }: { data: PageData } = $props();

	let items = $derived<BrainItem[]>(
		data.items.map((row) => ({
			...row,
			category: row.category as Category,
			dateAdded: new Date(row.dateAdded),
			deadline: row.deadline ? new Date(row.deadline) : null,
			priority: row.priority as Priority | null
		}))
	);

	let containerEl: HTMLElement;
	let dragging: { id: number; offsetX: number; offsetY: number } | null = $state(null);
	let panning: { startX: number; startY: number; originX: number; originY: number } | null =
		$state(null);
	let pan = $state({ x: 0, y: 0 });
	let zoom = $state(1);
	let orderMode = $state<OrderMode>('freeform');
	let displacements = $state<Record<number, { x: number; y: number }>>({});
	let showAdd = $state(false);
	let newTextEl = $state<HTMLTextAreaElement>();
	let newText = $state('');
	let newCategory = $state<Category>('thought');
	let newDeadline = $state<Date | null>(null);
	let newPriority = $state<Priority | null>(null);
	let newProject = $state<string | null>(null);
	let projectQuery = $state<string | null>(null);
	let projectTokenStart = $state<number | null>(null);
	let selectedProjectIndex = $state(0);
	let existingProjects = $derived(
		Array.from(
			new Set(items.map((item) => item.project).filter((project) => project !== null))
		).sort()
	);
	let projectSuggestions = $derived(
		projectQuery === null
			? []
			: existingProjects.filter((project) => project.startsWith(projectQuery ?? '')).slice(0, 8)
	);

	$effect(() => {
		if (!showAdd) return;
		tick().then(() => newTextEl?.focus());
	});

	$effect(() => {
		if (page.url.searchParams.get('add') === '1') showAdd = true;
	});

	$effect(() => {
		window.addEventListener('open-brain-add', openAddModal);
		return () => window.removeEventListener('open-brain-add', openAddModal);
	});

	const REPEL_RADIUS = 15;
	const REPEL_STRENGTH = 10;
	const MIN_ZOOM = 0.28;
	const MAX_ZOOM = 2.2;
	const CARD_WIDTH = 175;
	const CARD_HEIGHT = 160;
	const FIT_PADDING = 40;
	const SPAWN_GAP = 24;

	function clamp(value: number, min: number, max: number) {
		return Math.max(min, Math.min(max, value));
	}

	function screenToWorldPercent(e: MouseEvent) {
		const rect = containerEl.getBoundingClientRect();
		return {
			x: ((e.clientX - rect.left - pan.x) / zoom / rect.width) * 100,
			y: ((e.clientY - rect.top - pan.y) / zoom / rect.height) * 100
		};
	}

	function setZoom(nextZoom: number, centerX?: number, centerY?: number) {
		if (!containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		const next = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
		const cx = centerX ?? rect.left + rect.width / 2;
		const cy = centerY ?? rect.top + rect.height / 2;
		const worldX = (cx - rect.left - pan.x) / zoom;
		const worldY = (cy - rect.top - pan.y) / zoom;

		pan = {
			x: cx - rect.left - worldX * next,
			y: cy - rect.top - worldY * next
		};
		zoom = next;
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const scale = e.deltaY > 0 ? 0.9 : 1.1;
		setZoom(zoom * scale, e.clientX, e.clientY);
	}

	function startPan(e: MouseEvent) {
		if (e.button !== 0 || dragging) return;
		panning = { startX: e.clientX, startY: e.clientY, originX: pan.x, originY: pan.y };
		e.preventDefault();
	}

	function fitAll() {
		if (!containerEl || items.length === 0) {
			resetView();
			return;
		}

		const rect = containerEl.getBoundingClientRect();
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const item of items) {
			const d = displacements[item.id] ?? { x: 0, y: 0 };
			const x = ((item.x + d.x) / 100) * rect.width;
			const y = ((item.y + d.y) / 100) * rect.height;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x + CARD_WIDTH);
			maxY = Math.max(maxY, y + CARD_HEIGHT);
		}

		const contentWidth = maxX - minX;
		const contentHeight = maxY - minY;
		const nextZoom = clamp(
			Math.min(
				1,
				(rect.width - FIT_PADDING * 2) / contentWidth,
				(rect.height - FIT_PADDING * 2) / contentHeight
			),
			MIN_ZOOM,
			MAX_ZOOM
		);

		pan = {
			x: (rect.width - contentWidth * nextZoom) / 2 - minX * nextZoom,
			y: (rect.height - contentHeight * nextZoom) / 2 - minY * nextZoom
		};
		zoom = nextZoom;
	}

	function resetView() {
		pan = { x: 0, y: 0 };
		zoom = 1;
	}

	function visibleWorldBounds() {
		const rect = containerEl.getBoundingClientRect();
		return {
			left: (-pan.x / zoom / rect.width) * 100,
			top: (-pan.y / zoom / rect.height) * 100,
			right: ((rect.width - pan.x) / zoom / rect.width) * 100,
			bottom: ((rect.height - pan.y) / zoom / rect.height) * 100
		};
	}

	function cardSizePercent() {
		const rect = containerEl.getBoundingClientRect();
		return {
			width: ((CARD_WIDTH + SPAWN_GAP) / rect.width) * 100,
			height: ((CARD_HEIGHT + SPAWN_GAP) / rect.height) * 100
		};
	}

	function cardsOverlap(
		a: { x: number; y: number; width: number; height: number },
		b: { x: number; y: number; width: number; height: number }
	) {
		return !(
			a.x + a.width <= b.x ||
			b.x + b.width <= a.x ||
			a.y + a.height <= b.y ||
			b.y + b.height <= a.y
		);
	}

	function isSpawnOpen(x: number, y: number, width: number, height: number) {
		const candidate = { x, y, width, height };
		return items.every((item) => {
			const d = displacements[item.id] ?? { x: 0, y: 0 };
			return !cardsOverlap(candidate, { x: item.x + d.x, y: item.y + d.y, width, height });
		});
	}

	function findSpawnInBounds(
		bounds: { left: number; top: number; right: number; bottom: number },
		width: number,
		height: number
	) {
		const centerX = (bounds.left + bounds.right) / 2;
		const centerY = (bounds.top + bounds.bottom) / 2;
		const minX = bounds.left + 2;
		const minY = bounds.top + 2;
		const maxX = bounds.right - width - 2;
		const maxY = bounds.bottom - height - 2;
		const candidates: { x: number; y: number; distance: number }[] = [];

		if (maxX < minX || maxY < minY) {
			const x = centerX - width / 2;
			const y = centerY - height / 2;
			if (isSpawnOpen(x, y, width, height)) return { x, y };
			return null;
		}

		const stepX = Math.max(width * 0.7, 8);
		const stepY = Math.max(height * 0.7, 10);
		for (let y = minY; y <= maxY; y += stepY) {
			for (let x = minX; x <= maxX; x += stepX) {
				candidates.push({ x, y, distance: Math.hypot(x - centerX, y - centerY) });
			}
		}

		candidates.push({
			x: centerX - width / 2,
			y: centerY - height / 2,
			distance: 0
		});
		candidates.sort((a, b) => a.distance - b.distance);

		return (
			candidates.find((candidate) => isSpawnOpen(candidate.x, candidate.y, width, height)) ?? null
		);
	}

	function pickSpawnPosition() {
		if (!containerEl) return { x: rand(2, 70), y: rand(4, 65), shouldFocus: false };

		const bounds = visibleWorldBounds();
		const size = cardSizePercent();
		const visibleSpawn = findSpawnInBounds(bounds, size.width, size.height);
		if (visibleSpawn) return { ...visibleSpawn, shouldFocus: false };

		const visibleWidth = bounds.right - bounds.left;
		const visibleHeight = bounds.bottom - bounds.top;
		const centerX = (bounds.left + bounds.right) / 2;
		const centerY = (bounds.top + bounds.bottom) / 2;

		for (let ring = 1; ring <= 60; ring += 1) {
			const expanded = {
				left: centerX - visibleWidth / 2 - ring * size.width,
				top: centerY - visibleHeight / 2 - ring * size.height,
				right: centerX + visibleWidth / 2 + ring * size.width,
				bottom: centerY + visibleHeight / 2 + ring * size.height
			};
			const spawn = findSpawnInBounds(expanded, size.width, size.height);
			if (spawn) return { ...spawn, shouldFocus: true };
		}

		return { x: centerX, y: bounds.bottom + size.height, shouldFocus: true };
	}

	function focusSpawnedCard(x: number, y: number) {
		if (!containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		pan = {
			x: rect.width / 2 - ((x / 100) * rect.width + CARD_WIDTH / 2) * zoom,
			y: rect.height / 2 - ((y / 100) * rect.height + CARD_HEIGHT / 2) * zoom
		};
	}

	function openAddModal() {
		showAdd = true;
	}

	function dateAtNoon(date: Date) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
	}

	function addDays(date: Date, days: number) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
	}

	function deadlineFromToken(token: string) {
		const normalized = token.toLowerCase();
		const today = dateAtNoon(new Date());
		if (normalized === 'today') return today;
		if (normalized === 'tomorrow') return addDays(today, 1);

		const targetDay = WEEKDAYS[normalized];
		let daysUntil = (targetDay - today.getDay() + 7) % 7;
		if (daysUntil === 0) daysUntil = 7;
		return addDays(today, daysUntil);
	}

	function parseDraft(value: string) {
		const categoryMatch = value.match(/(?:^|\s)#(todo|thought|idea|note)\b/i);
		const priorityMatch = value.match(/(?:^|\s)p([123])\b/i);
		const deadlineMatch = value.match(
			/(?:^|\s)@(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
		);
		const projectMatch = value.match(/(?:^|\s)!([a-z0-9_-]{1,40})\b/i);

		return {
			category: categoryMatch ? (categoryMatch[1].toLowerCase() as Category) : null,
			priority: priorityMatch ? (Number(priorityMatch[1]) as Priority) : null,
			deadline: deadlineMatch ? deadlineFromToken(deadlineMatch[1]) : null,
			project: projectMatch ? projectMatch[1].toLowerCase() : null,
			text: value
				.replace(CATEGORY_PATTERN, ' ')
				.replace(PRIORITY_PATTERN, ' ')
				.replace(DEADLINE_PATTERN, ' ')
				.replace(PROJECT_PATTERN, ' ')
				.replace(/\s+/g, ' ')
				.trim()
		};
	}

	function updateProjectAutocomplete(cursor: number) {
		const beforeCursor = newText.slice(0, cursor);
		const match = beforeCursor.match(/(?:^|\s)!([a-z0-9_-]*)$/i);
		if (!match || match.index === undefined) {
			projectQuery = null;
			projectTokenStart = null;
			selectedProjectIndex = 0;
			return;
		}

		const nextQuery = match[1].toLowerCase();
		const nextTokenStart = match.index + match[0].indexOf('!');
		const queryChanged = projectQuery !== nextQuery || projectTokenStart !== nextTokenStart;

		projectQuery = nextQuery;
		projectTokenStart = nextTokenStart;
		if (queryChanged) selectedProjectIndex = 0;
	}

	function updateDraftText(value: string) {
		newText = value;
		const parsed = parseDraft(value);
		if (parsed.category) newCategory = parsed.category;
		newPriority = parsed.priority;
		newDeadline = parsed.deadline;
		newProject = parsed.project;
	}

	function handleDraftInput(e: Event) {
		const textarea = e.currentTarget as HTMLTextAreaElement;
		updateDraftText(textarea.value);
		updateProjectAutocomplete(textarea.selectionStart);
	}

	function confirmProjectSuggestion(project: string) {
		if (projectTokenStart === null || !newTextEl) return;
		const cursor = newTextEl.selectionStart;
		const before = newText.slice(0, projectTokenStart);
		const after = newText.slice(cursor);
		const nextText = `${before}!${project} ${after}`;
		const nextCursor = before.length + project.length + 2;

		updateDraftText(nextText);
		projectQuery = null;
		projectTokenStart = null;
		selectedProjectIndex = 0;
		tick().then(() => {
			newTextEl?.focus();
			newTextEl?.setSelectionRange(nextCursor, nextCursor);
		});
	}

	function onDraftKeydown(e: KeyboardEvent) {
		if (projectQuery !== null && projectSuggestions.length > 0) {
			if (e.ctrlKey && e.key.toLowerCase() === 'n') {
				e.preventDefault();
				selectedProjectIndex = (selectedProjectIndex + 1) % projectSuggestions.length;
				return;
			}
			if (e.ctrlKey && e.key.toLowerCase() === 'p') {
				e.preventDefault();
				selectedProjectIndex =
					(selectedProjectIndex - 1 + projectSuggestions.length) % projectSuggestions.length;
				return;
			}
			if (e.key === 'Enter') {
				e.preventDefault();
				confirmProjectSuggestion(projectSuggestions[selectedProjectIndex]);
				return;
			}
		}

		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			addItem();
		}
	}

	function startDrag(e: MouseEvent, id: number) {
		if (orderMode !== 'freeform' || !containerEl) return;
		const item = items.find((i) => i.id === id)!;
		const pointer = screenToWorldPercent(e);
		dragging = {
			id,
			offsetX: item.x - pointer.x,
			offsetY: item.y - pointer.y
		};
		panning = null;
		e.stopPropagation();
		e.preventDefault();
	}

	function onMove(e: MouseEvent) {
		if (panning) {
			pan = {
				x: panning.originX + e.clientX - panning.startX,
				y: panning.originY + e.clientY - panning.startY
			};
			return;
		}

		if (!dragging || !containerEl) return;
		const pointer = screenToWorldPercent(e);
		const mx = pointer.x;
		const my = pointer.y;
		const nx = Math.max(1, Math.min(80, mx + dragging.offsetX));
		const ny = Math.max(1, Math.min(80, my + dragging.offsetY));

		items = items.map((item) => (item.id === dragging!.id ? { ...item, x: nx, y: ny } : item));

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
		panning = null;
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
		} else if (mode === 'priority') {
			sorted.sort((a, b) => {
				const ap = a.priority ?? 99;
				const bp = b.priority ?? 99;
				return ap - bp || b.dateAdded.getTime() - a.dateAdded.getTime();
			});
		} else if (mode === 'deadline') {
			sorted.sort((a, b) => {
				const ad = a.deadline?.getTime() ?? Infinity;
				const bd = b.deadline?.getTime() ?? Infinity;
				return ad - bd || b.dateAdded.getTime() - a.dateAdded.getTime();
			});
		} else {
			sorted.sort((a, b) => b.dateAdded.getTime() - a.dateAdded.getTime());
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
		const parsed = parseDraft(newText);
		const text = parsed.text;
		if (!text) return;
		const spawn = pickSpawnPosition();
		const x = spawn.x;
		const y = spawn.y;
		const rotation = rand(-7, 7);
		const deadline = parsed.deadline?.toISOString() ?? null;
		const priority = parsed.priority;
		const project = parsed.project;

		const res = await fetch('/api/brain', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text,
				category: newCategory,
				deadline,
				priority,
				project,
				x,
				y,
				rotation
			})
		});

		const saved = await res.json();
		items = [
			...items,
			{
				id: saved.id,
				text: saved.text,
				category: saved.category as Category,
				dateAdded: new Date(saved.dateAdded),
				deadline: saved.deadline ? new Date(saved.deadline) : null,
				priority: saved.priority as Priority | null,
				project: saved.project,
				x: saved.x,
				y: saved.y,
				rotation: saved.rotation,
				baseX: saved.baseX,
				baseY: saved.baseY
			}
		];

		newText = '';
		newDeadline = null;
		newPriority = null;
		newProject = null;
		projectQuery = null;
		projectTokenStart = null;
		showAdd = false;
		if (spawn.shouldFocus) focusSpawnedCard(x, y);
	}

	async function deleteItem(id: number) {
		const previousItems = items;
		items = items.filter((i) => i.id !== id);

		const response = await fetch(`/api/brain/${id}`, { method: 'DELETE' });
		if (!response.ok) items = previousItems;
	}

	function fmt(d: Date) {
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function fmtDeadline(d: Date) {
		return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}
</script>

<svelte:window onmousemove={onMove} onmouseup={stopDrag} />

<div class="page">
	<div class="toolbar">
		<div class="title">🧠 Brain</div>
		<div class="order-btns">
			<span class="arrange-label">Arrange by</span>
			<button class:active={orderMode === 'freeform'} onclick={() => setOrder('freeform')}
				>Freeform</button
			>
			<button class:active={orderMode === 'category'} onclick={() => setOrder('category')}
				>Category</button
			>
			<button class:active={orderMode === 'date'} onclick={() => setOrder('date')}>Date</button>
			<button class:active={orderMode === 'priority'} onclick={() => setOrder('priority')}
				>Priority</button
			>
			<button class:active={orderMode === 'deadline'} onclick={() => setOrder('deadline')}
				>Deadline</button
			>
		</div>
		<button class="add-btn" onclick={() => (showAdd = true)}>＋ Add</button>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="brain"
		class:is-panning={panning}
		bind:this={containerEl}
		onmousedown={startPan}
		onwheel={onWheel}
		role="application"
		aria-label="Brain canvas. Drag the background to pan, use the mouse wheel to zoom, or drag cards in freeform mode."
	>
		<div class="view-controls" role="group" aria-label="Canvas view controls">
			<button
				onmousedown={(e) => e.stopPropagation()}
				onclick={() => setZoom(zoom / 1.15)}
				aria-label="Zoom out">−</button
			>
			<span>{Math.round(zoom * 100)}%</span>
			<button
				onmousedown={(e) => e.stopPropagation()}
				onclick={() => setZoom(zoom * 1.15)}
				aria-label="Zoom in">＋</button
			>
			<button class="fit-btn" onmousedown={(e) => e.stopPropagation()} onclick={fitAll}
				>Fit all</button
			>
			<button class="reset-btn" onmousedown={(e) => e.stopPropagation()} onclick={resetView}
				>Reset</button
			>
		</div>

		<div class="brain-world" style:transform="translate({pan.x}px, {pan.y}px) scale({zoom})">
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
							onmousedown={(e) => e.stopPropagation()}
							onclick={(e) => {
								e.stopPropagation();
								deleteItem(item.id);
							}}
							aria-label="Delete item">×</button
						>
					</div>
					<p class="card-text">{item.text}</p>
					<div class="card-meta">
						{#if item.project}
							<span class="project-pill">!{item.project}</span>
						{/if}
						{#if item.priority}
							<span class="priority-pill priority-{item.priority}">P{item.priority}</span>
						{/if}
						{#if item.deadline}
							<span class="deadline-pill">Due {fmtDeadline(item.deadline)}</span>
						{/if}
					</div>
					<div class="card-date">{fmt(item.dateAdded)}</div>
				</div>
			{/each}
		</div>
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
			<div class="modal-heading">
				<h2>Add to Brain</h2>
				<div class="shortcut-help">
					<button type="button" aria-label="Show input shortcuts">i</button>
					<div class="shortcut-popover" role="tooltip">
						<strong>Shortcuts</strong>
						<span
							><code>#todo</code>, <code>#idea</code>, <code>#thought</code>,
							<code>#note</code></span
						>
						<span><code>@today</code>, <code>@tomorrow</code>, <code>@monday</code> etc.</span>
						<span><code>p1</code>, <code>p2</code>, <code>p3</code> for priority</span>
						<span
							><code>!mindmap</code> for project. Use <code>Ctrl+n</code>/<code>Ctrl+p</code>.</span
						>
					</div>
				</div>
			</div>
			<div class="cat-picker">
				{#each Object.entries(CATEGORY_CONFIG) as [cat, cfg] (cat)}
					<button
						class="cat-btn"
						class:selected={newCategory === cat}
						style:--accent={cfg.color}
						onclick={() => (newCategory = cat as Category)}>{cfg.emoji} {cfg.label}</button
					>
				{/each}
			</div>
			<textarea
				bind:this={newTextEl}
				value={newText}
				oninput={handleDraftInput}
				placeholder="What's on your mind?"
				rows={3}
				onkeydown={onDraftKeydown}
				onclick={(e) => updateProjectAutocomplete(e.currentTarget.selectionStart)}
				onkeyup={(e) => updateProjectAutocomplete(e.currentTarget.selectionStart)}
			></textarea>
			{#if projectQuery !== null && projectSuggestions.length > 0}
				<div class="project-suggestions">
					{#each projectSuggestions as project, index (project)}
						<button
							class:selected={index === selectedProjectIndex}
							type="button"
							onmousedown={(e) => e.preventDefault()}
							onclick={() => confirmProjectSuggestion(project)}
						>
							!{project}
						</button>
					{/each}
				</div>
			{/if}
			<div class="draft-meta" aria-live="polite">
				<span>{CATEGORY_CONFIG[newCategory].emoji} {CATEGORY_CONFIG[newCategory].label}</span>
				{#if newProject}
					<span class="project-pill">!{newProject}</span>
				{/if}
				{#if newPriority}
					<span class="priority-pill priority-{newPriority}">P{newPriority}</span>
				{/if}
				{#if newDeadline}
					<span class="deadline-pill">Due {fmtDeadline(newDeadline)}</span>
				{/if}
			</div>
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
		cursor: grab;
		overflow: hidden;
		touch-action: none;
	}

	.brain.is-panning {
		cursor: grabbing;
	}

	.brain-world {
		position: absolute;
		inset: 0;
		transform-origin: 0 0;
		will-change: transform;
	}

	.view-controls {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		z-index: 220;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		background: rgba(10, 10, 18, 0.72);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.26);
	}

	.view-controls button,
	.view-controls span {
		min-width: 2rem;
		height: 2rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		font-size: 0.76rem;
	}

	.view-controls button {
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.78);
		cursor: pointer;
	}

	.view-controls button:hover {
		background: rgba(255, 255, 255, 0.13);
		color: #fff;
	}

	.view-controls span {
		min-width: 3rem;
		color: rgba(255, 255, 255, 0.5);
		font-variant-numeric: tabular-nums;
	}

	.view-controls .fit-btn,
	.view-controls .reset-btn {
		min-width: auto;
		padding: 0 0.7rem;
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

	.card-meta,
	.draft-meta {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.card-meta {
		margin-bottom: 0.45rem;
	}

	.priority-pill,
	.deadline-pill,
	.project-pill,
	.draft-meta span {
		display: inline-flex;
		align-items: center;
		min-height: 1.25rem;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		font-size: 0.62rem;
		font-weight: 700;
		line-height: 1;
	}

	.priority-pill {
		color: #fff;
	}

	.priority-1 {
		background: rgba(255, 107, 107, 0.75);
	}

	.priority-2 {
		background: rgba(255, 212, 59, 0.72);
		color: #1f1600;
	}

	.priority-3 {
		background: rgba(116, 192, 252, 0.65);
		color: #061827;
	}

	.deadline-pill,
	.project-pill,
	.draft-meta span {
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.07);
		color: rgba(255, 255, 255, 0.72);
	}

	.project-pill {
		border-color: rgba(124, 58, 237, 0.35);
		background: rgba(124, 58, 237, 0.18);
		color: #c4b5fd;
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

	.modal-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.modal h2 {
		margin: 0;
		font-size: 1.05rem;
		color: #fff;
		font-weight: 600;
	}

	.shortcut-help {
		position: relative;
	}

	.shortcut-help button {
		width: 1.45rem;
		height: 1.45rem;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.7);
		cursor: help;
		font-size: 0.78rem;
		font-weight: 800;
		font-style: italic;
	}

	.shortcut-popover {
		position: absolute;
		right: 0;
		top: calc(100% + 0.5rem);
		z-index: 20;
		width: 250px;
		display: none;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.8rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 12px;
		background: rgba(8, 8, 16, 0.96);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
		color: rgba(255, 255, 255, 0.68);
		font-size: 0.75rem;
		line-height: 1.45;
	}

	.shortcut-help:hover .shortcut-popover,
	.shortcut-help:focus-within .shortcut-popover {
		display: flex;
	}

	.shortcut-popover strong {
		color: #fff;
		font-size: 0.78rem;
	}

	.shortcut-popover code {
		padding: 0.08rem 0.25rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
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

	.project-suggestions {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin-top: -0.55rem;
		padding: 0.35rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.04);
	}

	.project-suggestions button {
		padding: 0.42rem 0.55rem;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: rgba(255, 255, 255, 0.62);
		cursor: pointer;
		font-size: 0.8rem;
		text-align: left;
	}

	.project-suggestions button:hover,
	.project-suggestions button.selected {
		background: rgba(124, 58, 237, 0.22);
		color: #fff;
	}

	.draft-meta {
		min-height: 1.4rem;
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

	@media (max-width: 720px) {
		.page {
			height: calc(100svh - 5.5rem);
			gap: 0.6rem;
		}

		.toolbar {
			align-items: stretch;
			flex-wrap: wrap;
			gap: 0.6rem;
			padding: 0.75rem;
		}

		.title {
			width: 100%;
			margin-right: 0;
		}

		.order-btns {
			flex: 1 1 100%;
			overflow-x: auto;
		}

		.arrange-label {
			display: none;
		}

		.order-btns button,
		.add-btn {
			min-height: 2.25rem;
		}

		.brain {
			min-height: 32rem;
			overflow: hidden;
		}

		.view-controls {
			left: 0.75rem;
			right: 0.75rem;
			justify-content: center;
			border-radius: 18px;
		}

		.card {
			width: 150px;
		}

		.delete-btn {
			opacity: 1;
			padding: 0.25rem;
		}

		.modal {
			width: min(100% - 2rem, 360px);
		}
	}
</style>

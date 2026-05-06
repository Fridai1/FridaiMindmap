<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import './../app.css';

	let { children } = $props();

	const links = [
		{ href: '/', label: 'Home', icon: '⌂' },
		{ href: '/brain', label: 'Brain', icon: '🧠' },
		{ href: '/projects', label: 'Projects', icon: '▦' },
		{ href: '/plants', label: 'Plants', icon: '⌘' }
	] as const;

	function isTextEntryTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
	}

	function onGlobalKeydown(e: KeyboardEvent) {
		if (
			e.key.toLowerCase() !== 'a' ||
			e.metaKey ||
			e.ctrlKey ||
			e.altKey ||
			isTextEntryTarget(e.target)
		) {
			return;
		}

		e.preventDefault();
		if (page.url.pathname === '/brain') {
			window.dispatchEvent(new CustomEvent('open-brain-add'));
			return;
		}

		goto(resolve('/brain?add=1'));
	}
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav class="sidebar">
	<div class="sidebar-logo">
		<div class="logo-mark">M</div>
		<span class="logo-text">Mindmap</span>
	</div>

	<div class="nav-section">
		<span class="nav-label">Navigation</span>
		{#each links as link (link.href)}
			<a href={resolve(link.href)} class:active={page.url.pathname === link.href}>
				<span class="nav-icon">{link.icon}</span>
				<span>{link.label}</span>
			</a>
		{/each}
	</div>

	<div class="sidebar-footer">
		<div class="avatar">F</div>
		<div class="user-info">
			<span class="user-name">fridai</span>
			<span class="user-role">Personal</span>
		</div>
	</div>
</nav>

<main>
	{@render children()}
</main>

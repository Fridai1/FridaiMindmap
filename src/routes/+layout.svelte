<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import './../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav class="sidebar">
	<a href="/">Home</a>
	<a href="/brain">Brain</a>
</nav>
<main>
	{@render children()}
</main>

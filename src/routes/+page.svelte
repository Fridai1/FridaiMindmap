<script lang="ts">
	import DashboardPage from './dashboard/+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<DashboardPage {data} />

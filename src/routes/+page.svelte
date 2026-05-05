<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<section class="home-card">
	<p class="eyebrow">Personal workspace</p>
	<h1>Mindmap</h1>
	<p>
		Capture loose thoughts, notes, ideas, and todos in a visual brain board that stays saved to
		SQLite.
	</p>
	<a href={resolve('/brain')}>Open Brain</a>
</section>

<style>
	.home-card {
		max-width: 680px;
		min-height: 320px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1rem;
		padding: clamp(1.5rem, 5vw, 3rem);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 24px;
		background:
			radial-gradient(circle at top left, rgba(124, 58, 237, 0.22), transparent 34rem),
			rgba(255, 255, 255, 0.04);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
	}

	.eyebrow {
		margin: 0;
		color: rgba(255, 255, 255, 0.45);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-size: clamp(2.5rem, 8vw, 5rem);
		line-height: 0.95;
		letter-spacing: -0.06em;
	}

	p {
		max-width: 34rem;
		margin: 0;
		color: rgba(255, 255, 255, 0.68);
		font-size: 1rem;
		line-height: 1.7;
	}

	a {
		width: fit-content;
		padding: 0.7rem 1rem;
		border-radius: 999px;
		background: #7c3aed;
		color: #fff;
		font-weight: 700;
		text-decoration: none;
	}

	a:hover {
		background: #6d28d9;
	}
</style>

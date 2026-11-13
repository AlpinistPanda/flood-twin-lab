<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { feed } from '#lib/feed.svelte.js';
	import { showTime } from '#lib/sensors.js';

	// Step 5: the layout is the frame around EVERY page, and it stays mounted while you move
	// between pages. So this is the place to start the sensor feed: once, for the whole app.
	let { children } = $props();

	onMount(() => feed.start()); // start() returns the stop function; Svelte calls it on unmount

	const pages = [
		{ href: '/maplibre', name: 'MapLibre GL', what: '2D map' },
		{ href: '/cesium', name: 'CesiumJS', what: '3D globe' },
		{ href: '/sensors', name: 'Sensor data', what: 'table' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Flood twin · Tambaram</title>
</svelte:head>

<div class="app">
	<header>
		<strong class="title">Flood twin · Tambaram</strong>

		<nav>
			{#each pages as p (p.href)}
				<a href={p.href} class:active={page.url.pathname === p.href}>
					{p.name} <small>{p.what}</small>
				</a>
			{/each}
		</nav>

		<div class="status">
			<span class="dot {feed.status}">●</span>
			{#if feed.status === 'connecting'}
				Connecting …
			{:else if feed.status === 'live'}
				<strong>Live</strong> · {showTime(feed.live?.time)} IST · {feed.secondsAgo(feed.lastOk)} s ago
			{:else if feed.status === 'delayed'}
				<strong>Delayed</strong> · last update {feed.secondsAgo(feed.lastOk)} s ago
			{:else}
				<strong>Feed lost</strong> · {feed.lastError}
			{/if}
			<button onclick={feed.togglePolling}>{feed.polling ? 'Pause' : 'Resume'}</button>
			<button onclick={feed.poll}>Update now</button>
		</div>
	</header>

	{#if feed.status === 'lost'}
		<div class="banner lost">
			<strong>No data from the sensors{feed.lastOk ? ` for ${feed.secondsAgo(feed.lastOk)} s` : ''}.</strong>
			{#if feed.live}
				Showing the last known levels, from {showTime(feed.live.time)} IST. They may be out of date.
			{/if}
		</div>
	{/if}

	{#if feed.live}
		<div class="banner" class:alert={feed.alerts.length > 0}>
			{#if feed.alerts.length > 0}
				<strong>
					{feed.status === 'lost' ? 'Last known: ' : ''}{feed.alerts.length}
					{feed.alerts.length === 1 ? 'sensor' : 'sensors'} at warning or danger:
				</strong>
				{#each feed.alerts as site, i (site.id)}
					{i > 0 ? ', ' : ''}{site.id} ({feed.readingFor(site.id).depth_m} m)
				{/each}
			{:else if feed.status === 'lost'}
				<!-- "No warnings" while the feed is down would be a false all-clear. -->
				<strong>Flood warnings unknown: the feed is lost.</strong>
			{:else}
				<strong>No flood warnings.</strong>
			{/if}
			<span class="note">· {feed.untrusted} of {feed.sites.length} sensors without recent or trustworthy data</span>
		</div>
	{/if}

	<main>
		{@render children()}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
	}
	/* The app fills the window: header and banners on top, the page takes the rest. */
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}
	main {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 1.2rem;
		padding: 0.5rem 1rem;
		background: #17324a;
		color: #fff;
	}
	.title {
		font-size: 1.05rem;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
	}
	nav a {
		color: #cfe0ee;
		text-decoration: none;
		padding: 0.25rem 0.6rem;
		border-radius: 4px;
	}
	nav a small {
		opacity: 0.7;
	}
	nav a.active {
		background: #fff;
		color: #17324a;
	}
	.status {
		margin-left: auto;
		font-size: 0.85rem;
	}
	.status button {
		margin-left: 0.3rem;
	}
	.dot.connecting {
		color: #b0b0b0;
	}
	.dot.live {
		color: #66bb6a;
	}
	.dot.delayed {
		color: #ffa726;
	}
	.dot.lost {
		color: #ef5350;
	}
	.banner {
		padding: 0.4rem 1rem;
		font-size: 0.9rem;
		background: #e8f1f8;
		border-left: 5px solid #5b8db8;
	}
	.banner.alert {
		background: #fdecea;
		border-left-color: #c62828;
	}
	.banner.lost {
		background: #333;
		color: #fff;
		border-left-color: #c62828;
	}
	.note {
		color: #555;
		font-size: 0.85rem;
	}
</style>

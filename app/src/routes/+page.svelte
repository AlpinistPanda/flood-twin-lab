<script>
	import { onMount } from 'svelte';
	import MapLibreMap from '#lib/MapLibreMap.svelte';
	import { toGeoJSON, classify, LEVELS, showTime, showAge } from '#lib/sensors.js';

	// Step 1: ask the sensor API for the sites and their latest readings.
	// Step 2: show them on a map as well as in the table.
	// Step 3: turn each reading into a level (dry / watch / warning / danger, or stale / suspect).
	// Step 4: ask for new readings by itself, and say so clearly when the feed is lost.

	const POLL_MS = 10_000; // ask the API every 10 s (= 10 minutes of replayed data)
	const TIMEOUT_MS = 5_000; // give up on a request that takes longer than this
	const FEED_LOST_AFTER_MS = 30_000; // no good answer for this long: the feed is lost

	let sites = $state([]); // from /api/sites: where each sensor is
	let live = $state(null); // from /api/live: the latest reading of each sensor

	// Step 3: the level of each sensor, and how often it changed since you opened the page.
	let levels = $state({});
	let changes = $state({});

	// Step 4: the health of the feed.
	let polling = $state(true); // the Pause / Resume button
	let lastOk = $state(null); // when (browser clock) we last got a good answer
	let lastError = $state(null); // what went wrong last time, if anything
	let now = $state(Date.now()); // ticks every second, so "… s ago" stays up to date

	let feed = $derived(
		lastOk == null
			? lastError ? 'lost' : 'connecting'
			: !lastError ? 'live'
			: now - lastOk < FEED_LOST_AFTER_MS ? 'delayed'
			: 'lost'
	);

	let geojson = $derived(toGeoJSON(sites, live, levels));
	let alerts = $derived(
		sites
			.filter((s) => levels[s.id] === 'danger' || levels[s.id] === 'warning')
			.sort((a, b) => (levels[b.id] === 'danger') - (levels[a.id] === 'danger'))
	);
	let untrusted = $derived(sites.filter((s) => levels[s.id] === 'stale' || levels[s.id] === 'suspect').length);

	// Fetch JSON, but never wait forever: a hanging server must count as a failure too.
	async function getJSON(url) {
		const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) throw new Error(`${url} answered ${res.status}`);
		return res.json();
	}

	async function poll() {
		try {
			if (sites.length === 0) sites = (await getJSON('/api/sites')).sites; // only once
			live = await getJSON('/api/live');
			updateLevels();
			lastOk = Date.now();
			lastError = null;
		} catch (e) {
			// Keep the last good data on screen, but remember that this attempt failed.
			lastError = e.name === 'TimeoutError' ? 'the API did not answer in time' : e.message;
		}
	}

	function updateLevels() {
		const next = {};
		for (const site of sites) {
			const level = classify(site, readingFor(site.id), levels[site.id]);
			if (levels[site.id] && levels[site.id] !== level) changes[site.id] = (changes[site.id] ?? 0) + 1;
			next[site.id] = level;
		}
		levels = next;
	}

	onMount(() => {
		let timer;
		let stopped = false;

		// Poll, wait, poll again. We wait for each answer before scheduling the next request
		// (setTimeout, not setInterval), so a slow API never piles up requests.
		async function tick() {
			if (polling) await poll();
			if (!stopped) timer = setTimeout(tick, POLL_MS);
		}
		tick();

		const clock = setInterval(() => (now = Date.now()), 1000);

		// Clean up when the page goes away, or the timers keep running.
		return () => {
			stopped = true;
			clearTimeout(timer);
			clearInterval(clock);
		};
	});

	function readingFor(id) {
		return live?.readings.find((r) => r.site === id);
	}

	function secondsAgo(t) {
		return Math.round((now - t) / 1000);
	}
</script>

<svelte:head>
	<title>Flood twin · Tambaram</title>
</svelte:head>

<main>
	<h1>Tambaram water levels</h1>

	<p class="status">
		<span class="feed {feed}">●</span>
		{#if feed === 'connecting'}
			Connecting to the sensor feed …
		{:else if feed === 'live'}
			<strong>Live</strong> · sensor time {showTime(live?.time)} IST · updated {secondsAgo(lastOk)} s ago
		{:else if feed === 'delayed'}
			<strong>Delayed</strong> · last update {secondsAgo(lastOk)} s ago, retrying
		{:else}
			<strong>Feed lost</strong> · {lastError}
		{/if}
		<button onclick={() => (polling = !polling)}>{polling ? 'Pause' : 'Resume'}</button>
		<button onclick={poll}>Update now</button>
	</p>

	{#if feed === 'lost'}
		<div class="banner lost">
			<strong>No data from the sensors{lastOk ? ` for ${secondsAgo(lastOk)} s` : ''}.</strong>
			{#if live}
				The map shows the last known levels, from {showTime(live.time)} IST. They may be out of date.
			{/if}
		</div>
	{/if}

	{#if live}
		<div class="banner" class:alert={alerts.length > 0}>
			{#if alerts.length > 0}
				<strong>
					{feed === 'lost' ? 'Last known: ' : ''}{alerts.length}
					{alerts.length === 1 ? 'sensor' : 'sensors'} at warning or danger:
				</strong>
				{#each alerts as site, i (site.id)}
					{i > 0 ? ', ' : ''}{site.id} ({readingFor(site.id).depth_m} m)
				{/each}
			{:else if feed === 'lost'}
				<!-- "No warnings" while the feed is down would be a false all-clear. -->
				<strong>Flood warnings unknown: the feed is lost.</strong>
			{:else}
				<strong>No flood warnings.</strong>
			{/if}
			<span class="note">{untrusted} of {sites.length} sensors have no recent or no trustworthy data.</span>
		</div>
	{/if}

	<div class:faded-map={feed === 'lost'}>
		<MapLibreMap {geojson} />
	</div>

	<p class="legend">
		{#each Object.entries(LEVELS) as [key, l] (key)}
			<span><i style:background={l.colour}></i>{l.label}</span>
		{/each}
	</p>

	<table class:faded={feed === 'lost'}>
		<thead>
			<tr><th>Site</th><th>Type</th><th>Depth (m)</th><th>Level</th><th>Measured</th><th>Age</th><th>Changes</th></tr>
		</thead>
		<tbody>
			{#each sites as site (site.id)}
				{@const r = readingFor(site.id)}
				{@const level = levels[site.id] ?? 'stale'}
				<tr class:faded={level === 'stale' || level === 'suspect'}>
					<td>{site.id}</td>
					<td>{site.type}</td>
					<td class="num">{r?.depth_m ?? '–'}</td>
					<td><i style:background={LEVELS[level].colour}></i>{LEVELS[level].label}</td>
					<td>{showTime(r?.time)}</td>
					<td>{showAge(r?.age_s)}</td>
					<td class="num">{changes[site.id] ?? 0}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</main>

<style>
	main {
		font-family: system-ui, sans-serif;
		max-width: 60rem;
		margin: 2rem auto;
		padding: 0 1rem;
	}
	.status button {
		margin-left: 0.4rem;
	}
	.feed {
		font-size: 1.1rem;
	}
	.feed.connecting {
		color: #b0b0b0;
	}
	.feed.live {
		color: #2e7d32;
	}
	.feed.delayed {
		color: #ef6c00;
	}
	.feed.lost {
		color: #c62828;
	}
	.banner {
		padding: 0.6rem 0.9rem;
		margin-bottom: 0.8rem;
		border-radius: 6px;
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
		display: block;
		font-size: 0.85rem;
		color: #555;
		margin-top: 0.2rem;
	}
	/* Feed lost: grey the map out, so nobody mistakes old colours for the current situation. */
	.faded-map {
		filter: grayscale(0.9) opacity(0.6);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		font-size: 0.85rem;
	}
	i {
		display: inline-block;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 50%;
		margin-right: 0.35rem;
		vertical-align: -0.1rem;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		margin-top: 1rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.3rem 0.6rem;
		border-bottom: 1px solid #ddd;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.faded {
		color: #888;
	}
</style>

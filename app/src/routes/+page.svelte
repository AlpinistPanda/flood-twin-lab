<script>
	import { onMount } from 'svelte';
	import MapLibreMap from '#lib/MapLibreMap.svelte';
	import { toGeoJSON, classify, LEVELS, showTime, showAge } from '#lib/sensors.js';

	// Step 1: ask the sensor API for the sites and their latest readings.
	// Step 2: show them on a map as well as in the table.
	// Step 3: turn each reading into a level (dry / watch / warning / danger, or stale / suspect).

	let sites = $state([]); // from /api/sites: where each sensor is
	let live = $state(null); // from /api/live: the latest reading of each sensor
	let error = $state(null);

	// Step 3: the level of each sensor, and how often it changed since you opened the page.
	// We keep the previous levels because hysteresis needs them.
	let levels = $state({});
	let changes = $state({});

	// The same data as GeoJSON for the map. $derived recomputes it whenever its inputs change.
	let geojson = $derived(toGeoJSON(sites, live, levels));

	// The alert banner: every sensor at warning or danger, most severe first.
	let alerts = $derived(
		sites
			.filter((s) => levels[s.id] === 'danger' || levels[s.id] === 'warning')
			.sort((a, b) => (levels[b.id] === 'danger') - (levels[a.id] === 'danger'))
	);
	let untrusted = $derived(sites.filter((s) => levels[s.id] === 'stale' || levels[s.id] === 'suspect').length);

	async function load() {
		error = null;
		try {
			const [sitesRes, liveRes] = await Promise.all([fetch('/api/sites'), fetch('/api/live')]);
			if (!sitesRes.ok || !liveRes.ok) throw new Error(`API answered ${sitesRes.status} / ${liveRes.status}`);
			sites = (await sitesRes.json()).sites;
			live = await liveRes.json();
			updateLevels();
		} catch (e) {
			error = `Could not reach the sensor API: ${e.message}. Is it running?`;
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

	onMount(load);

	// Look up a site's latest reading by its id.
	function readingFor(id) {
		return live?.readings.find((r) => r.site === id);
	}
</script>

<svelte:head>
	<title>Flood twin · Tambaram</title>
</svelte:head>

<main>
	<h1>Tambaram water levels</h1>

	<p>
		Sensor time: <strong>{showTime(live?.time)} IST</strong>
		<button onclick={load}>Refresh</button>
	</p>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	{#if live}
		<div class="banner" class:alert={alerts.length > 0}>
			{#if alerts.length > 0}
				<strong>{alerts.length} {alerts.length === 1 ? 'sensor' : 'sensors'} at warning or danger:</strong>
				{#each alerts as site, i (site.id)}
					{i > 0 ? ', ' : ''}{site.id} ({readingFor(site.id).depth_m} m)
				{/each}
			{:else}
				<strong>No flood warnings.</strong>
			{/if}
			<span class="note">{untrusted} of {sites.length} sensors have no recent or no trustworthy data.</span>
		</div>
	{/if}

	<MapLibreMap {geojson} />

	<p class="legend">
		{#each Object.entries(LEVELS) as [key, l] (key)}
			<span><i style:background={l.colour}></i>{l.label}</span>
		{/each}
	</p>

	<table>
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
	.note {
		display: block;
		font-size: 0.85rem;
		color: #555;
		margin-top: 0.2rem;
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
	.error {
		color: #b00020;
	}
</style>

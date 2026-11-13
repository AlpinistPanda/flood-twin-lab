<script>
	import { onMount } from 'svelte';
	import MapLibreMap from '#lib/MapLibreMap.svelte';
	import { toGeoJSON, showTime, showAge } from '#lib/sensors.js';

	// Step 1: ask the sensor API for the sites and their latest readings.
	// Step 2: show them on a map as well as in the table.

	let sites = $state([]); // from /api/sites: where each sensor is
	let live = $state(null); // from /api/live: the latest reading of each sensor
	let error = $state(null);

	// The same data as GeoJSON for the map. $derived recomputes it whenever sites or live change.
	let geojson = $derived(toGeoJSON(sites, live));

	async function load() {
		error = null;
		try {
			const [sitesRes, liveRes] = await Promise.all([fetch('/api/sites'), fetch('/api/live')]);
			if (!sitesRes.ok || !liveRes.ok) throw new Error(`API answered ${sitesRes.status} / ${liveRes.status}`);
			sites = (await sitesRes.json()).sites;
			live = await liveRes.json();
		} catch (e) {
			error = `Could not reach the sensor API: ${e.message}. Is it running?`;
		}
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

	<MapLibreMap {geojson} />

	<table>
		<thead>
			<tr><th>Site</th><th>Type</th><th>Depth (m)</th><th>Measured</th><th>Age</th></tr>
		</thead>
		<tbody>
			{#each sites as site (site.id)}
				{@const r = readingFor(site.id)}
				<tr>
					<td>{site.id}</td>
					<td>{site.type}</td>
					<td class="num">{r?.depth_m ?? '–'}</td>
					<td>{showTime(r?.time)}</td>
					<td>{showAge(r?.age_s)}</td>
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
	.error {
		color: #b00020;
	}
</style>

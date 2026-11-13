<script>
	import { onMount } from 'svelte';

	// Step 1: ask the sensor API for the sites and their latest readings, and show them as a table.

	let sites = $state([]); // from /api/sites: where each sensor is
	let live = $state(null); // from /api/live: the latest reading of each sensor
	let error = $state(null);

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

	// Times in the API are Unix seconds in UTC. Convert them only for display.
	function showTime(seconds) {
		if (seconds == null) return '–';
		return new Date(seconds * 1000).toLocaleString('en-GB', {
			timeZone: 'Asia/Kolkata',
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function showAge(seconds) {
		if (seconds == null) return '–';
		if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
		if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
		return `${Math.round(seconds / 86400)} days`;
	}

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
		max-width: 46rem;
		margin: 2rem auto;
		padding: 0 1rem;
	}
	table {
		border-collapse: collapse;
		width: 100%;
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

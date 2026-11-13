<script>
	import { feed } from '#lib/feed.svelte.js';
	import { LEVELS, showTime, showAge } from '#lib/sensors.js';

	// Step 5: the sensor table, now a page of its own. It reads the same shared feed as the
	// map pages, so it is always in step with them.
</script>

<div class="page">
	<h1>Sensor data</h1>
	<p>
		The latest reading of each of the {feed.sites.length} water-level sensors. <em>Changes</em> counts how
		often a sensor's level changed since you opened the app.
	</p>

	<table class:faded={feed.status === 'lost'}>
		<thead>
			<tr>
				<th>Site</th><th>Type</th><th class="num">Depth (m)</th><th>Level</th><th>Measured (IST)</th><th
					>Age</th
				><th class="num">Changes</th>
			</tr>
		</thead>
		<tbody>
			{#each feed.sites as site (site.id)}
				{@const r = feed.readingFor(site.id)}
				{@const level = feed.levels[site.id] ?? 'stale'}
				<tr class:faded={level === 'stale' || level === 'suspect'}>
					<td>{site.id}</td>
					<td>{site.type}</td>
					<td class="num">{r?.depth_m ?? '–'}</td>
					<td><i style:background={LEVELS[level].colour}></i>{LEVELS[level].label}</td>
					<td>{showTime(r?.time)}</td>
					<td>{showAge(r?.age_s)}</td>
					<td class="num">{feed.changes[site.id] ?? 0}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.page {
		max-width: 60rem;
		margin: 1.5rem auto;
		padding: 0 1rem;
	}
	h1 {
		margin-top: 0;
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
	.faded {
		color: #888;
	}
	i {
		display: inline-block;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 50%;
		margin-right: 0.35rem;
		vertical-align: -0.1rem;
	}
</style>

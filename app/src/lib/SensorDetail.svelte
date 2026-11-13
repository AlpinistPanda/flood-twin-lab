<script>
	import { feed } from '#lib/feed.svelte.js';
	import { LEVELS, showTime, showAge } from '#lib/sensors.js';
	import SensorChart from '#lib/SensorChart.svelte';

	// Step 6: everything about one sensor, in three tabs: the latest value, the last day,
	// the last month. Used inside the map popup, but it doesn't know that: it only needs an id.
	let { id } = $props();

	let tab = $state('now'); // 'now', 'day' or 'month'
	let day = $state(null); // [{ t, v }]
	let month = $state(null); // [{ t, v, lo, hi }]
	let error = $state(null);

	// "Now" comes from the shared feed, so it keeps updating while the popup is open.
	let site = $derived(feed.sites.find((s) => s.id === id));
	let reading = $derived(feed.readingFor(id));
	let level = $derived(feed.levels[id] ?? 'stale');

	// Day and Month are fetched when you first open their tab, not before.
	async function show(which) {
		tab = which;
		error = null;
		try {
			if (which === 'day' && !day) {
				const r = await fetch(`/api/history/${id}`); // default: the last 24 hours
				if (!r.ok) throw new Error(`API answered ${r.status}`);
				day = (await r.json()).readings.map((p) => ({ t: p.time, v: p.depth_m }));
			}
			if (which === 'month' && !month) {
				const r = await fetch(`/api/history/${id}/hourly`); // default: the last 30 days
				if (!r.ok) throw new Error(`API answered ${r.status}`);
				month = (await r.json()).hours.map((h) => ({ t: h.time, v: h.mean, lo: h.min, hi: h.max }));
			}
		} catch (e) {
			error = `Could not load the history: ${e.message}`;
		}
	}

	const clock = (t) => showTime(t).slice(-5); // "14:00"
	const date = (t) => showTime(t).slice(0, 6); // "04 Nov"
</script>

<div class="detail">
	<header>
		<strong>{id}</strong> · {site?.type}
		<span class="level"><i style:background={LEVELS[level].colour}></i>{LEVELS[level].label}</span>
	</header>

	<div class="tabs" role="tablist">
		{#each [['now', 'Now'], ['day', 'Day'], ['month', 'Month']] as [key, name] (key)}
			<button role="tab" aria-selected={tab === key} class:active={tab === key} onclick={() => show(key)}>{name}</button>
		{/each}
	</div>

	{#if error}
		<p class="error">{error}</p>
	{:else if tab === 'now'}
		<p class="big">{reading?.depth_m ?? '–'} <small>m</small></p>
		<p>Measured {showTime(reading?.time)} IST<br />{showAge(reading?.age_s)} ago</p>
		<p class="muted">Sensor mounted {site?.sensor_height_m} m above the street</p>
	{:else if tab === 'day'}
		{#if day}
			<SensorChart points={day} gap_s={30 * 60} label={clock} />
			<p class="muted">Every reading of the last 24 hours (m)</p>
		{:else}
			<p class="muted">Loading …</p>
		{/if}
	{:else if month}
		<SensorChart points={month} gap_s={2 * 3600} label={date} />
		<p class="muted">Hourly mean (line) and range (bars), last 30 days (m)</p>
	{:else}
		<p class="muted">Loading …</p>
	{/if}
</div>

<style>
	.detail {
		width: 300px;
		font-family: system-ui, sans-serif;
		font-size: 0.85rem;
	}
	header {
		margin-bottom: 0.4rem;
	}
	.level {
		float: right;
	}
	i {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		margin-right: 0.3rem;
		vertical-align: -0.05rem;
	}
	.tabs {
		display: flex;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}
	.tabs button {
		flex: 1;
		padding: 0.2rem;
		border: 1px solid #c8d3dd;
		background: #f4f7fa;
		border-radius: 4px;
		cursor: pointer;
	}
	.tabs button.active {
		background: #17324a;
		border-color: #17324a;
		color: #fff;
	}
	p {
		margin: 0.3rem 0;
	}
	.big {
		font-size: 1.8rem;
		font-weight: 600;
	}
	.big small {
		font-size: 0.9rem;
		font-weight: 400;
	}
	.muted {
		color: #666;
		font-size: 0.8rem;
	}
	.error {
		color: #b00020;
	}
</style>

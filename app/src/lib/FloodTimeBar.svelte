<script>
	import { onDestroy } from 'svelte';
	import { layers } from '#lib/layers.svelte.js';
	import { timeseriesInfo } from '#lib/scenario.js';

	// Step 8: the time bar for the flood over time, along the bottom of the map.
	// One model output per hour: the first one is Time 0:00, and every step adds one hour.
	// Above the slider, the wet area through the event, on the same time axis.
	const layer = layers.floodTime;

	let info = $state(null); // { steps: [0, 1, …], minutes_per_step: 60, wet_km2: […] }
	timeseriesInfo().then((i) => (info = i));

	let last = $derived(info ? info.steps.length - 1 : 0);

	// Time 0:00, Time 1:00, … from the model step and the minutes between two steps.
	function time(band) {
		const minutes = info.steps[band] * (info.minutes_per_step ?? 60);
		return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
	}

	// ▶ plays one hour every 250 ms: the whole event in about 30 seconds.
	let timer = $state(null);
	function play() {
		if (timer) return stop();
		if (layer.band >= last) layer.band = 0; // at the end: start again
		timer = setInterval(() => {
			if (layer.band >= last) return stop();
			layer.band += 1;
		}, 250);
	}
	function stop() {
		clearInterval(timer);
		timer = null;
	}
	onDestroy(stop);

	// The wet-area chart and the tick marks share one coordinate system with the slider.
	const W = 1000, H = 40;
	const x = (band) => (band / last) * W;
	let peak = $derived(info ? Math.max(...info.wet_km2) : 1);
	let area = $derived(
		info
			? `M0,${H} ` + info.wet_km2.map((a, i) => `L${x(i).toFixed(1)},${(H - (a / peak) * (H - 4)).toFixed(1)}`).join(' ') + ` L${W},${H} Z`
			: ''
	);
	let labelled = $derived(info ? info.steps.map((_, i) => i).filter((i) => i % 12 === 0) : []);
</script>

{#if info}
	<section class="bar" aria-label="Flood over time">
		<div class="head">
			<button onclick={play} aria-label={timer ? 'Pause' : 'Play'}>{timer ? '❚❚' : '▶'}</button>
			<strong class="now">Time {time(layer.band)}</strong>
			<span>{info.wet_km2[layer.band]} km² wet</span>
			<span class="muted">· 100-year flood scenario, hours since the start of the model run</span>
		</div>

		<div class="axis">
			<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
				<path class="area" d={area} />
				<line class="now-line" x1={x(layer.band)} x2={x(layer.band)} y1="0" y2={H} />
			</svg>

			<input
				type="range"
				min="0"
				max={last}
				step="1"
				bind:value={layer.band}
				oninput={stop}
				aria-label="Time"
				aria-valuetext="Time {time(layer.band)}"
			/>

			<svg class="ticks" viewBox="0 0 {W} 8" preserveAspectRatio="none" aria-hidden="true">
				{#each info.steps as _, i (i)}
					<line x1={x(i)} x2={x(i)} y1="0" y2={i % 12 === 0 ? 8 : 4} />
				{/each}
			</svg>
			<div class="labels">
				{#each labelled as i (i)}
					<span style:left="{(i / last) * 100}%">{time(i)}</span>
				{/each}
			</div>
		</div>
	</section>
{/if}

<style>
	.bar {
		position: absolute;
		left: 50%;
		bottom: 34px; /* above MapLibre's scale and attribution */
		transform: translateX(-50%);
		width: min(820px, calc(100% - 120px));
		z-index: 10;
		padding: 0.45rem 0.9rem 1.3rem;
		background: rgba(255, 255, 255, 0.95);
		border-radius: 6px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		font-size: 0.85rem;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.head button {
		width: 2rem;
		cursor: pointer;
	}
	.now {
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
		min-width: 6.5rem;
	}
	.muted {
		color: #666;
		font-size: 0.8rem;
	}
	/* 8px each side = half the slider's thumb, so the chart, ticks and labels line up with it */
	.axis {
		position: relative;
		margin-top: 0.35rem;
	}
	.axis svg,
	.labels {
		display: block;
		width: calc(100% - 16px);
		margin: 0 8px;
	}
	.axis svg:first-child {
		height: 2.2rem;
	}
	.area {
		fill: #c6dbef;
		stroke: #3182bd;
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.now-line {
		stroke: #c62828;
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	input {
		display: block;
		width: 100%;
		margin: 0.15rem 0 0;
	}
	.ticks {
		height: 8px;
	}
	.ticks line {
		stroke: #888;
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.labels {
		position: relative;
		height: 1rem;
	}
	.labels span {
		position: absolute;
		transform: translateX(-50%);
		font-size: 0.72rem;
		color: #444;
		font-variant-numeric: tabular-nums;
	}
</style>

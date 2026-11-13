<script>
	import { THRESHOLDS, LEVELS } from '#lib/sensors.js';

	// Step 6: a small time-series chart, drawn as plain SVG. No chart library needed:
	// a chart is just numbers turned into x and y positions.
	//
	// points: [{ t, v }]                for single readings (the Day view), or
	//         [{ t, v, lo, hi }]        for hourly summaries (the Month view): a line for the
	//                                   mean and a bar from the hour's lowest to highest reading
	// gap_s:  a pause longer than this breaks the line, so missing data stays visible
	// label:  turns a time (Unix seconds) into an axis label
	let { points, gap_s, label } = $props();

	const W = 320, H = 150; // the drawing size; the SVG scales to its container
	const L = 36, R = 8, T = 8, B = 22; // margins for the axis labels
	const FLOOR_M = -0.5; // readings below this are cut off (see the note under the chart)

	const id = $props.id(); // unique per chart, for the clip path

	let t0 = $derived(points[0]?.t ?? 0);
	let t1 = $derived(points.at(-1)?.t ?? 1);
	let values = $derived(points.flatMap((p) => (p.hi != null ? [p.lo, p.hi] : [p.v])));
	let yMax = $derived(Math.max(0.6, ...values)); // always show the 0.5 m danger line
	let yMin = $derived(Math.max(Math.min(0, ...values), FLOOR_M));
	let clipped = $derived(values.some((v) => v < FLOOR_M));

	const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
	const y = (v) => T + ((yMax - v) / (yMax - yMin)) * (H - T - B);

	// The line: "M" starts a new piece after a gap, "L" continues it.
	let line = $derived(
		points
			.map((p, i) => `${i === 0 || p.t - points[i - 1].t > gap_s ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
			.join(' ')
	);

	let yStep = $derived(yMax <= 1 ? 0.25 : yMax <= 3 ? 0.5 : 1);
	let yTicks = $derived.by(() => {
		const ticks = [];
		for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) ticks.push(+v.toFixed(2));
		return ticks;
	});
	let xTicks = $derived([0, 1, 2, 3].map((i) => t0 + ((t1 - t0) * i) / 3));
</script>

{#if points.length === 0}
	<p class="empty">No readings in this period.</p>
{:else}
	<svg viewBox="0 0 {W} {H}" role="img" aria-label="Water depth over time">
		<defs>
			<clipPath id="plot-{id}"><rect x={L} y={T} width={W - L - R} height={H - T - B} /></clipPath>
		</defs>

		<!-- grid and y axis (metres) -->
		{#each yTicks as v (v)}
			<line class="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
			<text class="tick" x={L - 4} y={y(v) + 3} text-anchor="end">{v}</text>
		{/each}

		<!-- x axis (time) -->
		{#each xTicks as t, i (i)}
			<text class="tick" x={x(t)} y={H - 6} text-anchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}>{label(t)}</text>
		{/each}

		<g clip-path="url(#plot-{id})">
			<!-- the step 3 thresholds, in their level colours -->
			{#each THRESHOLDS as th (th.level)}
				<line class="threshold" x1={L} x2={W - R} y1={y(th.depth_m)} y2={y(th.depth_m)} stroke={LEVELS[th.level].colour} />
			{/each}

			<!-- Month view: one bar per hour, from its lowest to its highest reading -->
			{#each points.filter((p) => p.hi != null) as p (p.t)}
				<line class="range" x1={x(p.t)} x2={x(p.t)} y1={y(p.lo)} y2={y(p.hi)} />
			{/each}

			<path class="line" d={line} />
		</g>
	</svg>
	{#if clipped}
		<p class="note">Some readings are below {FLOOR_M} m and fall off the chart. Sensor error?</p>
	{/if}
{/if}

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.grid {
		stroke: #e4e4e4;
	}
	.tick {
		font-size: 9px;
		fill: #666;
	}
	.threshold {
		stroke-dasharray: 4 3;
		stroke-width: 1;
	}
	.range {
		stroke: #9ec1df;
		stroke-width: 1.5;
	}
	.line {
		fill: none;
		stroke: #17324a;
		stroke-width: 1.3;
	}
	.empty,
	.note {
		font-size: 0.8rem;
		color: #777;
		margin: 0.3rem 0;
	}
</style>

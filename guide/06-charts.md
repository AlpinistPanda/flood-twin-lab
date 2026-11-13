# Step 6 · A day and a month in the popup

[← Step 5](05-pages-layers.md) · [Guide overview](README.md) · [Step 7 →](07-flood-layers.md)

**You build:** a sensor popup with three tabs: **Now** (live), **Day** (every reading of the last 24 hours) and **Month** (one summary per hour for 30 days), with the thresholds as dashed lines.
**You learn:** drawing a chart in SVG without a library; loading data only when it's needed; putting a Svelte component inside a MapLibre popup.
**Time:** about 75 minutes.
**Start from:** your step 5, or the tag `step-5`.

---

## The data

You need two endpoints of [the sensor API](api.md):

| Tab | Endpoint | Points |
|---|---|---|
| Day | `/api/history/TBM-15` (the last 24 hours) | every reading: ~1,400 for a sensor that reports every minute |
| Month | `/api/history/TBM-15/hourly` (the last 30 days) | one row per hour with `min`, `mean` and `max`: ~720 |

Why not a month of every reading? That's about 43,000 points per sensor. A chart 300 pixels wide can't show them, and a field engineer's phone shouldn't have to download them. The **server** summarises; the browser draws.

Try both in the browser first: port 5173, `/api/history/TBM-15/hourly`.

## 6.1 · A chart is just numbers turned into positions

Create **`app/src/lib/SensorChart.svelte`**. It receives a list of points and draws them in an `<svg>`. An SVG has its own coordinate system, set by `viewBox`; the browser scales it to fit the popup.

```svelte
<script>
	let { points } = $props(); // [{ t: unix seconds, v: metres }]

	const W = 320, H = 150;            // the drawing size
	const L = 36, R = 8, T = 8, B = 22; // room for the axis labels

	let t0 = $derived(points[0]?.t ?? 0);
	let t1 = $derived(points.at(-1)?.t ?? 1);
	let yMax = $derived(Math.max(0.6, ...points.map((p) => p.v))); // always show the 0.5 m line
	let yMin = $derived(Math.min(0, ...points.map((p) => p.v)));

	// time → x, depth → y. In SVG, y grows DOWNWARDS, so the highest depth gets the smallest y.
	const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
	const y = (v) => T + ((yMax - v) / (yMax - yMin)) * (H - T - B);
</script>

<svg viewBox="0 0 {W} {H}">
	…
</svg>

<style>
	svg { width: 100%; height: auto; display: block; }
</style>
```

**a · The line.** An SVG `<path>` is drawn from a string of commands: `M x,y` moves the pen, `L x,y` draws a line to a point. Build that string from the points with `$derived`, and draw it:

```svelte
<path d={line} fill="none" stroke="#17324a" />
```

**b · Gaps stay gaps.** Sensors stop reporting sometimes. A line straight across a 6-hour gap pretends we know what happened. Give the chart a prop `gap_s`: when the time to the previous point is more than `gap_s`, start a new piece with `M` instead of `L`.

**c · Axes.** Horizontal grid lines with their value in metres on the left (a few round values between `yMin` and `yMax`), and four time labels along the bottom. Let the page decide how a time is written, with a prop `label`: a function from Unix seconds to text (*14:00* for a day, *04 Nov* for a month).

**d · The thresholds.** For each entry in `THRESHOLDS` (step 3), a dashed horizontal line in its level's colour: `stroke-dasharray="4 3"`.

**e · The Month view's ranges.** The hourly *mean* of a sensor that jumps between 0.5 m and −0.3 m looks calm. So points can also have `lo` and `hi`: for those, draw a thin vertical bar from `y(lo)` to `y(hi)` behind the line. Include `lo` and `hi` when you compute `yMin` and `yMax`.

**f · Broken readings.** Some sensors report −7 m. One such reading squashes the whole chart into a flat line at the top. Never let `yMin` go below −0.5 m, and clip what falls outside the plot area with a `<clipPath>`. Say so under the chart: *Some readings are below −0.5 m and fall off the chart.*

`$props.id()` gives a unique id per chart, which you need for the clip path's id when two charts are on the screen.

## 6.2 · The popup content: `app/src/lib/SensorDetail.svelte`

A component that shows everything about one sensor. It receives only an `id`, and gets the rest itself:

- **"Now"** from the shared feed, so it keeps updating while the popup is open: `feed.sites.find(…)`, `feed.readingFor(id)`, `feed.levels[id]` (all `$derived`). Show the depth large, the time, the age, and how high the sensor hangs.
- **"Day" and "Month"** from the API, **only when their tab is opened for the first time**:

  ```js
  let tab = $state('now');
  let day = $state(null); // [{ t, v }]

  async function show(which) {
  	tab = which;
  	if (which === 'day' && !day) {
  		const r = await fetch(`/api/history/${id}`);
  		day = (await r.json()).readings.map((p) => ({ t: p.time, v: p.depth_m }));
  	}
  	// … the same for 'month', from /hourly: { t: h.time, v: h.mean, lo: h.min, hi: h.max }
  }
  ```

  Handle errors like in step 1 (`r.ok`, `try`/`catch`), and show *Loading …* while the data is on its way.

- **Three tab buttons** at the top, and the sensor's id, type and level (with its coloured dot) above them.
- Under each chart, one line saying what it shows: *Every reading of the last 24 hours (m)*, *Hourly mean (line) and range (bars), last 30 days (m)*.

Day: `<SensorChart points={day} gap_s={30 * 60} label={clock} />`. Month: `gap_s={2 * 3600}` and a date label. Two small helpers built on `showTime()` will do: `showTime(t).slice(-5)` is the clock time, `.slice(0, 6)` the date.

Give the component a fixed width (`300px`) so the popup doesn't jump when you switch tabs.

## 6.3 · A component inside a MapLibre popup

MapLibre only knows HTML elements, not Svelte components. So: make an empty `<div>`, let Svelte **mount** the component into it, give the `<div>` to the popup, and **unmount** the component when the popup closes (otherwise it keeps listening to the feed forever).

In `MapLibreMap.svelte`, replace the old popup:

```js
import { onMount, mount, unmount } from 'svelte';
import SensorDetail from '#lib/SensorDetail.svelte';

m.on('click', 'sensor-dots', (e) => {
	const id = e.features[0].properties.id;
	const target = document.createElement('div');
	const detail = mount(SensorDetail, { target, props: { id } });
	const popup = new maplibregl.Popup({ maxWidth: 'none' })
		.setLngLat(e.features[0].geometry.coordinates)
		.setDOMContent(target);
	popup.on('close', () => unmount(detail));
	popup.addTo(m);
});
```

`popup.on(…)` is on its own line on purpose: in MapLibre 6, `.on()` doesn't return the popup, so it can't be chained like `setLngLat(…).setDOMContent(…)`.

## Check

Start the API during the event (`REPLAY_START=2026-11-04T15:00 python api/main.py`).

- [ ] Click **TBM-15**: *Now* shows the depth; leave it open for 20 s: it updates.
- [ ] **Day**: a line with the dashed thresholds; the times along the bottom are IST.
- [ ] **Month**: a line with light bars; the 4–5 and 6–8 November events stand out.
- [ ] **TBM-14** (always negative) and a sensor with spikes: the chart stays readable, with the note about readings below −0.5 m.
- [ ] A sensor with long gaps (TBM-02, TBM-23) on **Month**: the line breaks.
- [ ] **Network** tab: the history is requested only when you open a tab, and only once per popup.

Commit your work.

## Stuck?

| Problem | Try |
|---|---|
| The chart is upside down | SVG's y axis points down: `y(v)` must use `yMax - v` |
| One straight line across the chart, or nothing | `t0` and `t1` may be equal, or the points are in seconds and you divide by 1000 somewhere. Log `points[0]` and `points.at(-1)` |
| The popup is empty | `mount()` needs `{ target, props }`; did you pass `target` to `setDOMContent`? |
| `popup.on(...).addTo is not a function` | Don't chain after `.on()`: see 6.3 |
| Two charts on screen and one loses its clipping | The clip path id must be unique per chart: `$props.id()` |

Compare: `git diff step-6 -- app/src`.

<details>
<summary>📄 <code>app/src/lib/SensorChart.svelte</code> as it is at <code>step-6</code></summary>

```svelte
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
```

</details>

<details>
<summary>📄 <code>app/src/lib/SensorDetail.svelte</code> as it is at <code>step-6</code></summary>

```svelte
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
```

</details>

<details>
<summary>🔍 What changed in <code>app/src/lib/MapLibreMap.svelte</code> from <code>step-5</code> to <code>step-6</code></summary>

```diff
--- a/app/src/lib/MapLibreMap.svelte
+++ b/app/src/lib/MapLibreMap.svelte
@@ -1,7 +1,7 @@
 <script>
-	import { onMount } from 'svelte';
+	import { onMount, mount, unmount } from 'svelte';
 	import * as maplibregl from 'maplibre-gl';
 	import 'maplibre-gl/dist/maplibre-gl.css';
-	import { showTime, showAge, LEVELS } from '#lib/sensors.js';
+	import SensorDetail from '#lib/SensorDetail.svelte';
 
 	// Step 2: the sensors on a 2D web map with MapLibre GL.
@@ -66,15 +66,16 @@
 			});
 
-			// Click a sensor: show its latest reading in a popup.
+			// Click a sensor: open a popup with the SensorDetail component in it (step 6).
+			// MapLibre only knows HTML elements, so we make an empty <div>, let Svelte mount the
+			// component into it, and unmount it again when the popup closes.
 			m.on('click', 'sensor-dots', (e) => {
-				const p = e.features[0].properties;
-				new maplibregl.Popup()
+				const id = e.features[0].properties.id;
+				const target = document.createElement('div');
+				const detail = mount(SensorDetail, { target, props: { id } });
+				const popup = new maplibregl.Popup({ maxWidth: 'none' })
 					.setLngLat(e.features[0].geometry.coordinates)
-					.setHTML(
-						`<strong>${p.id}</strong> · ${p.type} · <strong>${LEVELS[p.level].label}</strong><br>
-						 Depth: ${p.depth_m ?? '–'} m<br>
-						 Measured: ${showTime(p.time)} IST (${showAge(p.age_s)} ago)`
-					)
-					.addTo(m);
+					.setDOMContent(target);
+				popup.on('close', () => unmount(detail)); // (in MapLibre 6, .on() can't be chained)
+				popup.addTo(m);
 			});
 			m.on('mouseenter', 'sensor-dots', () => (m.getCanvas().style.cursor = 'pointer'));
```

</details>

**Why it was done this way, things to try, questions:** [STEPS.md, step 6](../STEPS.md#step-6--sensor-details-a-day-and-a-month-in-the-popup--step-6).

---

## Walkthrough: step 6 in small pieces, with all the code

Start the API during the event: `REPLAY_START=2026-11-04T15:00 python api/main.py`. Every piece ends with something to click on the map page.

### 6.A · A Svelte component in the popup

Create **`app/src/lib/SensorDetail.svelte`**, for now with only the sensor's name and its live depth:

```svelte
<script>
	import { feed } from '#lib/feed.svelte.js';

	let { id } = $props();

	// From the shared feed, so it keeps updating while the popup is open.
	let reading = $derived(feed.readingFor(id));
</script>

<div class="detail">
	<strong>{id}</strong>
	<p class="big">{reading?.depth_m ?? '–'} <small>m</small></p>
</div>

<style>
	.detail {
		width: 300px;
		font-family: system-ui, sans-serif;
		font-size: 0.85rem;
	}
	.big {
		font-size: 1.8rem;
		margin: 0.3rem 0;
	}
</style>
```

In `MapLibreMap.svelte`, change the first import line and add one:

```js
	import { onMount, mount, unmount } from 'svelte';
	import SensorDetail from '#lib/SensorDetail.svelte';
```

and replace the whole `m.on('click', 'sensor-dots', …)` with:

```js
			// Click a sensor: open a popup with the SensorDetail component in it.
			// MapLibre only knows HTML elements, so we make an empty <div>, let Svelte mount the
			// component into it, and unmount it again when the popup closes.
			m.on('click', 'sensor-dots', (e) => {
				const id = e.features[0].properties.id;
				const target = document.createElement('div');
				const detail = mount(SensorDetail, { target, props: { id } });
				const popup = new maplibregl.Popup({ maxWidth: 'none' })
					.setLngLat(e.features[0].geometry.coordinates)
					.setDOMContent(target);
				popup.on('close', () => unmount(detail)); // (in MapLibre 6, .on() can't be chained)
				popup.addTo(m);
			});
```

The `showTime, showAge` import in `MapLibreMap.svelte` is no longer used: remove it.

**You see:** click a sensor: its id and a big depth. Leave the popup open for 20 seconds: the number changes with the feed.

### 6.B · Three tabs

Replace the script and the HTML of `SensorDetail.svelte` (keep the style):

```svelte
<script>
	import { feed } from '#lib/feed.svelte.js';
	import { LEVELS, showTime, showAge } from '#lib/sensors.js';

	let { id } = $props();

	let tab = $state('now'); // 'now', 'day' or 'month'

	let site = $derived(feed.sites.find((s) => s.id === id));
	let reading = $derived(feed.readingFor(id));
	let level = $derived(feed.levels[id] ?? 'stale');

	function show(which) {
		tab = which;
	}
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

	{#if tab === 'now'}
		<p class="big">{reading?.depth_m ?? '–'} <small>m</small></p>
		<p>Measured {showTime(reading?.time)} IST<br />{showAge(reading?.age_s)} ago</p>
		<p class="muted">Sensor mounted {site?.sensor_height_m} m above the street</p>
	{:else}
		<p class="muted">The {tab} chart comes here.</p>
	{/if}
</div>
```

Add to the style:

```css
	.level {
		float: right;
	}
	i {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		margin-right: 0.3rem;
	}
	.tabs {
		display: flex;
		gap: 0.2rem;
		margin: 0.4rem 0;
	}
	.tabs button {
		flex: 1;
		padding: 0.25rem;
		border: 1px solid #ccc;
		background: #f5f5f5;
		cursor: pointer;
	}
	.tabs button.active {
		background: #17324a;
		color: #fff;
	}
	.muted {
		color: #666;
	}
```

**You see:** the popup has a header with the level, and three tabs. *Day* and *Month* only say where the chart will come.

### 6.C · Load the day, only when asked

Add state for the data, and fetch in `show`:

```js
	let day = $state(null); // [{ t, v }]
	let error = $state(null);

	async function show(which) {
		tab = which;
		error = null;
		try {
			if (which === 'day' && !day) {
				const r = await fetch(`/api/history/${id}`); // default: the last 24 hours
				if (!r.ok) throw new Error(`API answered ${r.status}`);
				day = (await r.json()).readings.map((p) => ({ t: p.time, v: p.depth_m }));
			}
		} catch (e) {
			error = `Could not load the history: ${e.message}`;
		}
	}
```

Replace the `{:else}` part of the HTML with:

```svelte
	{:else if error}
		<p class="error">{error}</p>
	{:else if tab === 'day'}
		<p class="muted">{day ? `${day.length} readings` : 'Loading …'}</p>
	{:else}
		<p class="muted">The month chart comes here.</p>
	{/if}
```

Errors can only happen on *Day* and *Month*, so the error check can come after *Now*.

**You see:** *Day* says *1440 readings* (or fewer, for a sensor that reports every 5 minutes). **Network** tab: one `history` request when you first open *Day*, none when you open it again.

### 6.D · The simplest chart: a line

Create **`app/src/lib/SensorChart.svelte`**:

```svelte
<script>
	// A small time-series chart, drawn as plain SVG. No chart library needed:
	// a chart is just numbers turned into x and y positions.
	let { points } = $props(); // [{ t, v }]

	const W = 320, H = 150; // the drawing size; the SVG scales to its container
	const L = 36, R = 8, T = 8, B = 22; // margins for the axis labels

	let t0 = $derived(points[0]?.t ?? 0);
	let t1 = $derived(points.at(-1)?.t ?? 1);
	let values = $derived(points.map((p) => p.v));
	let yMax = $derived(Math.max(0.6, ...values)); // always show the 0.5 m danger line
	let yMin = $derived(Math.min(0, ...values));

	const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
	const y = (v) => T + ((yMax - v) / (yMax - yMin)) * (H - T - B); // SVG's y grows downwards

	let line = $derived(points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '));
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label="Water depth over time">
	<rect x={L} y={T} width={W - L - R} height={H - T - B} fill="none" stroke="#ddd" />
	<path class="line" d={line} />
</svg>

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.line {
		fill: none;
		stroke: #17324a;
		stroke-width: 1.3;
	}
</style>
```

In `SensorDetail.svelte`, import it (`import SensorChart from '#lib/SensorChart.svelte';`) and show it for *Day*:

```svelte
	{:else if tab === 'day'}
		{#if day}
			<SensorChart points={day} />
			<p class="muted">Every reading of the last 24 hours (m)</p>
		{:else}
			<p class="muted">Loading …</p>
		{/if}
```

**You see:** click **TBM-15** → *Day*: a line in a box, rising during the event. No axes yet.

### 6.E · Axes

Add to the chart's script, a prop for the time labels, and the ticks:

```js
	let { points, label } = $props(); // label: Unix seconds → text for the time axis

	let yStep = $derived(yMax <= 1 ? 0.25 : yMax <= 3 ? 0.5 : 1);
	let yTicks = $derived.by(() => {
		const ticks = [];
		for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) ticks.push(+v.toFixed(2));
		return ticks;
	});
	let xTicks = $derived([0, 1, 2, 3].map((i) => t0 + ((t1 - t0) * i) / 3));
```

(`$derived.by` takes a function, for values that need more than one expression.) In the SVG, replace the `<rect>` with:

```svelte
	<!-- grid and y axis (metres) -->
	{#each yTicks as v (v)}
		<line class="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
		<text class="tick" x={L - 4} y={y(v) + 3} text-anchor="end">{v}</text>
	{/each}

	<!-- x axis (time) -->
	{#each xTicks as t, i (i)}
		<text class="tick" x={x(t)} y={H - 6} text-anchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}>{label(t)}</text>
	{/each}
```

```css
	.grid {
		stroke: #e4e4e4;
	}
	.tick {
		font-size: 9px;
		fill: #666;
	}
```

In `SensorDetail.svelte`, two label functions in the script:

```js
	const clock = (t) => showTime(t).slice(-5); // "14:00"
	const date = (t) => showTime(t).slice(0, 6); // "04 Nov"
```

and `<SensorChart points={day} label={clock} />`.

**You see:** metres on the left, four IST times along the bottom.

### 6.F · Gaps and thresholds

**Gaps:** a new prop `gap_s`. Start a new piece of line after a pause longer than that:

```js
	let { points, gap_s, label } = $props();

	let line = $derived(
		points
			.map((p, i) => `${i === 0 || p.t - points[i - 1].t > gap_s ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
			.join(' ')
	);
```

In `SensorDetail.svelte`: `<SensorChart points={day} gap_s={30 * 60} label={clock} />`.

**Thresholds:** import them in the chart, `import { THRESHOLDS, LEVELS } from '#lib/sensors.js';`, and before the `<path>`:

```svelte
	<!-- the step 3 thresholds, in their level colours -->
	{#each THRESHOLDS as th (th.level)}
		<line class="threshold" x1={L} x2={W - R} y1={y(th.depth_m)} y2={y(th.depth_m)} stroke={LEVELS[th.level].colour} />
	{/each}
```

```css
	.threshold {
		stroke-dasharray: 4 3;
		stroke-width: 1;
	}
```

**You see:** yellow, orange and red dashed lines at 0.15, 0.30 and 0.50 m. You can read at a glance when the sensor crossed them.

### 6.G · The month: summaries and ranges

In `SensorDetail.svelte`, add `let month = $state(null); // [{ t, v, lo, hi }]` and, in `show`, after the `day` block:

```js
			if (which === 'month' && !month) {
				const r = await fetch(`/api/history/${id}/hourly`); // default: the last 30 days
				if (!r.ok) throw new Error(`API answered ${r.status}`);
				month = (await r.json()).hours.map((h) => ({ t: h.time, v: h.mean, lo: h.min, hi: h.max }));
			}
```

Replace the last `{:else}` part:

```svelte
	{:else if month}
		<SensorChart points={month} gap_s={2 * 3600} label={date} />
		<p class="muted">Hourly mean (line) and range (bars), last 30 days (m)</p>
	{:else}
		<p class="muted">Loading …</p>
	{/if}
```

In the chart, include `lo` and `hi` in the scale, and draw a bar per hour **before** the line:

```js
	let values = $derived(points.flatMap((p) => (p.hi != null ? [p.lo, p.hi] : [p.v])));
```

```svelte
	<!-- Month view: one bar per hour, from its lowest to its highest reading -->
	{#each points.filter((p) => p.hi != null) as p (p.t)}
		<line class="range" x1={x(p.t)} x2={x(p.t)} y1={y(p.lo)} y2={y(p.hi)} />
	{/each}
```

```css
	.range {
		stroke: #9ec1df;
		stroke-width: 1.5;
	}
```

**You see:** *Month* for TBM-15: two clear events (4–5 and 6–8 November), light-blue bars behind the line. Now try **TBM-02**: a broken sensor's spikes squash everything into a flat line.

### 6.H · Keep broken readings from ruining the chart

Never go below −0.5 m, and cut off what falls outside:

```js
	const FLOOR_M = -0.5; // readings below this are cut off
	const id = $props.id(); // unique per chart, for the clip path

	let yMin = $derived(Math.max(Math.min(0, ...values), FLOOR_M));
	let clipped = $derived(values.some((v) => v < FLOOR_M));
```

(replace the old `yMin` line). In the SVG, add a clip path at the top, and wrap the thresholds, the ranges and the line in a group that uses it:

```svelte
	<defs>
		<clipPath id="plot-{id}"><rect x={L} y={T} width={W - L - R} height={H - T - B} /></clipPath>
	</defs>
	…
	<g clip-path="url(#plot-{id})">
		<!-- thresholds, ranges and the line go here -->
	</g>
```

After the `</svg>`, and around the whole chart, an empty case:

```svelte
{#if points.length === 0}
	<p class="empty">No readings in this period.</p>
{:else}
	<svg …> … </svg>
	{#if clipped}
		<p class="note">Some readings are below {FLOOR_M} m and fall off the chart. Sensor error?</p>
	{/if}
{/if}
```

```css
	.empty,
	.note {
		font-size: 0.8rem;
		color: #777;
		margin: 0.3rem 0;
	}
```

**You see:** TBM-02 and TBM-14 stay readable, with the note under the chart. TBM-17 (never reported): *No readings in this period.* That's the reference of this step. Commit.


---

[Step 7 · A flood model: raster and vector →](07-flood-layers.md)

# Step 3 · Thresholds and alerts

[← Step 2](02-maplibre.md) · [Guide overview](README.md) · [Step 4 →](04-live.md)

**You build:** a level for every sensor (*Dry, Watch, Warning, Danger*, or *Suspect* / *No recent data*), dots and table rows in the level's colour, an alert banner, and hysteresis so levels don't flicker.
**You learn:** turning measurements into decisions; writing and testing plain JavaScript functions; MapLibre data-driven styling; more `$derived`.
**Time:** about 60 minutes.
**Start from:** your step 2, or the tag `step-2`.

---

## The rules

A twin is useful when it says what a number **means**. These are the rules (teaching values, not an official standard):

| Depth | Level | Why |
|---|---|---|
| from 0.15 m | *Watch* | Over the kerb, ankle deep |
| from 0.30 m | *Warning* | Cars stall, hard to walk |
| from 0.50 m | *Danger* | Dangerous for people and vehicles |

But first, **can we trust the reading at all?**

| Situation | Level |
|---|---|
| No reading, or the reading is older than 30 minutes | *No recent data* (grey) |
| Below −0.10 m, or higher than the sensor itself hangs | *Suspect* (purple) |

The order matters: trust first, depth second. Without the first check, TBM-01's −7.49 m from two weeks ago would be "dry", and the map would look reassuring for a place we know nothing about.

## 3.1 · The rules as data

At the top of `app/src/lib/sensors.js`, write the rules as constants that the rest of the app imports. Settings that a city might want to change belong together, at the top, with names:

```js
export const THRESHOLDS = [
	{ level: 'danger', depth_m: 0.5 },
	{ level: 'warning', depth_m: 0.3 },
	{ level: 'watch', depth_m: 0.15 }
]; // from the most to the least severe

export const HYSTERESIS_M = 0.05;      // see 3.3
export const STALE_AFTER_S = 30 * 60;  // older readings are not "now" any more
export const SUSPECT_BELOW_M = -0.1;   // lower readings can't be water

export const LEVELS = {
	danger: { label: 'Danger', colour: '#c62828' },
	warning: { label: 'Warning', colour: '#ef6c00' },
	watch: { label: 'Watch', colour: '#f9c80e' },
	dry: { label: 'Dry', colour: '#5b8db8' },
	suspect: { label: 'Suspect', colour: '#8e5bb5' },
	stale: { label: 'No recent data', colour: '#b0b0b0' }
};
```

## 3.2 · From a depth to a level

Write two functions in `sensors.js`:

- **`waterLevel(depth)`** returns `'danger'`, `'warning'`, `'watch'` or `'dry'`. Go through `THRESHOLDS` in order and return the first level whose `depth_m` the depth reaches.
- **`classify(site, reading, previous)`** returns the full level of one sensor: `'stale'` if there is no reading or `reading.age_s > STALE_AFTER_S`; `'suspect'` if `reading.depth_m < SUSPECT_BELOW_M` or `> site.sensor_height_m`; otherwise `waterLevel(reading.depth_m, previous)`. (`previous` is for 3.3; pass it on already.)

**Test them** in `app/`, without a browser:

```bash
node -e "
import('./src/lib/sensors.js').then(({ waterLevel }) => {
  for (const d of [0, 0.14, 0.15, 0.31, 0.5, 2]) console.log(d, waterLevel(d));
});"
```

Expected: `dry, dry, watch, warning, danger, danger`.

## 3.3 · Hysteresis: no flickering

Imagine a sensor reading 0.28, 0.31, 0.29, 0.31, 0.27 m. With the rule above, it jumps *Watch → Warning → Watch → Warning → Watch*. Each jump could be an SMS to a resident. That's not a twin people will trust.

**Hysteresis** fixes it: a sensor **enters** a level at its threshold, but only **leaves** it when the water drops `HYSTERESIS_M` (5 cm) **below** the threshold. To know whether it is "already there", `waterLevel` needs the level from last time:

```js
const RANK = { dry: 0, watch: 1, warning: 2, danger: 3 };

export function waterLevel(depth, previous = 'dry') {
	for (const t of THRESHOLDS) {
		// Already at this level (or higher) last time? Then use the lower "leave" threshold.
		const alreadyThere = … ;
		const threshold = alreadyThere ? … : … ;
		if (depth >= threshold) return t.level;
	}
	return 'dry';
}
```

Fill in the two `…` lines. **Test it:**

```bash
node -e "
import('./src/lib/sensors.js').then(({ waterLevel }) => {
  let level = 'dry';
  for (const d of [0.28, 0.31, 0.29, 0.31, 0.27, 0.29, 0.24]) {
    level = waterLevel(d, level);
    console.log(d, level, '   without hysteresis:', waterLevel(d, 'dry'));
  }
});"
```

With hysteresis the sensor should go *watch, warning*, and stay at *warning* until 0.24 m, where it drops to *watch*. Without, it changes level at almost every reading.

## 3.4 · Remember the levels on the page

Hysteresis needs each sensor's **previous** level, so the page has to remember levels between refreshes. In `+page.svelte`:

```js
let levels = $state({});   // { 'TBM-01': 'stale', 'TBM-02': 'dry', … }
let changes = $state({});  // how often each level changed since the page opened
```

Write `function updateLevels()` and call it in `load()`, right after the new `live` data has arrived. For each site it:

1. computes the new level with `classify(site, readingFor(site.id), levels[site.id])`;
2. if there was a level before and it's different, adds one to `changes[site.id]`;
3. at the end, replaces `levels` with the new levels.

Build the new levels in a new object `next` and assign `levels = next` at the end, so `classify` always gets the **previous** level, never one you just changed.

## 3.5 · Colours on the map

`toGeoJSON` should give every feature its level and colour. Add a third parameter, `levels = {}`, and two properties:

```js
const level = levels[site.id] ?? 'stale';
// in properties:
level,
colour: LEVELS[level].colour
```

On the page: `let geojson = $derived(toGeoJSON(sites, live, levels));`

In `MapLibreMap.svelte`, let each dot take its colour **from its data**, with an expression:

```js
'circle-color': ['get', 'colour'],
```

And draw the most severe dots **on top** of others nearby, in the layer's `layout`:

```js
layout: {
	'circle-sort-key': ['match', ['get', 'level'], 'danger', 3, 'warning', 2, 'watch', 1, 0]
},
```

`match` works like a lookup table: *danger* → 3, *warning* → 2, *watch* → 1, anything else → 0. Higher is drawn later, so on top.

Add the level to the popup too: `LEVELS[p.level].label`.

## 3.6 · The banner, the legend and the table

**The alert banner**, above the map: the sensors at *Warning* or *Danger*, *Danger* first. Two derived values:

```js
let alerts = $derived(
	sites
		.filter((s) => levels[s.id] === 'danger' || levels[s.id] === 'warning')
		.sort((a, b) => (levels[b.id] === 'danger') - (levels[a.id] === 'danger'))
);
let untrusted = $derived(sites.filter((s) => levels[s.id] === 'stale' || levels[s.id] === 'suspect').length);
```

Show *"3 sensors at warning or danger: TBM-05 (0.52 m), …"*, or *"No flood warnings."* when the list is empty. Under it, in small print: *"12 of 33 sensors have no recent or no trustworthy data."* Give the banner a red look (`class:alert={alerts.length > 0}`) when there are alerts.

`class:alert={condition}` adds the CSS class `alert` only while the condition is true.

**The legend**, under the map: a coloured dot and a label for every entry in `LEVELS`. `Object.entries(LEVELS)` gives you `[key, { label, colour }]` pairs to loop over with `{#each}`. Set the colour with `style:background={l.colour}`.

**The table:** add a **Level** column (a coloured dot and the label) and a **Changes** column (`changes[site.id] ?? 0`). Grey out rows of sensors at *stale* or *suspect*.

## Check

Restart the API in the middle of the rain event, so there is something to see:

```bash
REPLAY_START=2026-11-04T15:00 python api/main.py
```

- [ ] The dots have colours; several are orange or red. The banner lists them, *Danger* first.
- [ ] TBM-01 is grey (*No recent data*), TBM-14 is purple (*Suspect*).
- [ ] The legend shows all six levels.
- [ ] Press **Refresh** every few seconds: the **Changes** column counts up slowly.
- [ ] Set `HYSTERESIS_M = 0`, refresh for a minute: more changes. Set it back to `0.05`.

Commit your work.

## Stuck?

| Problem | Try |
|---|---|
| Every dot is grey | `levels` is empty when the GeoJSON is made: is `updateLevels()` called after `live` is set? Is `levels` passed to `toGeoJSON`? |
| Every sensor is *Suspect* | Check the `sensor_height_m` comparison: `>`, not `<` |
| *Changes* counts up at every refresh for every sensor | You compare with the level you just computed, not the previous one. Build `next` and assign it at the end |
| `Cannot read properties of undefined (reading 'colour')` | A level name that isn't in `LEVELS`: check the spelling (`'stale'`, `'suspect'`) |

Compare: `git diff step-3 -- app/src`.

<details>
<summary>📄 <code>app/src/lib/sensors.js</code> as it is at <code>step-3</code></summary>

```js
// Helpers shared by the page and the map engines.

// ── Step 3: from a number to a decision ───────────────────────────────────────

// Water depth on a street, in metres. These are teaching values, not an official standard:
//   0.15 m  over the kerb, ankle deep
//   0.30 m  cars stall, hard to walk
//   0.50 m  dangerous for people and vehicles
// Ordered from the most to the least severe.
export const THRESHOLDS = [
	{ level: 'danger', depth_m: 0.5 },
	{ level: 'warning', depth_m: 0.3 },
	{ level: 'watch', depth_m: 0.15 }
];

// Hysteresis: a sensor enters a level at its threshold, but only leaves it when the water drops
// this much BELOW the threshold. Without it, a level that hovers around 0.30 m switches
// warning → watch → warning → … at every reading. Set it to 0 to see that happen.
export const HYSTERESIS_M = 0.05;

// A reading older than this is not "now" any more.
export const STALE_AFTER_S = 30 * 60;

// Readings below this can't be water depth: the sensor or its calibration is wrong.
// (Small negatives such as −0.02 m are measurement noise around zero.)
export const SUSPECT_BELOW_M = -0.1;

// Every level, with its colour. The map and the table both use this.
export const LEVELS = {
	danger: { label: 'Danger', colour: '#c62828' },
	warning: { label: 'Warning', colour: '#ef6c00' },
	watch: { label: 'Watch', colour: '#f9c80e' },
	dry: { label: 'Dry', colour: '#5b8db8' },
	suspect: { label: 'Suspect', colour: '#8e5bb5' },
	stale: { label: 'No recent data', colour: '#b0b0b0' }
};

const RANK = { dry: 0, watch: 1, warning: 2, danger: 3 };

// The water level for a depth, given the level the sensor had last time.
export function waterLevel(depth, previous = 'dry') {
	for (const t of THRESHOLDS) {
		// Already at this level (or higher) last time? Then use the lower "leave" threshold.
		const alreadyThere = (RANK[previous] ?? 0) >= RANK[t.level];
		const threshold = alreadyThere ? t.depth_m - HYSTERESIS_M : t.depth_m;
		if (depth >= threshold) return t.level;
	}
	return 'dry';
}

// The full status of one sensor: first "can we trust this reading?", then "how deep is it?".
export function classify(site, reading, previous) {
	if (!reading || reading.age_s > STALE_AFTER_S) return 'stale';
	if (reading.depth_m < SUSPECT_BELOW_M || reading.depth_m > site.sensor_height_m) return 'suspect';
	return waterLevel(reading.depth_m, previous);
}

// ── Step 2: GeoJSON for the maps ──────────────────────────────────────────────

// Turn the API's sites + latest readings into GeoJSON: the format every web map understands.
// One Point feature per sensor; the reading and its level go into the feature's properties.
export function toGeoJSON(sites, live, levels = {}) {
	return {
		type: 'FeatureCollection',
		features: sites.map((site) => {
			const r = live?.readings.find((r) => r.site === site.id);
			const level = levels[site.id] ?? 'stale';
			return {
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [site.lon, site.lat] }, // GeoJSON is [lon, lat]!
				properties: {
					id: site.id,
					type: site.type,
					depth_m: r?.depth_m ?? null,
					time: r?.time ?? null,
					age_s: r?.age_s ?? null,
					level,
					colour: LEVELS[level].colour
				}
			};
		})
	};
}

// ── Display helpers ───────────────────────────────────────────────────────────

// Times in the API are Unix seconds in UTC. Convert them only for display.
export function showTime(seconds) {
	if (seconds == null) return '–';
	return new Date(seconds * 1000).toLocaleString('en-GB', {
		timeZone: 'Asia/Kolkata',
		day: '2-digit',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function showAge(seconds) {
	if (seconds == null) return '–';
	if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
	if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
	return `${Math.round(seconds / 86400)} days`;
}
```

</details>

<details>
<summary>🔍 What changed in <code>app/src/lib/MapLibreMap.svelte</code> from <code>step-2</code> to <code>step-3</code></summary>

```diff
--- a/app/src/lib/MapLibreMap.svelte
+++ b/app/src/lib/MapLibreMap.svelte
@@ -3,5 +3,5 @@
 	import * as maplibregl from 'maplibre-gl';
 	import 'maplibre-gl/dist/maplibre-gl.css';
-	import { showTime, showAge } from '#lib/sensors.js';
+	import { showTime, showAge, LEVELS } from '#lib/sensors.js';
 
 	// Step 2: the sensors on a 2D web map with MapLibre GL.
@@ -36,7 +36,12 @@
 				type: 'circle',
 				source: 'sensors',
+				layout: {
+					// Step 3: draw the most severe sensors on top.
+					'circle-sort-key': ['match', ['get', 'level'], 'danger', 3, 'warning', 2, 'watch', 1, 0]
+				},
 				paint: {
 					'circle-radius': 7,
-					'circle-color': '#1f6fb2',
+					// Step 3: each feature carries its own colour (set in toGeoJSON).
+					'circle-color': ['get', 'colour'],
 					'circle-stroke-width': 1.5,
 					'circle-stroke-color': '#ffffff'
@@ -66,5 +71,5 @@
 					.setLngLat(e.features[0].geometry.coordinates)
 					.setHTML(
-						`<strong>${p.id}</strong> · ${p.type}<br>
+						`<strong>${p.id}</strong> · ${p.type} · <strong>${LEVELS[p.level].label}</strong><br>
 						 Depth: ${p.depth_m ?? '–'} m<br>
 						 Measured: ${showTime(p.time)} IST (${showAge(p.age_s)} ago)`
```

</details>

<details>
<summary>📄 <code>app/src/routes/+page.svelte</code> as it is at <code>step-3</code></summary>

```svelte
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
```

</details>

**Why it was done this way, things to try, questions:** [STEPS.md, step 3](../STEPS.md#step-3--threshold-colours-alert-banner-hysteresis--step-3).

---

## Walkthrough: step 3 in small pieces, with all the code

Start the API in the middle of the rain event, so there is water to see:

```bash
REPLAY_START=2026-11-04T15:00 python api/main.py
```

### 3.A · The rules, at the top of `sensors.js`

Put this at the **top** of `app/src/lib/sensors.js`, above `toGeoJSON`:

```js
// ── From a number to a decision ───────────────────────────────────────────────

// Water depth on a street, in metres (teaching values, not an official standard).
// Ordered from the most to the least severe.
export const THRESHOLDS = [
	{ level: 'danger', depth_m: 0.5 },
	{ level: 'warning', depth_m: 0.3 },
	{ level: 'watch', depth_m: 0.15 }
];

// A sensor leaves a level only when the water drops this much BELOW its threshold.
export const HYSTERESIS_M = 0.05;

// A reading older than this is not "now" any more.
export const STALE_AFTER_S = 30 * 60;

// Readings below this can't be water depth: the sensor or its calibration is wrong.
export const SUSPECT_BELOW_M = -0.1;

// Every level, with its colour. The map and the table both use this.
export const LEVELS = {
	danger: { label: 'Danger', colour: '#c62828' },
	warning: { label: 'Warning', colour: '#ef6c00' },
	watch: { label: 'Watch', colour: '#f9c80e' },
	dry: { label: 'Dry', colour: '#5b8db8' },
	suspect: { label: 'Suspect', colour: '#8e5bb5' },
	stale: { label: 'No recent data', colour: '#b0b0b0' }
};
```

**You see:** nothing changes yet. Just check the browser console stays free of errors.

### 3.B · A depth becomes a level (no hysteresis yet)

Below the constants:

```js
// The water level for a depth.
export function waterLevel(depth) {
	for (const t of THRESHOLDS) {
		if (depth >= t.depth_m) return t.level;
	}
	return 'dry';
}
```

Test it in the terminal, in `app/`:

```bash
node -e "
import('./src/lib/sensors.js').then(({ waterLevel }) => {
  for (const d of [0, 0.14, 0.15, 0.31, 0.5, 2]) console.log(d, waterLevel(d));
});"
```

**You see:** `0 dry`, `0.14 dry`, `0.15 watch`, `0.31 warning`, `0.5 danger`, `2 danger`.

### 3.C · Hysteresis

Replace `waterLevel` with the version that remembers the previous level:

```js
const RANK = { dry: 0, watch: 1, warning: 2, danger: 3 };

// The water level for a depth, given the level the sensor had last time.
export function waterLevel(depth, previous = 'dry') {
	for (const t of THRESHOLDS) {
		// Already at this level (or higher) last time? Then use the lower "leave" threshold.
		const alreadyThere = (RANK[previous] ?? 0) >= RANK[t.level];
		const threshold = alreadyThere ? t.depth_m - HYSTERESIS_M : t.depth_m;
		if (depth >= threshold) return t.level;
	}
	return 'dry';
}
```

```bash
node -e "
import('./src/lib/sensors.js').then(({ waterLevel }) => {
  let level = 'dry';
  for (const d of [0.28, 0.31, 0.29, 0.31, 0.27, 0.29, 0.24]) {
    level = waterLevel(d, level);
    console.log(d, level, '   without hysteresis:', waterLevel(d, 'dry'));
  }
});"
```

**You see:** with hysteresis: *watch, warning, warning, warning, warning, warning, watch*. Without: *watch, warning, watch, warning, watch, watch, watch*.

### 3.D · Trust first: `classify`

Below `waterLevel`:

```js
// The full status of one sensor: first "can we trust this reading?", then "how deep is it?".
export function classify(site, reading, previous) {
	if (!reading || reading.age_s > STALE_AFTER_S) return 'stale';
	if (reading.depth_m < SUSPECT_BELOW_M || reading.depth_m > site.sensor_height_m) return 'suspect';
	return waterLevel(reading.depth_m, previous);
}
```

### 3.E · A Level column in the table

In `+page.svelte`, import the new things:

```js
	import { toGeoJSON, classify, LEVELS, showTime, showAge } from '#lib/sensors.js';
```

Keep each sensor's level, and count how often it changes. After `let live = …`:

```js
	// The level of each sensor, and how often it changed since you opened the page.
	// We keep the previous levels because hysteresis needs them.
	let levels = $state({});
	let changes = $state({});
```

A function that computes all levels, after `load`:

```js
	function updateLevels() {
		const next = {};
		for (const site of sites) {
			const level = classify(site, readingFor(site.id), levels[site.id]);
			if (levels[site.id] && levels[site.id] !== level) changes[site.id] = (changes[site.id] ?? 0) + 1;
			next[site.id] = level;
		}
		levels = next;
	}
```

Call it in `load()`, right after `live = await liveRes.json();`:

```js
			updateLevels();
```

In the table, inside the `{#each}`, after `{@const r = …}`:

```svelte
				{@const level = levels[site.id] ?? 'stale'}
```

and a cell after the depth:

```svelte
					<td><i style:background={LEVELS[level].colour}></i>{LEVELS[level].label}</td>
```

with `<th>Level</th>` in the header. In the `<style>`, make the `<i>` a little coloured dot:

```css
	i {
		display: inline-block;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 50%;
		margin-right: 0.35rem;
		vertical-align: -0.1rem;
	}
```

**You see:** every row has a level: TBM-01 *No recent data*, TBM-14 *Suspect*, several *Warning* or *Danger*.

### 3.F · The Changes column

A last column, with `<th>Changes</th>`:

```svelte
					<td>{changes[site.id] ?? 0}</td>
```

Grey out rows you can't trust: on the `<tr>`, add `class:faded={level === 'stale' || level === 'suspect'}`, and in the CSS `.faded { color: #888; }`.

**You see:** press **Refresh** every few seconds for a minute: some counters go up.

### 3.G · Colours on the map

In `sensors.js`, give every feature its level and colour. Change `toGeoJSON`:

```js
export function toGeoJSON(sites, live, levels = {}) {
	return {
		type: 'FeatureCollection',
		features: sites.map((site) => {
			const r = live?.readings.find((r) => r.site === site.id);
			const level = levels[site.id] ?? 'stale';
			return {
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [site.lon, site.lat] },
				properties: {
					id: site.id,
					type: site.type,
					depth_m: r?.depth_m ?? null,
					time: r?.time ?? null,
					age_s: r?.age_s ?? null,
					level,
					colour: LEVELS[level].colour
				}
			};
		})
	};
}
```

In `+page.svelte`, pass the levels: `let geojson = $derived(toGeoJSON(sites, live, levels));`

In `MapLibreMap.svelte`, the `sensor-dots` layer takes its colour from the data, and draws the most severe on top:

```js
			m.addLayer({
				id: 'sensor-dots',
				type: 'circle',
				source: 'sensors',
				layout: {
					// Draw the most severe sensors on top.
					'circle-sort-key': ['match', ['get', 'level'], 'danger', 3, 'warning', 2, 'watch', 1, 0]
				},
				paint: {
					'circle-radius': 7,
					'circle-color': ['get', 'colour'], // each feature carries its own colour
					'circle-stroke-width': 1.5,
					'circle-stroke-color': '#ffffff'
				}
			});
```

Add the level to the popup: import `LEVELS` from `#lib/sensors.js`, and change the popup's first line to:

```js
						`<strong>${p.id}</strong> · ${p.type} · <strong>${LEVELS[p.level].label}</strong><br>
```

**You see:** yellow, orange, red, blue, purple and grey dots, the same colours as in the table.

### 3.H · The alert banner

In the script of `+page.svelte`, after `geojson`:

```js
	// The alert banner: every sensor at warning or danger, most severe first.
	let alerts = $derived(
		sites
			.filter((s) => levels[s.id] === 'danger' || levels[s.id] === 'warning')
			.sort((a, b) => (levels[b.id] === 'danger') - (levels[a.id] === 'danger'))
	);
	let untrusted = $derived(sites.filter((s) => levels[s.id] === 'stale' || levels[s.id] === 'suspect').length);
```

Above the map:

```svelte
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
```

and its style:

```css
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
```

**You see:** a red banner: *5 sensors at warning or danger: TBM-…*, *Danger* first. Restart the API without `REPLAY_START` (before the rain): a blue banner, *No flood warnings.*

### 3.I · The legend

Under `<MapLibreMap {geojson} />`:

```svelte
	<p class="legend">
		{#each Object.entries(LEVELS) as [key, l] (key)}
			<span><i style:background={l.colour}></i>{l.label}</span>
		{/each}
	</p>
```

```css
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		font-size: 0.85rem;
	}
```

**You see:** the six levels with their colours under the map. The page now matches the reference above. Commit.


---

[Step 4 · Live updates →](04-live.md)

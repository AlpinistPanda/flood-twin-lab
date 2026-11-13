# Step 8 · The flood over time

[← Step 7](07-flood-layers.md) · [Guide overview](README.md) · [Step 9 →](09-containers.md)

**You build:** a second flood layer, the depth **at every hour** of the 100-year flood (119 hourly maps in one file), with a **time bar** along the bottom of the map: a slider from *Time 0:00* to *Time 118:00*, a ▶ button, and the wet area through the event. The two flood layers become **one choice**: *None*, *Maximum depth* or *Over time*.
**You learn:** multi-band rasters; storing values as integers with a scale factor; redrawing a raster with other data; radio buttons for exclusive layers.
**Time:** about 75 minutes.
**Start from:** your step 7, or the tag `step-7`. You already copied the two files for this step in step 7.

---

## The data

| File | What |
|---|---|
| `depth_timeseries_100yr.tif` | A COG with **119 bands**, one per hour: band 1 is *Time 0:00*, band 119 is *Time 118:00*. 16.9 MB |
| `depth_timeseries_100yr.json` | Which model step each band is, the minutes between steps, and the wet area per step |

```json
{
  "file": "depth_timeseries_100yr.tif",
  "unit": "cm",
  "nodata": 65535,
  "steps": [0, 1, 2, …, 118],
  "minutes_per_step": 60,
  "wet_km2": [2.48, 2.77, 2.83, …]
}
```

**Centimetres, not metres.** The max-depth file stores metres as decimal numbers (32 bits per cell). This one stores **whole centimetres** as 16-bit integers, like the RHT platform: four times smaller, and nothing is lost, because the depths were already rounded to the centimetre. `65535`, the largest 16-bit number, means *no data or dry*. The file also carries a **scale factor** of 0.01, so QGIS shows metres.

*Store centimetres, compute in metres.* You'll meet both in the code: your colour function gets the **raw** centimetres; the plugin's `locationValues()` applies the scale factor and gives you metres.

## 8.1 · One layer per time step? No: one layer, redrawn

You could add 119 raster layers and show one at a time. That's 119 sources and a lot of memory. Instead there is **one** layer, and the colour function draws whichever band is chosen:

```js
export const TIMESERIES_URL = `${location.origin}/layers/depth_timeseries_100yr.tif`;
const NODATA_CM = 65535;
let shownBand = 0;

const colourDepthAtStep = (pixel, colour) => {
	const cm = pixel[shownBand];       // pixel has one value per band: 119 of them
	paint(cm === NODATA_CM ? NaN : cm / 100, colour);
};
```

In `scenario.js`:

1. **Split** your step 7 colour function in two: `paint(depth, colour)` that colours one depth in metres, and the max-depth version, which calls it: `const colourDepth = ([depth], colour) => paint(depth, colour);`. Both rasters now share one set of colours and one legend.
2. **Register** both colour functions in one `registerOnce()` function, and call it from `addFloodDepth` and from the new `addFloodTimeseries`.
3. **`addFloodTimeseries(map, band, beforeId)`**: like `addFloodDepth`, with source and layer id `flood-time`, and `'raster-fade-duration': 0` in `paint` (otherwise every time step fades in slowly). It sets `shownBand = band` first.
4. **`showFloodStep(map, band, beforeId)`**: to show another band, **remove** the layer and its source, and **add them again** with the new band. MapLibre then asks for the tiles again, and the plugin colours them with the new `shownBand`. The plugin keeps the bytes it already downloaded, so this costs no new download. Keep the layer's visibility as it was.
5. **`timeseriesInfo()`**: fetch the JSON **once** and remember the promise, so every caller gets the same answer:

   ```js
   let meta;
   export async function timeseriesInfo() {
   	meta ??= fetch('/layers/depth_timeseries_100yr.json').then((r) => r.json());
   	return meta;
   }
   ```

6. **`floodDepthAtStep(lngLat)`**: like `floodDepthAt`, but `locationValues` now returns 119 values; take `values[shownBand]`. These are already metres.

## 8.2 · Two flood layers, one choice

Showing the maximum depth and the depth at 14:00 on top of each other makes no sense: two blue rasters, one legend. They form a **group**: one of them, or none.

In `layers.svelte.js`:

```js
export const GROUPS = { flood: 'Flood depth, 100-year flood' };

// in layers:
flood: { label: 'Max flood depth, 100-year flood', visible: false, legend: 'depth', group: 'flood', option: 'Maximum depth' },
floodTime: { label: 'Flood depth over time, 100-year flood', visible: false, legend: 'depth', group: 'flood', option: 'Over time', band: 0 }
```

`band` is the time step on the slider. Because it lives in the shared layers state, the map and the time bar can both read and change it.

In `LayerPanel.svelte`, draw a layer that has a `group` differently: **once per group** (at its first member), as a `<fieldset>` with the group's title, a radio button *None*, and a radio button per member (its `option`), then **one** depth legend if any member is on. Helpers make it short:

```js
const members = (group) => Object.entries(layers).filter(([, l]) => l.group === group);
const chosen = (group) => members(group).find(([, l]) => l.visible)?.[0] ?? null;
function choose(group, id) {
	for (const [key, l] of members(group)) l.visible = key === id; // on for the chosen one, off for the rest
}
```

```svelte
<input type="radio" checked={member.visible} onchange={() => choose(layer.group, key)} />
```

Layers without a group keep their checkbox.

## 8.3 · The time bar: `app/src/lib/FloodTimeBar.svelte`

A white bar floating at the bottom centre of the map (`position: absolute; bottom: 34px; left: 50%; transform: translateX(-50%)`), shown only while *Over time* is chosen. It works directly on `layers.floodTime`.

1. **Load the info** with `timeseriesInfo()`, and draw nothing until it has arrived.
2. **The slider**, from band 0 to the last band:

   ```svelte
   <input type="range" min="0" max={last} step="1" bind:value={layer.band} />
   ```

3. **The time** above it: *Time 59:00*. From the band: `info.steps[band] * info.minutes_per_step` minutes; write hours and minutes as `H:MM`.
4. **The wet area** at this time, from `info.wet_km2[band]`: *3.41 km² wet*.
5. **▶ / ❚❚**: play one hour every 250 ms (the whole event in about 30 seconds) with `setInterval`; stop at the end; at the end, ▶ starts again from 0. Stop playing when the user drags the slider, and when the bar disappears (`onDestroy`).
6. **Ticks and labels** under the slider: a tick per hour, a longer one every 12 hours with its label (*0:00, 12:00, 24:00, …*). Place them in percent of the width: `(i / last) * 100`.
7. **Optional:** above the slider, the wet area through the event as a small filled SVG chart, with a line at the current time. You can see at a glance when the flood peaks.

Put the bar on the map page, in `routes/maplibre/+page.svelte`, inside `MapPage`:

```svelte
{#if layers.floodTime.visible}
	<FloodTimeBar />
{/if}
```

## 8.4 · The map follows the slider

In `MapLibreMap.svelte`, one more `$effect`. It reads `layers.floodTime.visible` and `layers.floodTime.band`, so it runs every time either changes:

- If the layer is on and doesn't exist yet: `addFloodTimeseries(map, band, below)`, where `below` is the buildings layer if it exists, otherwise the first label layer (as in step 7).
- If it exists: `showFloodStep(map, band, below)`, and set its visibility.

In the click handler: if *Over time* is on, show the depth at **this time step** with `floodDepthAtStep`, and the time (*100-year scenario, Time 59:00*). Check `floodTime` before `flood`.

## Check

- [ ] The Layers box has a *Flood depth* group with *None*, *Maximum depth*, *Over time*. Only one can be on.
- [ ] *Over time*: the time bar appears at the bottom, at *Time 0:00*, and a little water is on the map.
- [ ] Drag the slider: the water changes; the time and the wet area follow.
- [ ] ▶: the flood plays in about 30 seconds and stops at *Time 118:00*. Around *Time 59:00* the most is wet.
- [ ] Click the water: the depth **at the time on the slider**. Compare with *Maximum depth* at the same spot: never more.
- [ ] Back to *Maximum depth* or *None*: the time bar disappears.
- [ ] **Network** tab: while you drag, almost no new requests (the plugin reuses what it has).

Commit your work.

## Stuck?

| Problem | Try |
|---|---|
| The time series is all dark blue, or all empty | You colour centimetres as if they were metres (84 instead of 0.84), or `65535` gets a colour. Convert in the colour function |
| The click says 84 m | `locationValues` already gives metres: don't divide by 100 there, only in the colour function |
| The slider moves but the map doesn't change | The effect doesn't read `layers.floodTime.band`, or `showFloodStep` returns early because `shownBand` was already set |
| Each step fades in slowly | `'raster-fade-duration': 0` in the layer's `paint` |
| *Maximum depth* and *Over time* both on | `choose()` must switch the others **off** |
| Error after switching steps: *layer already exists* | Remove the layer **before** the source, then add both again |

Compare: `git diff step-8 -- app/src`.

<details>
<summary>🔍 What changed in <code>app/src/lib/scenario.js</code> from <code>step-7</code> to <code>step-8</code></summary>

```diff
--- a/app/src/lib/scenario.js
+++ b/app/src/lib/scenario.js
@@ -8,4 +8,11 @@
 // Both are plain files in app/static/layers/, served by the web server like an image.
 // No tile server, no database: the browser reads only the parts it needs.
+//
+// Step 8: a third file, the flood OVER TIME:
+//
+//   depth_timeseries_100yr.tif  RASTER with one band per time step (30 of them). Stored like the
+//                               RHT platform does: whole centimetres as 16-bit integers, 65535 =
+//                               no data. Four times smaller than decimal metres.
+//   depth_timeseries_100yr.json Which model step each band is, and the wet area per step.
 
 import * as maplibregl from 'maplibre-gl';
@@ -15,4 +22,6 @@ import { waterLevel, LEVELS } from '#lib/sensors.js';
 export const FLOOD_URL = `${location.origin}/layers/max_depth_100yr.tif`;
 export const BUILDINGS_URL = '/layers/buildings_exposure.geojson';
+export const TIMESERIES_URL = `${location.origin}/layers/depth_timeseries_100yr.tif`;
+const TIMESERIES_META_URL = '/layers/depth_timeseries_100yr.json';
 
 // Depth classes for the raster, light to dark blue. [from (m), colour]
@@ -27,6 +36,6 @@ export const DEPTH_CLASSES = [
 const RGB = DEPTH_CLASSES.map(([from, hex]) => [from, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]);
 
-// Called for EVERY pixel of every tile, so keep it simple and fast.
-function colourDepth([depth], colour) {
+// One depth (m) → one colour. Called for EVERY pixel of every tile, so keep it simple and fast.
+function paint(depth, colour) {
 	if (!(depth >= DEPTH_CLASSES[0][0])) return colour.set([0, 0, 0, 0]); // dry, or no data (NaN): transparent
 	let rgb = RGB[0][1];
@@ -35,14 +44,28 @@ function colourDepth([depth], colour) {
 }
 
+// The max-depth file holds metres, one band.
+const colourDepth = ([depth], colour) => paint(depth, colour);
+
+// The time series holds centimetres, one band per time step. Which band to show is `shownBand`.
+const NODATA_CM = 65535;
+let shownBand = 0;
+const colourDepthAtStep = (pixel, colour) => {
+	const cm = pixel[shownBand];
+	paint(cm === NODATA_CM ? NaN : cm / 100, colour); // we store centimetres, we compute in metres
+};
+
 let registered = false;
+function registerOnce() {
+	if (registered) return;
+	maplibregl.addProtocol('cog', cogProtocol); // once per page
+	setColorFunction(FLOOD_URL, colourDepth);
+	setColorFunction(TIMESERIES_URL, colourDepthAtStep);
+	registered = true;
+}
 
 // The raster. `cog://` tells MapLibre to hand the URL to the COG plugin, which reads the
 // GeoTIFF in the browser with HTTP range requests and turns it into map tiles.
 export function addFloodDepth(map, beforeId) {
-	if (!registered) {
-		maplibregl.addProtocol('cog', cogProtocol); // once per page
-		setColorFunction(FLOOD_URL, colourDepth);
-		registered = true;
-	}
+	registerOnce();
 	map.addSource('flood', { type: 'raster', url: `cog://${FLOOD_URL}`, tileSize: 256 });
 	map.addLayer({ id: 'flood-depth', type: 'raster', source: 'flood', paint: { 'raster-opacity': 0.8 } }, beforeId);
@@ -57,4 +80,50 @@ export async function floodDepthAt(lngLat) {
 }
 
+// ── Step 8: the flood over time ──────────────────────────────────────────────
+
+// Which model step each band holds, and the wet area per step. Loaded once.
+let meta;
+export async function timeseriesInfo() {
+	meta ??= fetch(TIMESERIES_META_URL).then((r) => r.json());
+	return meta;
+}
+
+// Show time step `band` (0 = the first band). The colours are made when MapLibre asks the plugin
+// for a tile, so to show another step we remove the layer and its source and add them again:
+// MapLibre asks for the tiles again, and the plugin colours them with the new band. The plugin
+// keeps the bytes it has already downloaded, so changing the step costs no new download here.
+export function addFloodTimeseries(map, band, beforeId) {
+	registerOnce();
+	shownBand = band;
+	map.addSource('flood-time', { type: 'raster', url: `cog://${TIMESERIES_URL}`, tileSize: 256 });
+	map.addLayer(
+		{
+			id: 'flood-time',
+			type: 'raster',
+			source: 'flood-time',
+			paint: { 'raster-opacity': 0.8, 'raster-fade-duration': 0 }
+		},
+		beforeId
+	);
+}
+
+export function showFloodStep(map, band, beforeId) {
+	if (band === shownBand || !map.getLayer('flood-time')) return;
+	const visibility = map.getLayoutProperty('flood-time', 'visibility');
+	map.removeLayer('flood-time');
+	map.removeSource('flood-time');
+	addFloodTimeseries(map, band, beforeId);
+	map.setLayoutProperty('flood-time', 'visibility', visibility ?? 'visible');
+}
+
+// The depth at one place at the shown time step, in metres (null: dry or no data).
+// Unlike the colour function above, locationValues() applies the file's scale factor for us:
+// it returns metres (0.84), not centimetres (84), and NaN where the file says "no data".
+export async function floodDepthAtStep(lngLat) {
+	const values = await locationValues(TIMESERIES_URL, { latitude: lngLat.lat, longitude: lngLat.lng }, 16);
+	const depth = values[shownBand];
+	return Number.isFinite(depth) && depth >= DEPTH_CLASSES[0][0] ? depth : null;
+}
+
 // The vector layer: building outlines, coloured with the SAME thresholds as the sensors (step 3).
 export function addBuildings(map, beforeId) {
```

</details>

<details>
<summary>🔍 What changed in <code>app/src/lib/layers.svelte.js</code> from <code>step-7</code> to <code>step-8</code></summary>

```diff
--- a/app/src/lib/layers.svelte.js
+++ b/app/src/lib/layers.svelte.js
@@ -9,8 +9,16 @@
 // Step 7: two layers from a flood scenario. They start switched off, and their data is only
 // downloaded the first time you switch them on. Drawn on the MapLibre page only.
+//
+// Step 8: the flood over time. `band` is the time step on the slider (0 = the first one).
+// The two flood layers form a GROUP: you see one of them, or none. Both on at once would put two
+// blue rasters on top of each other, with one legend for both.
+
+// The groups, and the title they get in the layer panel.
+export const GROUPS = { flood: 'Flood depth, 100-year flood' };
 
 export const layers = $state({
 	sensors: { label: 'Water-level sensors (live)', visible: true, legend: 'levels' },
 	buildings: { label: 'Buildings exposed, 100-year flood', visible: false, legend: 'exposure' },
-	flood: { label: 'Max flood depth, 100-year flood', visible: false, legend: 'depth' }
+	flood: { label: 'Max flood depth, 100-year flood', visible: false, legend: 'depth', group: 'flood', option: 'Maximum depth' },
+	floodTime: { label: 'Flood depth over time, 100-year flood', visible: false, legend: 'depth', group: 'flood', option: 'Over time', band: 0 }
 });
```

</details>

<details>
<summary>🔍 What changed in <code>app/src/lib/LayerPanel.svelte</code> from <code>step-7</code> to <code>step-8</code></summary>

```diff
--- a/app/src/lib/LayerPanel.svelte
+++ b/app/src/lib/LayerPanel.svelte
@@ -1,4 +1,4 @@
 <script>
-	import { layers } from '#lib/layers.svelte.js';
+	import { layers, GROUPS } from '#lib/layers.svelte.js';
 	import { LEVELS } from '#lib/sensors.js';
 	import { DEPTH_CLASSES } from '#lib/scenario.js';
@@ -8,4 +8,12 @@
 	let { supported = Object.keys(layers) } = $props();
 	let open = $state(true);
+
+	// Step 8: layers in a group are shown as one choice (radio buttons): one of them, or none.
+	const members = (group) => Object.entries(layers).filter(([, l]) => l.group === group);
+	const firstOf = (group) => members(group)[0][0];
+	const chosen = (group) => members(group).find(([, l]) => l.visible)?.[0] ?? null;
+	function choose(group, id) {
+		for (const [key, l] of members(group)) l.visible = key === id;
+	}
 </script>
 
@@ -18,4 +26,32 @@
 		{#each Object.entries(layers) as [id, layer] (id)}
 			{@const ok = supported.includes(id)}
+			{#if layer.group}
+				<!-- A group: drawn once, at its first member, as radio buttons plus one legend -->
+				{#if id === firstOf(layer.group)}
+					<fieldset>
+						<legend>{GROUPS[layer.group]}</legend>
+						<label>
+							<input type="radio" checked={!chosen(layer.group)} onchange={() => choose(layer.group, null)} />
+							None
+						</label>
+						{#each members(layer.group) as [key, member] (key)}
+							{@const can = supported.includes(key)}
+							<label class:off={!can} title={can ? '' : 'Only on the MapLibre page'}>
+								<input type="radio" checked={member.visible} disabled={!can} onchange={() => choose(layer.group, key)} />
+								{member.option}
+							</label>
+						{/each}
+					</fieldset>
+					{#if chosen(layer.group)}
+						<ul class="legend">
+							{#each DEPTH_CLASSES as [from, colour], i (from)}
+								<li>
+									<i class="sq" style:background={colour}></i>{from}{i < DEPTH_CLASSES.length - 1 ? ` – ${DEPTH_CLASSES[i + 1][0]}` : ' and more'} m
+								</li>
+							{/each}
+						</ul>
+					{/if}
+				{/if}
+			{:else}
 			<label class:off={!ok} title={ok ? '' : 'Only on the MapLibre page'}>
 				<input type="checkbox" bind:checked={layer.visible} disabled={!ok} />
@@ -34,12 +70,5 @@
 					<li><i class="sq" style:background={LEVELS.danger.colour}></i>0.50 m and more</li>
 				</ul>
-			{:else if ok && layer.visible && layer.legend === 'depth'}
-				<ul class="legend">
-					{#each DEPTH_CLASSES as [from, colour], i (from)}
-						<li>
-							<i class="sq" style:background={colour}></i>{from}{i < DEPTH_CLASSES.length - 1 ? ` – ${DEPTH_CLASSES[i + 1][0]}` : ' and more'} m
-						</li>
-					{/each}
-				</ul>
+			{/if}
 			{/if}
 		{/each}
@@ -79,4 +108,16 @@
 		font-size: 0.8rem;
 	}
+	fieldset {
+		border: none;
+		margin: 0.45rem 0 0;
+		padding: 0;
+	}
+	fieldset legend {
+		padding: 0;
+		margin-bottom: 0.1rem;
+	}
+	fieldset label {
+		margin: 0.15rem 0 0 1.2rem;
+	}
 	label.off {
 		color: #999;
```

</details>

<details>
<summary>🔍 What changed in <code>app/src/lib/MapLibreMap.svelte</code> from <code>step-7</code> to <code>step-8</code></summary>

```diff
--- a/app/src/lib/MapLibreMap.svelte
+++ b/app/src/lib/MapLibreMap.svelte
@@ -4,5 +4,14 @@
 	import 'maplibre-gl/dist/maplibre-gl.css';
 	import SensorDetail from '#lib/SensorDetail.svelte';
-	import { addFloodDepth, addBuildings, floodDepthAt, buildingPopup } from '#lib/scenario.js';
+	import {
+		addFloodDepth,
+		addBuildings,
+		floodDepthAt,
+		buildingPopup,
+		addFloodTimeseries,
+		showFloodStep,
+		floodDepthAtStep,
+		timeseriesInfo
+	} from '#lib/scenario.js';
 
 	// Step 2: the sensors on a 2D web map with MapLibre GL.
@@ -91,4 +100,10 @@
 				if (building) {
 					new maplibregl.Popup().setLngLat(e.lngLat).setHTML(buildingPopup(building.properties)).addTo(m);
+				} else if (layers.floodTime.visible) {
+					// Step 8: the depth at this place at the time on the slider.
+					const [depth, info] = await Promise.all([floodDepthAtStep(e.lngLat), timeseriesInfo()]);
+					const hours = (info.steps[layers.floodTime.band] * info.minutes_per_step) / 60;
+					const text = depth == null ? 'Dry at this moment' : `Flood depth: <strong>${depth.toFixed(2)} m</strong>`;
+					new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`${text}<br><small>100-year scenario, Time ${hours}:00</small>`).addTo(m);
 				} else if (layers.flood.visible) {
 					const depth = await floodDepthAt(e.lngLat);
@@ -129,4 +144,17 @@
 		}
 	});
+
+	// Step 8: the flood over time, and the time step chosen with the slider.
+	// Like the max-depth raster, it goes under the buildings and the street names.
+	$effect(() => {
+		if (!map) return;
+		const { visible, band } = layers.floodTime;
+		const below = map.getLayer('buildings-exposed') ? 'buildings-exposed' : map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
+		if (visible && !map.getLayer('flood-time')) addFloodTimeseries(map, band, below);
+		if (map.getLayer('flood-time')) {
+			showFloodStep(map, band, below);
+			map.setLayoutProperty('flood-time', 'visibility', visible ? 'visible' : 'none');
+		}
+	});
 </script>
```

</details>

<details>
<summary>📄 <code>app/src/lib/FloodTimeBar.svelte</code> as it is at <code>step-8</code></summary>

```svelte
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
```

</details>

<details>
<summary>📄 <code>app/src/routes/maplibre/+page.svelte</code> as it is at <code>step-8</code></summary>

```svelte
<script>
	import MapPage from '#lib/MapPage.svelte';
	import MapLibreMap from '#lib/MapLibreMap.svelte';
	import FloodTimeBar from '#lib/FloodTimeBar.svelte';
	import { feed } from '#lib/feed.svelte.js';
	import { layers } from '#lib/layers.svelte.js';
</script>

<MapPage>
	<MapLibreMap geojson={feed.geojson} {layers} />
	<!-- Step 8: the time bar along the bottom, while the flood-over-time layer is on -->
	{#if layers.floodTime.visible}
		<FloodTimeBar />
	{/if}
</MapPage>
```

</details>

**Why it was done this way, things to try, questions:** [STEPS.md, step 8](../STEPS.md#step-8--the-flood-over-time-a-time-slider--step-8).

---

[Step 9 · Containers →](09-containers.md)

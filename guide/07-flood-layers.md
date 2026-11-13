# Step 7 · A flood model: one raster, one vector

[← Step 6](06-charts.md) · [Guide overview](README.md) · [Step 8 →](08-flood-time.md)

**You build:** two layers from a 100-year flood **scenario**, next to the live sensors: the **maximum flood depth** as a raster (blue, by depth), and the **buildings it reaches** as a vector layer (coloured with the sensors' thresholds). Click a building for its details, click the water for its depth.
**You learn:** Cloud-Optimized GeoTIFFs in the browser; MapLibre protocols and colour functions; vector fill layers with `step` expressions; layer order; loading layers on demand.
**Time:** about 75 minutes.
**Start from:** your step 6, or the tag `step-6`.

---

## The data

The flood layers are **files**, not an API. Like the sensor API, they are given: they come from a hydrodynamic model run that is not part of this course. Read the *Flood scenario layers* part of [`data/README.md`](../data/README.md).

| File | Type | What |
|---|---|---|
| `max_depth_100yr.tif` | **Raster**, Cloud-Optimized GeoTIFF, 1.9 MB | The deepest water each 10 m cell reaches during the flood, in metres. Web Mercator. Empty (*no data*) where it stays dry |
| `buildings_exposure.geojson` | **Vector**, GeoJSON, 4.1 MB | 14,188 OpenStreetMap buildings with at least 0.15 m of water. Properties: `osm_id`, `use` (the OpenStreetMap building tag), `depth_m` |

Get them into your app. Files in `app/static/` are served as they are, so `app/static/layers/max_depth_100yr.tif` is at `/layers/max_depth_100yr.tif`. In the repository folder:

```bash
git checkout step-9 -- app/static/layers
```

That copies all four layer files from the finished twin (the tag `step-9`) into your app (you need the other two in step 8).

## Raster and vector

| | Raster: flood depth | Vector: buildings |
|---|---|---|
| What it is | A grid: one number per 10 m cell | Shapes, each with properties |
| How it reaches the map | A plugin reads only the parts of the file it needs, and turns them into map tiles **in the browser** | MapLibre downloads the whole file once |
| Colour | Your own JavaScript function, for every pixel | A style expression on `depth_m`, like the sensors |
| Click | Read the number in the file at that spot | The feature's properties |

**Cloud-Optimized GeoTIFF (COG)** is an ordinary GeoTIFF, arranged so that a program can read one small piece of it without downloading the rest: the browser asks for *bytes 1,204,224 to 1,269,759* (an HTTP **range request**), and any web server can answer that. No tile server, no database. It also holds smaller copies of the data (**overviews**) for zoomed-out views.

## 7.1 · Install the COG plugin

MapLibre can't read GeoTIFFs by itself. The plugin `@geomatico/maplibre-cog-protocol` teaches it. In `app/`:

```bash
npm install @geomatico/maplibre-cog-protocol@0.10.0
```

## 7.2 · Everything about the scenario in one file: `app/src/lib/scenario.js`

Keep the map component about *maps*, and put what is specific to this scenario in its own file: the URLs, the colours, how to add each layer, what a click shows.

```js
import * as maplibregl from 'maplibre-gl';
import { cogProtocol, setColorFunction, locationValues } from '@geomatico/maplibre-cog-protocol';
import { waterLevel, LEVELS } from '#lib/sensors.js';

export const FLOOD_URL = `${location.origin}/layers/max_depth_100yr.tif`;
export const BUILDINGS_URL = '/layers/buildings_exposure.geojson';
```

The plugin needs a **full** address (with `https://…`), which `location.origin` gives you.

**a · Depth classes.** Six blues, light to dark, `[from (m), colour]`:

```js
export const DEPTH_CLASSES = [
	[0.05, '#c6dbef'], [0.15, '#9ecae1'], [0.3, '#6baed6'],
	[0.5, '#3182bd'], [1, '#08519c'], [2, '#08306b']
];
```

**b · The colour function.** The plugin calls a function of yours **for every pixel of every tile**, with the pixel's values (one per band) and an array to write the colour into, as `[red, green, blue, alpha]` from 0 to 255:

```js
function colourDepth([depth], colour) {
	if (!(depth >= DEPTH_CLASSES[0][0])) return colour.set([0, 0, 0, 0]); // dry or no data: transparent
	// … find the class for this depth, and colour.set([r, g, b, 210]);
}
```

Write the rest. Turn the hex colours into `[r, g, b]` numbers **once**, outside the function (`parseInt('c6', 16)` is 198): this function runs millions of times. Why `!(depth >= …)` and not `depth < …`? *No data* arrives as `NaN`, and every comparison with `NaN` is false: `NaN < 0.05` is false too, so `NaN` would get a colour. `!(NaN >= 0.05)` is true.

**c · Add the raster to a map.** MapLibre lets you register a **protocol**: addresses that start with `cog://` are handed to the plugin.

```js
let registered = false;

export function addFloodDepth(map, beforeId) {
	if (!registered) {
		maplibregl.addProtocol('cog', cogProtocol); // once per page
		setColorFunction(FLOOD_URL, colourDepth);
		registered = true;
	}
	map.addSource('flood', { type: 'raster', url: `cog://${FLOOD_URL}`, tileSize: 256 });
	map.addLayer({ id: 'flood-depth', type: 'raster', source: 'flood', paint: { 'raster-opacity': 0.8 } }, beforeId);
}
```

`beforeId`: the new layer is drawn **under** the layer with that id. See 7.4.

**d · The depth at a click.** Read the value from the file, not from the colours on screen:

```js
export async function floodDepthAt(lngLat) {
	const [depth] = await locationValues(FLOOD_URL, { latitude: lngLat.lat, longitude: lngLat.lng }, 16);
	return Number.isFinite(depth) && depth >= DEPTH_CLASSES[0][0] ? depth : null;
}
```

The `16` asks for the **full-resolution** data (zoom 16). Without it, at zoom 12 the plugin reads an overview, and can give 0.21 m where the real value is 0.84 m.

**e · The buildings.** A GeoJSON source and a `fill` layer, coloured with the **same thresholds as the sensors**, so a red building and a red sensor mean the same thing. A `step` expression picks a colour by value:

```js
'fill-color': ['step', ['get', 'depth_m'],
	LEVELS.watch.colour,           // below 0.3
	0.3, LEVELS.warning.colour,    // from 0.3
	0.5, LEVELS.danger.colour      // from 0.5
],
```

Write `export function addBuildings(map, beforeId)`, with a source `buildings` and a layer `buildings-exposed`.

**f · The building popup.** `export function buildingPopup(p)` returns the HTML for a building's properties: its OpenStreetMap id, its `use`, the max depth and its level (`waterLevel(p.depth_m)`), and the words *Exposure, not damage*.

## 7.3 · Two new layers in the list

In `layers.svelte.js`, add two entries, **switched off** at the start:

```js
buildings: { label: 'Buildings exposed, 100-year flood', visible: false, legend: 'exposure' },
flood: { label: 'Max flood depth, 100-year flood', visible: false, legend: 'depth' }
```

The layer panel shows them by itself. Add their **legends** in `LayerPanel.svelte`: for `exposure`, the three threshold colours (*0.15 – 0.30 m*, *0.30 – 0.50 m*, *0.50 m and more*); for `depth`, one row per `DEPTH_CLASSES` entry (*0.05 – 0.15 m*, …, *2 m and more*). Square swatches (`border-radius: 2px`) for areas, round dots for the sensors.

**Pages that can't draw a layer.** Later map pages (the extras) may not support every layer. Give `LayerPanel` a prop `supported` (default: every layer), grey out and disable the others, and let `MapPage` pass it on. The MapLibre page supports everything, so it doesn't need to pass anything.

## 7.4 · Draw them, only when asked, in the right order

In `MapLibreMap.svelte`, one more `$effect` for the two scenario layers:

1. **Only when switched on.** The data is downloaded the first time a layer is switched on: if `layers.flood.visible` and there is no `flood-depth` layer yet, call `addFloodDepth`. The same for the buildings. Nobody downloads 4 MB of buildings they never look at.
2. **After that, only show and hide** with `setLayoutProperty(id, 'visibility', …)`, as for the sensors.
3. **Order.** MapLibre draws layers in the order they're added: later on top. You want, from bottom to top: basemap areas and streets, **flood raster**, **buildings**, basemap **labels** (street names stay readable), **sensors**. The first label layer of the basemap is the first layer of type `symbol`:

   ```js
   const underLabels = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
   const underBuildings = map.getLayer('buildings-exposed') ? 'buildings-exposed' : underLabels;
   ```

   Add the buildings under the labels, and the raster under the buildings (or under the labels if there are no buildings yet). Then the order is right whichever layer you switch on first.

**Clicks.** In `m.on('load', …)` add a general click handler (without a layer id). It runs for every click, also on sensors, so first check whether a sensor was hit, and do nothing then (the sensor popup handles it):

```js
m.on('click', async (e) => {
	if (m.queryRenderedFeatures(e.point, { layers: ['sensor-dots'] }).length) return;
	// a building here? (only if the building layer exists) → buildingPopup
	// otherwise, if the flood layer is on → floodDepthAt(e.lngLat), and a popup with the depth
	//   or "Dry in this scenario"
});
```

## Check

- [ ] The Layers box has three layers; the two new ones are off.
- [ ] **Max flood depth** on: blue areas along the water courses, under the street names. Dark blue where it's deep. The legend shows six classes.
- [ ] **Network** tab: requests for `max_depth_100yr.tif` with status **206** (*Partial Content*): range requests. Pan around: more of them.
- [ ] **Buildings exposed** on: yellow, orange and red buildings, **on top of** the blue.
- [ ] Click a building: its popup. Click blue water away from buildings: its depth. Click a dry spot: *Dry in this scenario*. Click a sensor: still the sensor popup, only.
- [ ] Switch the layers off and on: no new download of the GeoJSON.

Commit your work.

## Stuck?

| Problem | Try |
|---|---|
| The flood layer stays empty, console says *Failed to fetch* or *Invalid URL* | `FLOOD_URL` must be a full address: `${location.origin}/layers/…` |
| The whole map area is blue, or tiles are black | Your colour function colours *no data* (`NaN`) or dry cells. Use `!(depth >= …)` |
| The raster hides the street names | Pass `beforeId` (the first `symbol` layer) to `addLayer` |
| The buildings are under the raster | The raster was added after the buildings without `beforeId: 'buildings-exposed'` |
| A click on a sensor opens two popups | The general click handler must return early when a sensor was hit |
| `addProtocol` error when you come back to the map page | Register the protocol only once (the `registered` flag) |
| `/layers/…` gives 404 | The files aren't in `app/static/layers/`: run the `git checkout step-9 -- app/static/layers` again, in the repository folder |

Compare: `git diff step-7 -- app/src`.

<details>
<summary>📄 <code>app/src/lib/scenario.js</code> as it is at <code>step-7</code></summary>

```js
// Step 7: two static layers from a flood MODEL, next to the live SENSORS.
//
//   max_depth_100yr.tif         RASTER: the maximum water depth of a 100-year flood scenario,
//                               one value per 10 m cell, as a Cloud-Optimized GeoTIFF.
//   buildings_exposure.geojson  VECTOR: OpenStreetMap buildings with at least 0.15 m of water in
//                               that scenario, and the depth at each building.
//
// Both are plain files in app/static/layers/, served by the web server like an image.
// No tile server, no database: the browser reads only the parts it needs.

import * as maplibregl from 'maplibre-gl';
import { cogProtocol, setColorFunction, locationValues } from '@geomatico/maplibre-cog-protocol';
import { waterLevel, LEVELS } from '#lib/sensors.js';

export const FLOOD_URL = `${location.origin}/layers/max_depth_100yr.tif`;
export const BUILDINGS_URL = '/layers/buildings_exposure.geojson';

// Depth classes for the raster, light to dark blue. [from (m), colour]
export const DEPTH_CLASSES = [
	[0.05, '#c6dbef'],
	[0.15, '#9ecae1'],
	[0.3, '#6baed6'],
	[0.5, '#3182bd'],
	[1, '#08519c'],
	[2, '#08306b']
];
const RGB = DEPTH_CLASSES.map(([from, hex]) => [from, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]);

// Called for EVERY pixel of every tile, so keep it simple and fast.
function colourDepth([depth], colour) {
	if (!(depth >= DEPTH_CLASSES[0][0])) return colour.set([0, 0, 0, 0]); // dry, or no data (NaN): transparent
	let rgb = RGB[0][1];
	for (const [from, c] of RGB) if (depth >= from) rgb = c;
	colour.set([...rgb, 210]);
}

let registered = false;

// The raster. `cog://` tells MapLibre to hand the URL to the COG plugin, which reads the
// GeoTIFF in the browser with HTTP range requests and turns it into map tiles.
export function addFloodDepth(map, beforeId) {
	if (!registered) {
		maplibregl.addProtocol('cog', cogProtocol); // once per page
		setColorFunction(FLOOD_URL, colourDepth);
		registered = true;
	}
	map.addSource('flood', { type: 'raster', url: `cog://${FLOOD_URL}`, tileSize: 256 });
	map.addLayer({ id: 'flood-depth', type: 'raster', source: 'flood', paint: { 'raster-opacity': 0.8 } }, beforeId);
}

// The depth in the raster at one place (a click), read from the file, not from the picture.
// Always at full resolution (zoom 16): at lower zooms the plugin reads the COG's overviews,
// coarser copies of the data stored in the file for zoomed-out views, and the value can differ.
export async function floodDepthAt(lngLat) {
	const [depth] = await locationValues(FLOOD_URL, { latitude: lngLat.lat, longitude: lngLat.lng }, 16);
	return Number.isFinite(depth) && depth >= DEPTH_CLASSES[0][0] ? depth : null;
}

// The vector layer: building outlines, coloured with the SAME thresholds as the sensors (step 3).
export function addBuildings(map, beforeId) {
	map.addSource('buildings', { type: 'geojson', data: BUILDINGS_URL });
	map.addLayer(
		{
			id: 'buildings-exposed',
			type: 'fill',
			source: 'buildings',
			paint: {
				'fill-color': [
					'step', ['get', 'depth_m'],
					LEVELS.watch.colour, 0.3, LEVELS.warning.colour, 0.5, LEVELS.danger.colour
				],
				'fill-opacity': 0.85
			}
		},
		beforeId
	);
}

export function buildingPopup(p) {
	const level = waterLevel(p.depth_m);
	return `<strong>Building</strong> · OpenStreetMap ${p.osm_id}<br>
		Type: ${p.use}<br>
		Max flood depth: <strong>${p.depth_m} m</strong> · ${LEVELS[level].label}<br>
		<small>100-year scenario. Exposure, not damage.</small>`;
}
```

</details>

<details>
<summary>📄 <code>app/src/lib/layers.svelte.js</code> as it is at <code>step-7</code></summary>

```js
// Step 5: the information layers you can switch on and off.
//
// Every map page shows the same list, and the choice is shared: switch the sensors off on
// one map page, open another, and they are off there too.
//
// To add a layer: add an entry here, then teach each map component to draw it
// (and to hide it when `visible` is false).
//
// Step 7: two layers from a flood scenario. They start switched off, and their data is only
// downloaded the first time you switch them on. Drawn on the MapLibre page only.

export const layers = $state({
	sensors: { label: 'Water-level sensors (live)', visible: true, legend: 'levels' },
	buildings: { label: 'Buildings exposed, 100-year flood', visible: false, legend: 'exposure' },
	flood: { label: 'Max flood depth, 100-year flood', visible: false, legend: 'depth' }
});
```

</details>

<details>
<summary>🔍 What changed in <code>app/src/lib/MapLibreMap.svelte</code> from <code>step-6</code> to <code>step-7</code></summary>

```diff
--- a/app/src/lib/MapLibreMap.svelte
+++ b/app/src/lib/MapLibreMap.svelte
@@ -4,4 +4,5 @@
 	import 'maplibre-gl/dist/maplibre-gl.css';
 	import SensorDetail from '#lib/SensorDetail.svelte';
+	import { addFloodDepth, addBuildings, floodDepthAt, buildingPopup } from '#lib/scenario.js';
 
 	// Step 2: the sensors on a 2D web map with MapLibre GL.
@@ -82,4 +83,19 @@
 			m.on('mouseleave', 'sensor-dots', () => (m.getCanvas().style.cursor = ''));
 
+			// Step 7: a click that misses the sensors: a building? Otherwise the flood depth there.
+			m.on('click', async (e) => {
+				if (m.queryRenderedFeatures(e.point, { layers: ['sensor-dots'] }).length) return; // handled above
+				const building = m.getLayer('buildings-exposed')
+					? m.queryRenderedFeatures(e.point, { layers: ['buildings-exposed'] })[0]
+					: null;
+				if (building) {
+					new maplibregl.Popup().setLngLat(e.lngLat).setHTML(buildingPopup(building.properties)).addTo(m);
+				} else if (layers.flood.visible) {
+					const depth = await floodDepthAt(e.lngLat);
+					const text = depth == null ? 'Dry in this scenario' : `Max flood depth: <strong>${depth.toFixed(2)} m</strong>`;
+					new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`${text}<br><small>100-year scenario</small>`).addTo(m);
+				}
+			});
+
 			map = m;
 		});
@@ -98,4 +114,19 @@
 		for (const id of ['sensor-dots', 'sensor-labels']) map?.setLayoutProperty(id, 'visibility', visibility);
 	});
+
+	// Step 7: the scenario layers. Added the first time they are switched on (so nobody downloads
+	// them who doesn't look at them), then only shown and hidden.
+	// They go UNDER the basemap's labels, so street names stay readable on top of the water.
+	$effect(() => {
+		if (!map) return;
+		const underLabels = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
+		// The raster always goes below the buildings, whichever is switched on first.
+		const underBuildings = map.getLayer('buildings-exposed') ? 'buildings-exposed' : underLabels;
+		if (layers.flood.visible && !map.getLayer('flood-depth')) addFloodDepth(map, underBuildings);
+		if (layers.buildings.visible && !map.getLayer('buildings-exposed')) addBuildings(map, underLabels);
+		for (const [id, on] of [['flood-depth', layers.flood.visible], ['buildings-exposed', layers.buildings.visible]]) {
+			if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
+		}
+	});
 </script>
```

</details>

<details>
<summary>🔍 What changed in <code>app/src/lib/LayerPanel.svelte</code> from <code>step-6</code> to <code>step-7</code></summary>

```diff
--- a/app/src/lib/LayerPanel.svelte
+++ b/app/src/lib/LayerPanel.svelte
@@ -2,6 +2,9 @@
 	import { layers } from '#lib/layers.svelte.js';
 	import { LEVELS } from '#lib/sensors.js';
+	import { DEPTH_CLASSES } from '#lib/scenario.js';
 
 	// Step 5: switch information layers on and off. Floats over the top-left of every map page.
+	// Step 7: `supported` lists the layers this page can draw; the others are greyed out.
+	let { supported = Object.keys(layers) } = $props();
 	let open = $state(true);
 </script>
@@ -14,9 +17,10 @@
 	{#if open}
 		{#each Object.entries(layers) as [id, layer] (id)}
-			<label>
-				<input type="checkbox" bind:checked={layer.visible} />
+			{@const ok = supported.includes(id)}
+			<label class:off={!ok} title={ok ? '' : 'Only on the MapLibre page'}>
+				<input type="checkbox" bind:checked={layer.visible} disabled={!ok} />
 				{layer.label}
 			</label>
-			{#if layer.visible && layer.legend === 'levels'}
+			{#if ok && layer.visible && layer.legend === 'levels'}
 				<ul class="legend">
 					{#each Object.entries(LEVELS) as [key, l] (key)}
@@ -24,4 +28,18 @@
 					{/each}
 				</ul>
+			{:else if ok && layer.visible && layer.legend === 'exposure'}
+				<ul class="legend">
+					<li><i class="sq" style:background={LEVELS.watch.colour}></i>0.15 – 0.30 m</li>
+					<li><i class="sq" style:background={LEVELS.warning.colour}></i>0.30 – 0.50 m</li>
+					<li><i class="sq" style:background={LEVELS.danger.colour}></i>0.50 m and more</li>
+				</ul>
+			{:else if ok && layer.visible && layer.legend === 'depth'}
+				<ul class="legend">
+					{#each DEPTH_CLASSES as [from, colour], i (from)}
+						<li>
+							<i class="sq" style:background={colour}></i>{from}{i < DEPTH_CLASSES.length - 1 ? ` – ${DEPTH_CLASSES[i + 1][0]}` : ' and more'} m
+						</li>
+					{/each}
+				</ul>
 			{/if}
 		{/each}
@@ -61,4 +79,11 @@
 		font-size: 0.8rem;
 	}
+	label.off {
+		color: #999;
+		cursor: default;
+	}
+	i.sq {
+		border-radius: 2px;
+	}
 	i {
 		display: inline-block;
```

</details>

<details>
<summary>🔍 What changed in <code>app/src/lib/MapPage.svelte</code> from <code>step-6</code> to <code>step-7</code></summary>

```diff
--- a/app/src/lib/MapPage.svelte
+++ b/app/src/lib/MapPage.svelte
@@ -5,5 +5,6 @@
 	// Step 5: the frame shared by every map page: the map fills the space, the layer panel
 	// floats on top, and the map goes grey when the feed is lost (step 4).
-	let { children } = $props();
+	// `supported`: which information layers this page can draw (step 7).
+	let { children, supported } = $props();
 </script>
 
@@ -12,5 +13,5 @@
 		{@render children()}
 	</div>
-	<LayerPanel />
+	<LayerPanel {supported} />
 </div>
```

</details>

## Going further: make the web raster yourself

`data/flood/max_depth_100yr_utm.tif` is the same maximum depth on the model's own grid (UTM zone 44N, every value kept). The web version was made from it with **GDAL**, the standard toolbox for rasters. To try it, install GDAL (`conda install -c conda-forge gdal` on your laptop, or `sudo apt-get install -y gdal-bin` in a Codespace), then in the repository folder:

```bash
gdalwarp -t_srs EPSG:3857 -r near -et 0 \
  -of COG -co TILING_SCHEME=GoogleMapsCompatible -co COMPRESS=DEFLATE -co PREDICTOR=YES \
  data/flood/max_depth_100yr_utm.tif app/static/layers/my_max_depth.tif
```

| Option | Why |
|---|---|
| `-t_srs EPSG:3857` | Reproject to Web Mercator, the projection of web maps |
| `-r near` | Nearest neighbour: never invent depths by averaging wet and dry cells |
| `-et 0` | Exact reprojection, no approximation |
| `-of COG -co TILING_SCHEME=GoogleMapsCompatible` | A Cloud-Optimized GeoTIFF whose tiles line up with the map's tiles |
| `-co COMPRESS=DEFLATE -co PREDICTOR=YES` | Smaller file, no loss |

Point `FLOOD_URL` at `my_max_depth.tif`. What's different from ours? (Ours is also rounded to the centimetre and has every cell below 0.05 m removed. Compare the file sizes.)

**Why it was done this way, things to try, questions:** [STEPS.md, step 7](../STEPS.md#step-7--a-flood-scenario-one-raster-one-vector--step-7).

---

## Walkthrough: step 7 in small pieces, with all the code

### 7.A · The files are there

In the repository folder:

```bash
git checkout step-9 -- app/static/layers
ls -lh app/static/layers
```

**You see:** four files. With the dev server running, open port 5173 with `/layers/depth_timeseries_100yr.json` added to the address: the JSON appears. Files in `static/` are served as they are.

### 7.B · Install the COG plugin

In `app/` (stop the dev server first, start it again after):

```bash
npm install @geomatico/maplibre-cog-protocol@0.10.0
```

### 7.C · The raster on the map, as simply as possible

Create **`app/src/lib/scenario.js`** with only this:

```js
import * as maplibregl from 'maplibre-gl';
import { cogProtocol, setColorFunction } from '@geomatico/maplibre-cog-protocol';

export const FLOOD_URL = `${location.origin}/layers/max_depth_100yr.tif`;

// For now: every wet pixel the same blue, everything else transparent.
function colourDepth([depth], colour) {
	if (depth > 0) colour.set([49, 130, 189, 200]);
	else colour.set([0, 0, 0, 0]);
}

export function addFloodDepth(map) {
	maplibregl.addProtocol('cog', cogProtocol);
	setColorFunction(FLOOD_URL, colourDepth);
	map.addSource('flood', { type: 'raster', url: `cog://${FLOOD_URL}`, tileSize: 256 });
	map.addLayer({ id: 'flood-depth', type: 'raster', source: 'flood', paint: { 'raster-opacity': 0.8 } });
}
```

In `MapLibreMap.svelte`, import it (`import { addFloodDepth } from '#lib/scenario.js';`), and call it for a moment at the start of `on('load')`, before the sensor source:

```js
			addFloodDepth(m); // temporary: always on
```

**You see:** blue areas along the water courses, under the sensor dots. **Network** tab: several requests for `max_depth_100yr.tif`, with status **206**. That's the plugin reading pieces of one file.

Two problems to fix next: everything is the same blue, and the water covers the street names.

### 7.D · Depth classes

Replace the colour function in `scenario.js` with classes:

```js
// Depth classes for the raster, light to dark blue. [from (m), colour]
export const DEPTH_CLASSES = [
	[0.05, '#c6dbef'],
	[0.15, '#9ecae1'],
	[0.3, '#6baed6'],
	[0.5, '#3182bd'],
	[1, '#08519c'],
	[2, '#08306b']
];
// The hex colours as [r, g, b] numbers, worked out once, not for every pixel.
const RGB = DEPTH_CLASSES.map(([from, hex]) => [from, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]);

// Called for EVERY pixel of every tile, so keep it simple and fast.
function colourDepth([depth], colour) {
	if (!(depth >= DEPTH_CLASSES[0][0])) return colour.set([0, 0, 0, 0]); // dry, or no data (NaN): transparent
	let rgb = RGB[0][1];
	for (const [from, c] of RGB) if (depth >= from) rgb = c;
	colour.set([...rgb, 210]);
}
```

**You see:** light blue at the edges of the flood, dark blue where it's deep.

### 7.E · Under the street names

MapLibre draws layers in the order they're added. Give `addFloodDepth` a second parameter and pass it to `addLayer`, so the raster goes **under** that layer:

```js
export function addFloodDepth(map, beforeId) {
	…
	map.addLayer({ id: 'flood-depth', type: 'raster', source: 'flood', paint: { 'raster-opacity': 0.8 } }, beforeId);
}
```

In `on('load')`:

```js
			const underLabels = m.getStyle().layers.find((l) => l.type === 'symbol')?.id; // the basemap's first label layer
			addFloodDepth(m, underLabels); // temporary: always on
```

**You see:** street names on top of the water again.

### 7.F · A switch in the Layers box

Add the layer to `layers.svelte.js`:

```js
export const layers = $state({
	sensors: { label: 'Water-level sensors (live)', visible: true, legend: 'levels' },
	flood: { label: 'Max flood depth, 100-year flood', visible: false, legend: 'depth' }
});
```

Remove the two temporary lines from `on('load')`. Instead, a new `$effect` at the end of the script adds the layer the first time it is switched on, and after that only shows and hides it:

```js
	// The scenario layers: added the first time they are switched on (so nobody downloads
	// them who doesn't look at them), then only shown and hidden.
	$effect(() => {
		if (!map) return;
		const underLabels = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
		if (layers.flood.visible && !map.getLayer('flood-depth')) addFloodDepth(map, underLabels);
		if (map.getLayer('flood-depth')) map.setLayoutProperty('flood-depth', 'visibility', layers.flood.visible ? 'visible' : 'none');
	});
```

`addProtocol` may only run once per page, but now `addFloodDepth` can run again when you come back to the map page. Guard it in `scenario.js`:

```js
let registered = false;

export function addFloodDepth(map, beforeId) {
	if (!registered) {
		maplibregl.addProtocol('cog', cogProtocol); // once per page
		setColorFunction(FLOOD_URL, colourDepth);
		registered = true;
	}
	map.addSource('flood', { type: 'raster', url: `cog://${FLOOD_URL}`, tileSize: 256 });
	map.addLayer({ id: 'flood-depth', type: 'raster', source: 'flood', paint: { 'raster-opacity': 0.8 } }, beforeId);
}
```

**You see:** a second checkbox in the Layers box. The flood appears only when you tick it, and the `.tif` requests start only then.

### 7.G · The legend for depths

In `LayerPanel.svelte`, import the classes (`import { DEPTH_CLASSES } from '#lib/scenario.js';`) and, after the `levels` legend (turn its `{/if}` into the next branch):

```svelte
			{:else if layer.visible && layer.legend === 'depth'}
				<ul class="legend">
					{#each DEPTH_CLASSES as [from, colour], i (from)}
						<li>
							<i class="sq" style:background={colour}></i>{from}{i < DEPTH_CLASSES.length - 1 ? ` – ${DEPTH_CLASSES[i + 1][0]}` : ' and more'} m
						</li>
					{/each}
				</ul>
			{/if}
```

and `i.sq { border-radius: 2px; }` in the style: squares for areas, dots for sensors.

**You see:** six depth classes under the flood switch when it's on.

### 7.H · Click: the depth from the file

In `scenario.js`, import `locationValues` too, and add:

```js
// The depth in the raster at one place, read from the file, not from the picture.
// Always at full resolution (zoom 16), not from a coarser overview.
export async function floodDepthAt(lngLat) {
	const [depth] = await locationValues(FLOOD_URL, { latitude: lngLat.lat, longitude: lngLat.lng }, 16);
	return Number.isFinite(depth) && depth >= DEPTH_CLASSES[0][0] ? depth : null;
}
```

In `MapLibreMap.svelte`, import `floodDepthAt` too, and in `on('load')`, after the sensor click:

```js
			// A click that misses the sensors: the flood depth there.
			m.on('click', async (e) => {
				if (m.queryRenderedFeatures(e.point, { layers: ['sensor-dots'] }).length) return; // handled above
				if (layers.flood.visible) {
					const depth = await floodDepthAt(e.lngLat);
					const text = depth == null ? 'Dry in this scenario' : `Max flood depth: <strong>${depth.toFixed(2)} m</strong>`;
					new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`${text}<br><small>100-year scenario</small>`).addTo(m);
				}
			});
```

**You see:** click in the blue: *Max flood depth: 0.84 m*. Away from it: *Dry in this scenario*. On a sensor: only the sensor popup.

### 7.I · The buildings

In `scenario.js`:

```js
import { waterLevel, LEVELS } from '#lib/sensors.js';

export const BUILDINGS_URL = '/layers/buildings_exposure.geojson';

// The vector layer: building outlines, coloured with the SAME thresholds as the sensors.
export function addBuildings(map, beforeId) {
	map.addSource('buildings', { type: 'geojson', data: BUILDINGS_URL });
	map.addLayer(
		{
			id: 'buildings-exposed',
			type: 'fill',
			source: 'buildings',
			paint: {
				'fill-color': [
					'step', ['get', 'depth_m'],
					LEVELS.watch.colour, 0.3, LEVELS.warning.colour, 0.5, LEVELS.danger.colour
				],
				'fill-opacity': 0.85
			}
		},
		beforeId
	);
}

export function buildingPopup(p) {
	const level = waterLevel(p.depth_m);
	return `<strong>Building</strong> · OpenStreetMap ${p.osm_id}<br>
		Type: ${p.use}<br>
		Max flood depth: <strong>${p.depth_m} m</strong> · ${LEVELS[level].label}<br>
		<small>100-year scenario. Exposure, not damage.</small>`;
}
```

In `layers.svelte.js`, between the sensors and the flood:

```js
	buildings: { label: 'Buildings exposed, 100-year flood', visible: false, legend: 'exposure' },
```

In `MapLibreMap.svelte`, import `addBuildings` and `buildingPopup`, and make the scenario effect handle both layers, **raster under buildings, buildings under labels**, whichever is switched on first:

```js
	$effect(() => {
		if (!map) return;
		const underLabels = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
		// The raster always goes below the buildings, whichever is switched on first.
		const underBuildings = map.getLayer('buildings-exposed') ? 'buildings-exposed' : underLabels;
		if (layers.flood.visible && !map.getLayer('flood-depth')) addFloodDepth(map, underBuildings);
		if (layers.buildings.visible && !map.getLayer('buildings-exposed')) addBuildings(map, underLabels);
		for (const [id, on] of [['flood-depth', layers.flood.visible], ['buildings-exposed', layers.buildings.visible]]) {
			if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
		}
	});
```

In the general click handler, check for a building first:

```js
				const building = m.getLayer('buildings-exposed')
					? m.queryRenderedFeatures(e.point, { layers: ['buildings-exposed'] })[0]
					: null;
				if (building) {
					new maplibregl.Popup().setLngLat(e.lngLat).setHTML(buildingPopup(building.properties)).addTo(m);
				} else if (layers.flood.visible) {
					… // the flood depth, as before
				}
```

The legend, in `LayerPanel.svelte`, another branch:

```svelte
			{:else if layer.visible && layer.legend === 'exposure'}
				<ul class="legend">
					<li><i class="sq" style:background={LEVELS.watch.colour}></i>0.15 – 0.30 m</li>
					<li><i class="sq" style:background={LEVELS.warning.colour}></i>0.30 – 0.50 m</li>
					<li><i class="sq" style:background={LEVELS.danger.colour}></i>0.50 m and more</li>
				</ul>
```

**You see:** tick *Buildings exposed* and zoom in: yellow, orange and red buildings, on top of the blue, under the street names. Click one: its popup. Tick the layers in the other order: the order on the map stays right.

### 7.J · Pages that can't draw everything

Finally, prepare for other map engines (the extras), which may not support every layer. In `LayerPanel.svelte`:

```js
	// `supported` lists the layers this page can draw; the others are greyed out.
	let { supported = Object.keys(layers) } = $props();
```

and in the loop:

```svelte
			{@const ok = supported.includes(id)}
			<label class:off={!ok} title={ok ? '' : 'Only on the MapLibre page'}>
				<input type="checkbox" bind:checked={layer.visible} disabled={!ok} />
				{layer.label}
			</label>
```

Add `ok &&` in front of the three legend conditions, and `label.off { color: #999; cursor: default; }` to the style. In `MapPage.svelte`, pass it on: `let { children, supported } = $props();` and `<LayerPanel {supported} />`.

**You see:** nothing changes on the MapLibre page (it supports everything). That's the reference of this step. Commit.


---

[Step 8 · The flood over time →](08-flood-time.md)

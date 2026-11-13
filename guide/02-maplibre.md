# Step 2 · Sensors on a map

[← Step 1](01-feed-table.md) · [Guide overview](README.md) · [Step 3 →](03-thresholds.md)

**You build:** a MapLibre GL web map above the table, with a dot and a label for every sensor, and a popup when you click a dot.
**You learn:** installing a package; GeoJSON; MapLibre's *sources* and *layers*; writing your own component with `$props`; `$derived` and `$effect`.
**Time:** about 60 minutes.
**Start from:** your step 1, or the tag `step-1`.

---

## How a web map works

**MapLibre GL JS** draws maps in the browser with the graphics card (WebGL). It is free and open source; the RHT platform uses it. A MapLibre map has three ingredients:

1. A **style**: the basemap (streets, water, labels). We use a free one from OpenFreeMap, built on OpenStreetMap.
2. **Sources**: your data. *What* to draw.
3. **Layers**: *how* to draw a source: as circles, text, lines, filled shapes, a raster. One source can feed several layers.

The data goes in as **GeoJSON**, the standard format for geographic data on the web:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [80.1242, 12.9861] },
      "properties": { "id": "TBM-01", "depth_m": -7.49 }
    }
  ]
}
```

Watch the order: GeoJSON coordinates are **[longitude, latitude]**, not the other way round. Swap them and Tambaram ends up at 80° north, in the Arctic Ocean near Svalbard.

## 2.1 · Install MapLibre

In terminal 2, stop the dev server (Ctrl+C), then in `app/`:

```bash
npm install maplibre-gl@6.18.0
```

`package.json` now lists `maplibre-gl` under `dependencies`.

MapLibre does part of its work in a **web worker** (a second thread) that it loads from a file next to its own code. Vite's dev server normally repackages packages to load faster, and that breaks the worker. Tell it to leave MapLibre alone, in `app/vite.config.js`, next to the `server` block:

```js
	// MapLibre loads a web worker from a file next to its own code. Vite's dependency
	// pre-bundling would move that code and break the worker, so leave MapLibre as it is.
	optimizeDeps: {
		exclude: ['maplibre-gl']
	},
```

Start `npm run dev` again.

## 2.2 · Turn the API's answers into GeoJSON

Create **`app/src/lib/sensors.js`**: helpers that the page and the map will share.

1. **Move** `showTime()` and `showAge()` from `+page.svelte` into it, and put `export` in front of each. In the page, import them: `import { showTime, showAge } from '#lib/sensors.js';`
2. **Write** `export function toGeoJSON(sites, live)`. It returns a `FeatureCollection` with one `Point` feature per site, with these properties: `id`, `type`, `depth_m`, `time` and `age_s` (the last three from the site's reading, or `null`).

Hint: `sites.map((site) => ({ type: 'Feature', geometry: …, properties: … }))` makes the list of features.

**Test it** in the terminal, in `app/` (the API must be running):

```bash
node -e "
import('./src/lib/sensors.js').then(async ({ toGeoJSON }) => {
  const sites = (await (await fetch('http://localhost:8000/sites')).json()).sites;
  const live = await (await fetch('http://localhost:8000/live')).json();
  const g = toGeoJSON(sites, live);
  console.log(g.features.length, JSON.stringify(g.features[0]));
});"
```

You should see `33` and a feature for TBM-01 with `"coordinates":[80.1242,12.9861]`.

## 2.3 · A map component

Create **`app/src/lib/MapLibreMap.svelte`**. It gets the GeoJSON from the page and only draws it. Build it in four parts.

**a · The component, its input and its box.** `$props()` is how a component receives values from the page that uses it: `<MapLibreMap {geojson} />` on the page arrives here as `geojson`.

```svelte
<script>
	import { onMount } from 'svelte';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	let { geojson } = $props();

	let container; // the <div> the map draws into
	let map = $state(null); // set once the map is ready
</script>

<div class="map" bind:this={container}></div>

<style>
	.map {
		width: 100%;
		height: 60vh;
	}
</style>
```

`bind:this={container}` puts the real `<div>` element into the variable `container`, so MapLibre can draw into it. The map needs a **height**: a `<div>` without content is 0 pixels high, and so is your map.

`import * as maplibregl` (not `import maplibregl`): MapLibre 6 has no "default export", so you import everything under one name.

**b · Make the map when the component appears**, in the script:

```js
onMount(() => {
	const m = new maplibregl.Map({
		container,
		style: 'https://tiles.openfreemap.org/styles/positron',
		bounds: [[80.08, 12.89], [80.2, 12.99]], // [west, south], [east, north]
		fitBoundsOptions: { padding: 30 }
	});
	m.addControl(new maplibregl.NavigationControl(), 'top-right');

	m.on('load', () => {
		// c · sources and layers go here
		map = m;
	});

	return () => m.remove(); // clean up when the component goes away
});
```

Save. You should see a grey basemap of Tambaram, with zoom buttons.

**c · Add the sensors**, inside `m.on('load', …)`, before `map = m`:

```js
m.addSource('sensors', { type: 'geojson', data: geojson });

m.addLayer({
	id: 'sensor-dots',
	type: 'circle',
	source: 'sensors',
	paint: {
		'circle-radius': 7,
		'circle-color': '#1f6fb2',
		'circle-stroke-width': 1.5,
		'circle-stroke-color': '#ffffff'
	}
});
```

Now add a **second layer** yourself, on the same source: `type: 'symbol'`, with the sensor's id as text, only from zoom 13 on (`minzoom: 13`). In a symbol layer, the text goes in `layout`:

```js
layout: {
	'text-field': ['get', 'id'],        // the "id" property of each feature
	'text-font': ['Noto Sans Regular'], // a font the basemap's server has
	'text-size': 11,
	'text-offset': [0, 1.2],
	'text-anchor': 'top'
},
paint: { 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
```

`['get', 'id']` is a MapLibre **expression**: a small formula that MapLibre works out for every feature. You will use more of them in step 3.

**d · Follow new data.** When the page refreshes, `geojson` changes, and the map should follow. An **`$effect`** runs once, and then again every time a `$state` or prop it reads changes:

```js
$effect(() => {
	map?.getSource('sensors').setData(geojson);
});
```

It reads `map` and `geojson`, so it runs when the map becomes ready and every time new data arrives. You never redraw layers yourself: give the source new data, and every layer on it redraws.

## 2.4 · Click a sensor

In `m.on('load', …)`, open a popup when a dot is clicked:

```js
m.on('click', 'sensor-dots', (e) => {
	const p = e.features[0].properties;
	new maplibregl.Popup()
		.setLngLat(e.features[0].geometry.coordinates)
		.setHTML(`<strong>${p.id}</strong> · ${p.type}<br>Depth: ${p.depth_m ?? '–'} m`)
		.addTo(m);
});
```

Add the measured time and the age to the popup with your `showTime()` and `showAge()`. Then make the mouse pointer a hand over the dots (`m.on('mouseenter', 'sensor-dots', …)` and `'mouseleave'`, setting `m.getCanvas().style.cursor`).

## 2.5 · Put the map on the page

In `+page.svelte`:

1. Import the component and `toGeoJSON`.
2. Make the GeoJSON from the data, as a **derived** value:

   ```js
   let geojson = $derived(toGeoJSON(sites, live));
   ```

   `$derived` recomputes `geojson` by itself whenever `sites` or `live` change. You never have to remember to update it.

3. Put `<MapLibreMap {geojson} />` above the table.

The page will now fail with an error about `window` or `document`. SvelteKit first renders every page **on the server** and then again in the browser, and a map can only exist in a browser. Create **`app/src/routes/+page.js`** with one line:

```js
export const ssr = false; // render this page only in the browser
```

## Check

- [ ] The map shows Tambaram with 33 blue dots, and the table below it.
- [ ] Zoomed in, the dots have their ids as labels.
- [ ] Clicking a dot opens a popup with the right sensor, depth and time.
- [ ] **Refresh** updates the popups' data (close and reopen one).
- [ ] The browser's console (F12) shows no errors.

Commit your work.

## Stuck?

| Problem | Try |
|---|---|
| The page is white, the console says `window is not defined` | `+page.js` with `ssr = false` is missing, or in the wrong folder |
| No map, no error, nothing | The map's `<div>` has no height. Check the CSS |
| `does not provide an export named 'default'` | Write `import * as maplibregl from 'maplibre-gl'` |
| The basemap appears, no dots | Swapped `[lat, lon]`? Look at one feature with `console.log`. Or a typo in the source name of the layer |
| Labels don't appear | Zoom in past level 13. Check `text-font` exactly: `Noto Sans Regular` |
| `Cannot read properties of undefined (reading 'setData')` | You called `getSource` before the source existed: is `map = m` the last line inside `on('load')`? |

Compare: `git diff step-2 -- app/src app/vite.config.js app/package.json`.

<details>
<summary>📄 <code>app/src/lib/sensors.js</code> as it is at <code>step-2</code></summary>

```js
// Helpers shared by the page and the map engines.

// Turn the API's sites + latest readings into GeoJSON: the format every web map understands.
// One Point feature per sensor; the reading goes into the feature's properties.
export function toGeoJSON(sites, live) {
	return {
		type: 'FeatureCollection',
		features: sites.map((site) => {
			const r = live?.readings.find((r) => r.site === site.id);
			return {
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [site.lon, site.lat] }, // GeoJSON is [lon, lat]!
				properties: {
					id: site.id,
					type: site.type,
					depth_m: r?.depth_m ?? null,
					time: r?.time ?? null,
					age_s: r?.age_s ?? null
				}
			};
		})
	};
}

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
<summary>📄 <code>app/src/lib/MapLibreMap.svelte</code> as it is at <code>step-2</code></summary>

```svelte
<script>
	import { onMount } from 'svelte';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { showTime, showAge } from '#lib/sensors.js';

	// Step 2: the sensors on a 2D web map with MapLibre GL.
	// The page gives us the data as GeoJSON; this component only draws it.
	let { geojson } = $props();

	let container; // the <div> the map draws into
	let map = $state(null); // set once the map and its style have loaded

	onMount(() => {
		const m = new maplibregl.Map({
			container,
			// The basemap: a free vector style from OpenFreeMap, built on OpenStreetMap data. No API key.
			style: 'https://tiles.openfreemap.org/styles/positron',
			// Start on the box around all 33 sensors: [west, south] to [east, north], in [lon, lat].
			bounds: [
				[80.08, 12.89],
				[80.2, 12.99]
			],
			fitBoundsOptions: { padding: 30 }
		});
		m.addControl(new maplibregl.NavigationControl(), 'top-right');
		m.addControl(new maplibregl.ScaleControl(), 'bottom-left');

		m.on('load', () => {
			// 1. A source holds the data ...
			m.addSource('sensors', { type: 'geojson', data: geojson });

			// 2. ... and layers say how to draw it. A circle per sensor:
			m.addLayer({
				id: 'sensor-dots',
				type: 'circle',
				source: 'sensors',
				paint: {
					'circle-radius': 7,
					'circle-color': '#1f6fb2',
					'circle-stroke-width': 1.5,
					'circle-stroke-color': '#ffffff'
				}
			});

			// ... and its id as a label, once you zoom in far enough.
			m.addLayer({
				id: 'sensor-labels',
				type: 'symbol',
				source: 'sensors',
				minzoom: 13,
				layout: {
					'text-field': ['get', 'id'],
					'text-font': ['Noto Sans Regular'],
					'text-size': 11,
					'text-offset': [0, 1.2],
					'text-anchor': 'top'
				},
				paint: { 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
			});

			// Click a sensor: show its latest reading in a popup.
			m.on('click', 'sensor-dots', (e) => {
				const p = e.features[0].properties;
				new maplibregl.Popup()
					.setLngLat(e.features[0].geometry.coordinates)
					.setHTML(
						`<strong>${p.id}</strong> · ${p.type}<br>
						 Depth: ${p.depth_m ?? '–'} m<br>
						 Measured: ${showTime(p.time)} IST (${showAge(p.age_s)} ago)`
					)
					.addTo(m);
			});
			m.on('mouseenter', 'sensor-dots', () => (m.getCanvas().style.cursor = 'pointer'));
			m.on('mouseleave', 'sensor-dots', () => (m.getCanvas().style.cursor = ''));

			map = m;
		});

		return () => m.remove(); // clean up when the component goes away
	});

	// When new data arrives (Refresh), give it to the source. The map redraws by itself.
	$effect(() => {
		map?.getSource('sensors').setData(geojson);
	});
</script>

<div class="map" bind:this={container}></div>

<style>
	.map {
		width: 100%;
		height: 60vh;
		border-radius: 6px;
	}
</style>
```

</details>

<details>
<summary>📄 <code>app/src/routes/+page.svelte</code> as it is at <code>step-2</code></summary>

```svelte
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
```

</details>

<details>
<summary>📄 <code>app/src/routes/+page.js</code> as it is at <code>step-2</code></summary>

```js
// Step 2: a web map needs the browser (a canvas, WebGL, the window size).
// So this page is rendered only in the browser, not on the server.
export const ssr = false;
```

</details>

<details>
<summary>📄 <code>app/vite.config.js</code> as it is at <code>step-2</code></summary>

```js
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	],

	// Step 2: MapLibre loads a web worker from a file next to its own code. Vite's dependency
	// pre-bundling would move that code and break the worker, so leave MapLibre as it is.
	optimizeDeps: {
		exclude: ['maplibre-gl']
	},

	// Step 1: the browser asks this dev server for /api/…, and the dev server passes the
	// request on to the sensor API. The browser only ever talks to one address.
	server: {
		proxy: {
			'/api': {
				target: process.env.API_URL ?? 'http://localhost:8000',
				rewrite: (path) => path.replace(/^\/api/, '')
			}
		}
	}
});
```

</details>

**Why it was done this way, things to try, questions:** [STEPS.md, step 2](../STEPS.md#step-2--maplibre-gl-sensors-on-a-map--step-2).

---

## Walkthrough: step 2 in small pieces, with all the code

Keep both terminals running (API and `npm run dev`), except when a piece says to restart.

### 2.A · Install MapLibre and prepare Vite

Stop the dev server (Ctrl+C in terminal 2), then in `app/`:

```bash
npm install maplibre-gl@6.18.0
```

In `app/vite.config.js`, add this block after `plugins: [ … ],` and before `server: {`:

```js
	// MapLibre loads a web worker from a file next to its own code. Vite's dependency
	// pre-bundling would move that code and break the worker, so leave MapLibre as it is.
	optimizeDeps: {
		exclude: ['maplibre-gl']
	},
```

Create **`app/src/routes/+page.js`** (a `.js` file next to `+page.svelte`):

```js
// A web map needs the browser (a canvas, WebGL, the window size).
// So this page is rendered only in the browser, not on the server.
export const ssr = false;
```

Start the dev server again: `npm run dev`.

**You see:** the same table as before. Nothing new yet, but no errors either.

### 2.B · An empty MapLibre map

Create **`app/src/lib/MapLibreMap.svelte`**:

```svelte
<script>
	import { onMount } from 'svelte';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	let container; // the <div> the map draws into

	onMount(() => {
		const m = new maplibregl.Map({
			container,
			style: 'https://tiles.openfreemap.org/styles/positron',
			center: [80.14, 12.94], // [lon, lat]: Tambaram
			zoom: 12
		});
		return () => m.remove(); // clean up when the component goes away
	});
</script>

<div class="map" bind:this={container}></div>

<style>
	.map {
		width: 100%;
		height: 60vh;
	}
</style>
```

Put it on the page. In `+page.svelte`, add the import at the top of the script:

```js
	import MapLibreMap from '#lib/MapLibreMap.svelte';
```

and the component above the table:

```svelte
<MapLibreMap />
```

**You see:** a light-grey map of Tambaram above the table. Drag it, scroll to zoom. That's an empty MapLibre GL map: only the basemap, no data of yours yet.

Try: change `zoom` to `15`, or the style to `liberty` instead of `positron`.

### 2.C · Controls and a better start view

Instead of a centre and a zoom, start on the box around all the sensors. Replace `center` and `zoom` with:

```js
			bounds: [
				[80.08, 12.89], // west, south
				[80.2, 12.99] // east, north
			],
			fitBoundsOptions: { padding: 30 }
```

and add two controls after the `new maplibregl.Map({ … });`:

```js
		m.addControl(new maplibregl.NavigationControl(), 'top-right');
		m.addControl(new maplibregl.ScaleControl(), 'bottom-left');
```

**You see:** zoom buttons and a compass top right, a scale bar bottom left.

### 2.D · One dot, typed by hand

Before you use the API, prove that MapLibre can draw a point. After the controls, add:

```js
		m.on('load', () => {
			m.addSource('test', {
				type: 'geojson',
				data: {
					type: 'FeatureCollection',
					features: [
						{
							type: 'Feature',
							geometry: { type: 'Point', coordinates: [80.1242, 12.9861] }, // TBM-01
							properties: { id: 'TBM-01' }
						}
					]
				}
			});
			m.addLayer({
				id: 'test-dot',
				type: 'circle',
				source: 'test',
				paint: { 'circle-radius': 10, 'circle-color': '#c62828' }
			});
		});
```

`on('load')`: sources and layers can only be added once the basemap's style has loaded.

**You see:** one red dot in the north of the area. Swap the two numbers in `coordinates` and save: the dot is gone (it is now at 80° north). Swap them back.

### 2.E · All sensors, as GeoJSON

Create **`app/src/lib/sensors.js`**:

```js
// Helpers shared by the page and the map engines.

// Turn the API's sites + latest readings into GeoJSON: the format every web map understands.
// One Point feature per sensor; the reading goes into the feature's properties.
export function toGeoJSON(sites, live) {
	return {
		type: 'FeatureCollection',
		features: sites.map((site) => {
			const r = live?.readings.find((r) => r.site === site.id);
			return {
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [site.lon, site.lat] }, // GeoJSON is [lon, lat]!
				properties: {
					id: site.id,
					type: site.type,
					depth_m: r?.depth_m ?? null,
					time: r?.time ?? null,
					age_s: r?.age_s ?? null
				}
			};
		})
	};
}
```

**Move** `showTime` and `showAge` from `+page.svelte` to the end of this file, with `export` in front of each `function`. In the page, import what it needs:

```js
	import { toGeoJSON, showTime, showAge } from '#lib/sensors.js';
```

and, after `let live = …`, make the GeoJSON:

```js
	// The same data as GeoJSON for the map. $derived recomputes it whenever sites or live change.
	let geojson = $derived(toGeoJSON(sites, live));
```

Give it to the map: `<MapLibreMap {geojson} />`.

In `MapLibreMap.svelte`, receive it, at the top of the script after the imports:

```js
	let { geojson } = $props();
```

and replace the hand-typed test source and layer (all of 2.D inside `on('load')`) with:

```js
		m.on('load', () => {
			m.addSource('sensors', { type: 'geojson', data: geojson });
			m.addLayer({
				id: 'sensor-dots',
				type: 'circle',
				source: 'sensors',
				paint: {
					'circle-radius': 7,
					'circle-color': '#1f6fb2',
					'circle-stroke-width': 1.5,
					'circle-stroke-color': '#ffffff'
				}
			});
		});
```

**You see:** 33 blue dots... or maybe none! The map often finishes loading **before** the API has answered, and then `geojson` is still empty when the source is made. Reload a few times. The next piece fixes this.

### 2.F · Follow the data: `$effect`

The source must get the new data every time `geojson` changes. Keep the finished map in a `$state`, so an `$effect` can wait for it:

```js
	let container;
	let map = $state(null); // set once the map and its style have loaded
```

At the end of the `on('load', () => { … })` function, after `addLayer`:

```js
			map = m;
```

And after `onMount(…)`:

```js
	// When new data arrives, give it to the source. The map redraws by itself.
	$effect(() => {
		map?.getSource('sensors').setData(geojson);
	});
```

The effect reads `map` and `geojson`, so it runs when the map is ready, and again every time new data arrives.

**You see:** all 33 dots, every time. Press **Refresh**: the dots stay (nothing to see change yet: they are all blue).

### 2.G · Labels

In `on('load')`, after the `sensor-dots` layer, a second layer on the **same** source:

```js
			m.addLayer({
				id: 'sensor-labels',
				type: 'symbol',
				source: 'sensors',
				minzoom: 13,
				layout: {
					'text-field': ['get', 'id'],
					'text-font': ['Noto Sans Regular'],
					'text-size': 11,
					'text-offset': [0, 1.2],
					'text-anchor': 'top'
				},
				paint: { 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
			});
```

**You see:** zoom in: below each dot, its id. Zoom out past level 13: the labels disappear.

### 2.H · A popup on click

Import the time helpers in `MapLibreMap.svelte`:

```js
	import { showTime, showAge } from '#lib/sensors.js';
```

In `on('load')`, before `map = m`:

```js
			// Click a sensor: show its latest reading in a popup.
			m.on('click', 'sensor-dots', (e) => {
				const p = e.features[0].properties;
				new maplibregl.Popup()
					.setLngLat(e.features[0].geometry.coordinates)
					.setHTML(
						`<strong>${p.id}</strong> · ${p.type}<br>
						 Depth: ${p.depth_m ?? '–'} m<br>
						 Measured: ${showTime(p.time)} IST (${showAge(p.age_s)} ago)`
					)
					.addTo(m);
			});
			m.on('mouseenter', 'sensor-dots', () => (m.getCanvas().style.cursor = 'pointer'));
			m.on('mouseleave', 'sensor-dots', () => (m.getCanvas().style.cursor = ''));
```

**You see:** a hand over the dots; click one: its id, type, depth and time.

### 2.I · Tidy up

In `+page.svelte`, give the page more room for the map (`max-width: 60rem` in `main`) and a little space above the table (`margin-top: 1rem` in `table`). In `MapLibreMap.svelte`, round the map's corners: `border-radius: 6px`.

**You see:** the same as the reference at the end of the step above. Commit.


---

[Step 3 · Thresholds and alerts →](03-thresholds.md)

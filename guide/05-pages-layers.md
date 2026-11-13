# Step 5 · Pages, one shared feed, switchable layers

[← Step 4](04-live.md) · [Guide overview](README.md) · [Step 6 →](06-charts.md)

**You build:** an app instead of a demo page: a full-screen **map page** (`/maplibre`) and a **sensor data page** (`/sensors`), a header with navigation and the feed status on every page, and a **Layers** box to switch information layers on and off.
**You learn:** SvelteKit routing and layouts; redirects; shared state in `.svelte.js` files; moving code without breaking it (refactoring).
**Time:** about 90 minutes. This is the biggest step: most of it is moving code you already have to a better place.
**Start from:** your step 4, or the tag `step-4`.

---

## The new shape

```
                    +layout.svelte    header, navigation, feed status, banners
                    │  starts the feed once ──▶ feed.svelte.js    (polls /api/live every 10 s)
                    │
        ┌───────────┴──────────────┐
    /maplibre                   /sensors
    MapPage: the map + LayerPanel   the table
             │
             └──▶ layers.svelte.js  which layers are on
```

**The problem to solve:** in step 4 the page did the polling. With two pages, each page would poll on its own, or the feed would restart (and forget its levels and their history) every time you switch pages. So the feed moves out of the page into **one shared object**, and the **layout**, which stays on screen while you move between pages, starts it once.

Work in this order and check the app after each part: **a** the feed, **b** the layout, **c** the pages, **d** the layers.

## 5.1 · `$state` outside a component

Runes like `$state` and `$derived` normally live in `.svelte` files. They also work in **JavaScript files whose name ends in `.svelte.js`**. That's how you share live state between components: one file holds it, every component imports it, and every component updates when it changes.

A **class** is a tidy way to keep the state and the functions that change it together:

```js
class Feed {
	sites = $state([]);
	live = $state(null);
	status = $derived(/* … uses this.lastOk, this.lastError, this.now … */);

	poll = async () => { … };   // an arrow function, so onclick={feed.poll} works
}

export const feed = new Feed(); // the one and only feed; everyone imports this object
```

In a class, every field is reached with `this.`: `this.sites`, `this.levels[site.id]`.

Why arrow functions (`poll = async () => { … }`) instead of methods (`async poll() { … }`)? A button calls `onclick={feed.poll}` without the `feed.` in front, and a normal method would lose its `this`. An arrow function keeps it.

## 5.2 · a · The feed: `app/src/lib/feed.svelte.js`

Create the file and **move** into it, from `+page.svelte`:

| From the page | Becomes in `Feed` |
|---|---|
| `POLL_MS`, `TIMEOUT_MS`, `FEED_LOST_AFTER_MS`, `getJSON()` | Stay outside the class, at the top and bottom of the file |
| `sites`, `live`, `levels`, `changes`, `polling`, `lastOk`, `lastError`, `now` | `$state` fields |
| `feed` (the status) | A `$derived` field called **`status`** |
| `geojson`, `alerts`, `untrusted` | `$derived` fields |
| `readingFor()`, `secondsAgo()`, `poll()` | Arrow-function fields |
| A new `togglePolling` | `() => { this.polling = !this.polling; }` |
| `updateLevels()` | A private method `#updateLevels()` (the `#` means only the class can use it) |
| The `onMount(…)` timer code | A method **`start()`** that starts the timers and **returns the stop function** |

At the end: `export const feed = new Feed();`.

## 5.3 · b · The layout: `app/src/routes/+layout.svelte`

The layout is the frame around every page; `{@render children()}` is where the page goes. Rewrite it so it has:

1. **The feed, started once:**

   ```js
   import { feed } from '#lib/feed.svelte.js';
   onMount(() => feed.start()); // start() returns the stop function; Svelte calls it on unmount
   ```

2. **A header** with the title, the **navigation** and the feed **status line** (move the status line and the two buttons from the page; `feed` becomes `feed.status`, `lastOk` becomes `feed.lastOk`, and so on).

   For the navigation, a list of pages and a link for each. Mark the current page with `page` from SvelteKit:

   ```js
   import { page } from '$app/state';
   const pages = [
   	{ href: '/maplibre', name: 'MapLibre GL', what: '2D map' },
   	{ href: '/sensors', name: 'Sensor data', what: 'table' }
   ];
   ```

   ```svelte
   <a href={p.href} class:active={page.url.pathname === p.href}>{p.name} <small>{p.what}</small></a>
   ```

3. **Both banners** (feed lost, and the alerts) from the page, under the header.
4. **`<main>{@render children()}</main>`** filling the rest of the screen.

**Make the map fill the screen.** The layout becomes a column that is exactly as high as the window; the header and banners take what they need, and `main` gets the rest:

```css
:global(body) { margin: 0; font-family: system-ui, sans-serif; }
.app { display: flex; flex-direction: column; height: 100vh; }
main { flex: 1; min-height: 0; overflow: auto; }
```

`:global(body)` styles the `<body>` element, which is outside this component. `min-height: 0` lets `main` shrink below its content's size, which a flex child otherwise refuses to do.

**`ssr = false` for the whole app.** Create `app/src/routes/+layout.js` with `export const ssr = false;`, and delete `app/src/routes/+page.js` for now (you'll make a new one in 5.4).

## 5.4 · c · The pages

**The sensor table, `app/src/routes/sensors/+page.svelte`:** a new folder `sensors` and a new page. Move the table (and its CSS) from the old page. It only reads from the shared feed: `feed.sites`, `feed.readingFor(site.id)`, `feed.levels[site.id]`, `feed.changes[site.id]`. Grey it out when `feed.status === 'lost'`.

**A frame for map pages, `app/src/lib/MapPage.svelte`:** every map page (and there will be more in the extras) needs the same things: the map filling the space, the layer panel floating on top, and the grey filter when the feed is lost. Put that in one component that wraps whatever map it is given:

```svelte
<script>
	import LayerPanel from '#lib/LayerPanel.svelte';
	import { feed } from '#lib/feed.svelte.js';
	let { children } = $props();
</script>

<div class="map-page">
	<div class="map" class:faded={feed.status === 'lost'}>
		{@render children()}
	</div>
	<LayerPanel />
</div>
```

Give `.map-page` `position: relative; height: 100%` and `.map` `height: 100%`. In `MapLibreMap.svelte`, change the map's height from `60vh` to `100%`.

**The map page, `app/src/routes/maplibre/+page.svelte`:** only a few lines.

```svelte
<script>
	import MapPage from '#lib/MapPage.svelte';
	import MapLibreMap from '#lib/MapLibreMap.svelte';
	import { feed } from '#lib/feed.svelte.js';
	import { layers } from '#lib/layers.svelte.js';
</script>

<MapPage>
	<MapLibreMap geojson={feed.geojson} {layers} />
</MapPage>
```

**The home address.** `/` has no page of its own any more; send visitors to the map. Replace `app/src/routes/+page.svelte` by **`app/src/routes/+page.js`**:

```js
import { redirect } from '@sveltejs/kit';

export function load() {
	redirect(307, '/maplibre');
}
```

(Delete the old `+page.svelte`: everything in it has moved.)

## 5.5 · d · Layers you switch on and off

**`app/src/lib/layers.svelte.js`:** the list of information layers. Only one for now; steps 7 and 8 add more.

```js
export const layers = $state({
	sensors: { label: 'Water-level sensors', visible: true, legend: 'levels' }
});
```

Because it's shared `$state`, the choice survives moving between pages.

**`app/src/lib/LayerPanel.svelte`:** a box at the top left of the map with a header button that folds it open and closed, and a checkbox per layer. `bind:checked` connects a checkbox to a value in both directions:

```svelte
{#each Object.entries(layers) as [id, layer] (id)}
	<label>
		<input type="checkbox" bind:checked={layer.visible} />
		{layer.label}
	</label>
{/each}
```

Under a layer that is on and has `legend: 'levels'`, show the legend of the six levels (move it from the old page). Position the box with `position: absolute; top: 10px; left: 10px; z-index: 1;` and give it a white background.

**`MapLibreMap.svelte`** gets a second prop, `layers`, and hides or shows the sensor layers when the checkbox changes:

```js
let { geojson, layers } = $props();

$effect(() => {
	const visibility = layers.sensors.visible ? 'visible' : 'none';
	for (const id of ['sensor-dots', 'sensor-labels']) map?.setLayoutProperty(id, 'visibility', visibility);
});
```

## Check

- [ ] `/` sends you to `/maplibre`: a full-screen map, the header with navigation and the status, the Layers box.
- [ ] **Sensor data** shows the table. Back to the map: no reload, the feed keeps running.
- [ ] Untick **Water-level sensors**, go to **Sensor data** and back: the sensors are still off.
- [ ] **Network** tab: still exactly one `/api/live` request every 10 s, whichever page you're on.
- [ ] The **Changes** column keeps counting while you switch pages (the feed did not restart).
- [ ] Stop the API: the status, banners and grey map work on both pages.

Commit your work.

## Stuck?

| Problem | Try |
|---|---|
| `$state is not defined` / `rune … only available inside .svelte and .svelte.js files` | The file must be called `feed.svelte.js`, not `feed.js` |
| `Cannot read properties of undefined` in `feed` | A `this.` is missing inside the class |
| The **Pause** button does nothing, or `this is undefined` | `poll` or `togglePolling` is a normal method; make it an arrow function |
| The map has no height, or the page scrolls | Check the chain of heights: `.app` 100vh → `main` `flex: 1; min-height: 0` → `.map-page` 100% → `.map` 100% → the MapLibre `<div>` 100% |
| Two requests every 10 s | `feed.start()` is called in a page as well as in the layout |
| The Layers box is under the map | `position: absolute` and a `z-index` |

Compare: `git diff step-5 -- app/src`.

<details>
<summary>📄 <code>app/src/lib/feed.svelte.js</code> as it is at <code>step-5</code></summary>

```js
// Step 5: ONE sensor feed for the whole app.
//
// Until step 4 the page did the polling itself. Now there are several pages (the map, the
// sensor table, and more to come), and they must all show the same data without each asking
// the API on its own. So the feed lives here, in a shared store, and the layout starts it once.
//
// The file name ends in .svelte.js so that $state and $derived work outside a component.

import { toGeoJSON, classify } from '#lib/sensors.js';

const POLL_MS = 10_000; // ask the API every 10 s (= 10 minutes of replayed data)
const TIMEOUT_MS = 5_000; // give up on a request that takes longer than this
const FEED_LOST_AFTER_MS = 30_000; // no good answer for this long: the feed is lost

class Feed {
	sites = $state([]); // from /api/sites: where each sensor is
	live = $state(null); // from /api/live: the latest reading of each sensor

	levels = $state({}); // step 3: the level of each sensor
	changes = $state({}); // step 3: how often each level changed since the app opened

	polling = $state(true); // step 4: Pause / Resume
	lastOk = $state(null); // when (browser clock) we last got a good answer
	lastError = $state(null); // what went wrong last time, if anything
	now = $state(Date.now()); // ticks every second, so "… s ago" stays up to date

	// 'connecting', 'live', 'delayed' or 'lost'
	status = $derived(
		this.lastOk == null
			? this.lastError ? 'lost' : 'connecting'
			: !this.lastError ? 'live'
			: this.now - this.lastOk < FEED_LOST_AFTER_MS ? 'delayed'
			: 'lost'
	);

	geojson = $derived(toGeoJSON(this.sites, this.live, this.levels));

	alerts = $derived(
		this.sites
			.filter((s) => this.levels[s.id] === 'danger' || this.levels[s.id] === 'warning')
			.sort((a, b) => (this.levels[b.id] === 'danger') - (this.levels[a.id] === 'danger'))
	);

	untrusted = $derived(
		this.sites.filter((s) => this.levels[s.id] === 'stale' || this.levels[s.id] === 'suspect').length
	);

	readingFor = (id) => this.live?.readings.find((r) => r.site === id);

	secondsAgo = (t) => Math.round((this.now - t) / 1000);

	// Arrow functions, so they can be used directly as onclick={feed.poll}.
	poll = async () => {
		try {
			if (this.sites.length === 0) this.sites = (await getJSON('/api/sites')).sites; // only once
			this.live = await getJSON('/api/live');
			this.#updateLevels();
			this.lastOk = Date.now();
			this.lastError = null;
		} catch (e) {
			// Keep the last good data on screen, but remember that this attempt failed.
			this.lastError = e.name === 'TimeoutError' ? 'the API did not answer in time' : e.message;
		}
	};

	togglePolling = () => {
		this.polling = !this.polling;
	};

	#updateLevels() {
		const next = {};
		for (const site of this.sites) {
			const level = classify(site, this.readingFor(site.id), this.levels[site.id]);
			const before = this.levels[site.id];
			if (before && before !== level) this.changes[site.id] = (this.changes[site.id] ?? 0) + 1;
			next[site.id] = level;
		}
		this.levels = next;
	}

	// Start polling. Returns a function that stops it again.
	start() {
		let timer;
		let stopped = false;
		const tick = async () => {
			if (this.polling) await this.poll();
			if (!stopped) timer = setTimeout(tick, POLL_MS); // wait for the answer, then schedule
		};
		tick();
		const clock = setInterval(() => (this.now = Date.now()), 1000);
		return () => {
			stopped = true;
			clearTimeout(timer);
			clearInterval(clock);
		};
	}
}

// Fetch JSON, but never wait forever: a hanging server must count as a failure too.
async function getJSON(url) {
	const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (!res.ok) throw new Error(`${url} answered ${res.status}`);
	return res.json();
}

// The one and only feed. Every page imports this same object.
export const feed = new Feed();
```

</details>

<details>
<summary>📄 <code>app/src/lib/layers.svelte.js</code> as it is at <code>step-5</code></summary>

```js
// Step 5: the information layers you can switch on and off.
//
// The choice is shared by every page: switch the sensors off on the map, open the sensor
// table, come back, and they are still off.
//
// To add a layer: add an entry here, then teach each map component to draw it
// (and to hide it when `visible` is false).

export const layers = $state({
	sensors: { label: 'Water-level sensors', visible: true, legend: 'levels' }
});
```

</details>

<details>
<summary>📄 <code>app/src/routes/+layout.svelte</code> as it is at <code>step-5</code></summary>

```svelte
<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { feed } from '#lib/feed.svelte.js';
	import { showTime } from '#lib/sensors.js';

	// Step 5: the layout is the frame around EVERY page, and it stays mounted while you move
	// between pages. So this is the place to start the sensor feed: once, for the whole app.
	let { children } = $props();

	onMount(() => feed.start()); // start() returns the stop function; Svelte calls it on unmount

	const pages = [
		{ href: '/maplibre', name: 'MapLibre GL', what: '2D map' },
		{ href: '/sensors', name: 'Sensor data', what: 'table' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Flood twin · Tambaram</title>
</svelte:head>

<div class="app">
	<header>
		<strong class="title">Flood twin · Tambaram</strong>

		<nav>
			{#each pages as p (p.href)}
				<a href={p.href} class:active={page.url.pathname === p.href}>
					{p.name} <small>{p.what}</small>
				</a>
			{/each}
		</nav>

		<div class="status">
			<span class="dot {feed.status}">●</span>
			{#if feed.status === 'connecting'}
				Connecting …
			{:else if feed.status === 'live'}
				<strong>Live</strong> · {showTime(feed.live?.time)} IST · {feed.secondsAgo(feed.lastOk)} s ago
			{:else if feed.status === 'delayed'}
				<strong>Delayed</strong> · last update {feed.secondsAgo(feed.lastOk)} s ago
			{:else}
				<strong>Feed lost</strong> · {feed.lastError}
			{/if}
			<button onclick={feed.togglePolling}>{feed.polling ? 'Pause' : 'Resume'}</button>
			<button onclick={feed.poll}>Update now</button>
		</div>
	</header>

	{#if feed.status === 'lost'}
		<div class="banner lost">
			<strong>No data from the sensors{feed.lastOk ? ` for ${feed.secondsAgo(feed.lastOk)} s` : ''}.</strong>
			{#if feed.live}
				Showing the last known levels, from {showTime(feed.live.time)} IST. They may be out of date.
			{/if}
		</div>
	{/if}

	{#if feed.live}
		<div class="banner" class:alert={feed.alerts.length > 0}>
			{#if feed.alerts.length > 0}
				<strong>
					{feed.status === 'lost' ? 'Last known: ' : ''}{feed.alerts.length}
					{feed.alerts.length === 1 ? 'sensor' : 'sensors'} at warning or danger:
				</strong>
				{#each feed.alerts as site, i (site.id)}
					{i > 0 ? ', ' : ''}{site.id} ({feed.readingFor(site.id).depth_m} m)
				{/each}
			{:else if feed.status === 'lost'}
				<!-- "No warnings" while the feed is down would be a false all-clear. -->
				<strong>Flood warnings unknown: the feed is lost.</strong>
			{:else}
				<strong>No flood warnings.</strong>
			{/if}
			<span class="note">· {feed.untrusted} of {feed.sites.length} sensors without recent or trustworthy data</span>
		</div>
	{/if}

	<main>
		{@render children()}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
	}
	/* The app fills the window: header and banners on top, the page takes the rest. */
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}
	main {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 1.2rem;
		padding: 0.5rem 1rem;
		background: #17324a;
		color: #fff;
	}
	.title {
		font-size: 1.05rem;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
	}
	nav a {
		color: #cfe0ee;
		text-decoration: none;
		padding: 0.25rem 0.6rem;
		border-radius: 4px;
	}
	nav a small {
		opacity: 0.7;
	}
	nav a.active {
		background: #fff;
		color: #17324a;
	}
	.status {
		margin-left: auto;
		font-size: 0.85rem;
	}
	.status button {
		margin-left: 0.3rem;
	}
	.dot.connecting {
		color: #b0b0b0;
	}
	.dot.live {
		color: #66bb6a;
	}
	.dot.delayed {
		color: #ffa726;
	}
	.dot.lost {
		color: #ef5350;
	}
	.banner {
		padding: 0.4rem 1rem;
		font-size: 0.9rem;
		background: #e8f1f8;
		border-left: 5px solid #5b8db8;
	}
	.banner.alert {
		background: #fdecea;
		border-left-color: #c62828;
	}
	.banner.lost {
		background: #333;
		color: #fff;
		border-left-color: #c62828;
	}
	.note {
		color: #555;
		font-size: 0.85rem;
	}
</style>
```

</details>

<details>
<summary>📄 <code>app/src/routes/+layout.js</code> as it is at <code>step-5</code></summary>

```js
// Step 2: web maps need the browser (a canvas, WebGL, the window size).
// Step 5: now set for the whole app, not one page: every page is rendered only in the browser.
export const ssr = false;
```

</details>

<details>
<summary>📄 <code>app/src/routes/+page.js</code> as it is at <code>step-5</code></summary>

```js
import { redirect } from '@sveltejs/kit';

// Step 5: the home address has no page of its own; it sends you to the map.
export function load() {
	redirect(307, '/maplibre');
}
```

</details>

<details>
<summary>📄 <code>app/src/routes/maplibre/+page.svelte</code> as it is at <code>step-5</code></summary>

```svelte
<script>
	import MapPage from '#lib/MapPage.svelte';
	import MapLibreMap from '#lib/MapLibreMap.svelte';
	import { feed } from '#lib/feed.svelte.js';
	import { layers } from '#lib/layers.svelte.js';
</script>

<MapPage>
	<MapLibreMap geojson={feed.geojson} {layers} />
</MapPage>
```

</details>

<details>
<summary>📄 <code>app/src/routes/sensors/+page.svelte</code> as it is at <code>step-5</code></summary>

```svelte
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
```

</details>

<details>
<summary>📄 <code>app/src/lib/MapPage.svelte</code> as it is at <code>step-5</code></summary>

```svelte
<script>
	import LayerPanel from '#lib/LayerPanel.svelte';
	import { feed } from '#lib/feed.svelte.js';

	// Step 5: the frame shared by every map page: the map fills the space, the layer panel
	// floats on top, and the map goes grey when the feed is lost (step 4).
	let { children } = $props();
</script>

<div class="map-page">
	<div class="map" class:faded={feed.status === 'lost'}>
		{@render children()}
	</div>
	<LayerPanel />
</div>

<style>
	.map-page {
		position: relative;
		height: 100%;
	}
	.map {
		height: 100%;
	}
	/* Feed lost: grey the map out, so nobody mistakes old colours for the current situation. */
	.faded {
		filter: grayscale(0.9) opacity(0.6);
	}
</style>
```

</details>

<details>
<summary>📄 <code>app/src/lib/LayerPanel.svelte</code> as it is at <code>step-5</code></summary>

```svelte
<script>
	import { layers } from '#lib/layers.svelte.js';
	import { LEVELS } from '#lib/sensors.js';

	// Step 5: switch information layers on and off. Floats over the top-left of every map page.
	let open = $state(true);
</script>

<section class="panel">
	<button class="head" onclick={() => (open = !open)} aria-expanded={open}>
		Layers <span>{open ? '▾' : '▸'}</span>
	</button>

	{#if open}
		{#each Object.entries(layers) as [id, layer] (id)}
			<label>
				<input type="checkbox" bind:checked={layer.visible} />
				{layer.label}
			</label>
			{#if layer.visible && layer.legend === 'levels'}
				<ul class="legend">
					{#each Object.entries(LEVELS) as [key, l] (key)}
						<li><i style:background={l.colour}></i>{l.label}</li>
					{/each}
				</ul>
			{/if}
		{/each}
	{/if}
</section>

<style>
	.panel {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 10;
		min-width: 13rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.95);
		border-radius: 6px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		font-size: 0.9rem;
	}
	.head {
		all: unset;
		cursor: pointer;
		display: flex;
		justify-content: space-between;
		width: 100%;
		font-weight: 600;
	}
	label {
		display: block;
		margin-top: 0.45rem;
		cursor: pointer;
	}
	.legend {
		list-style: none;
		margin: 0.25rem 0 0 1.4rem;
		padding: 0;
		font-size: 0.8rem;
	}
	i {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		margin-right: 0.35rem;
		vertical-align: -0.05rem;
	}
</style>
```

</details>

<details>
<summary>🔍 What changed in <code>app/src/lib/MapLibreMap.svelte</code> from <code>step-4</code> to <code>step-5</code></summary>

```diff
--- a/app/src/lib/MapLibreMap.svelte
+++ b/app/src/lib/MapLibreMap.svelte
@@ -7,5 +7,6 @@
 	// Step 2: the sensors on a 2D web map with MapLibre GL.
 	// The page gives us the data as GeoJSON; this component only draws it.
-	let { geojson } = $props();
+	// Step 5: `layers` says which information layers are switched on.
+	let { geojson, layers } = $props();
 
 	let container; // the <div> the map draws into
@@ -90,4 +91,10 @@
 		map?.getSource('sensors').setData(geojson);
 	});
+
+	// Step 5: show or hide the sensor layers when the checkbox in the layer panel changes.
+	$effect(() => {
+		const visibility = layers.sensors.visible ? 'visible' : 'none';
+		for (const id of ['sensor-dots', 'sensor-labels']) map?.setLayoutProperty(id, 'visibility', visibility);
+	});
 </script>
 
@@ -97,6 +104,5 @@
 	.map {
 		width: 100%;
-		height: 60vh;
-		border-radius: 6px;
+		height: 100%;
 	}
 </style>
```

</details>

**Why it was done this way, things to try, questions:** [STEPS.md, step 5](../STEPS.md#step-5--pages-one-shared-feed-switchable-layers--step-5).

---

## Walkthrough: step 5 in small pieces, with all the code

This step moves a lot of code. The pieces are ordered so that the app works again at the end of each one.

### 5.A · The shared feed

Create **`app/src/lib/feed.svelte.js`**. Everything in it already exists in your `+page.svelte`, from step 4: the constants, the state, `poll`, `getJSON`, `updateLevels` and the timer loop. Here it is gathered in one class:

```js
// Step 5: ONE sensor feed for the whole app.
//
// Until step 4 the page did the polling itself. Now there are several pages (the map, the
// sensor table, and more to come), and they must all show the same data without each asking
// the API on its own. So the feed lives here, in a shared store, and the layout starts it once.
//
// The file name ends in .svelte.js so that $state and $derived work outside a component.

import { toGeoJSON, classify } from '#lib/sensors.js';

const POLL_MS = 10_000; // ask the API every 10 s (= 10 minutes of replayed data)
const TIMEOUT_MS = 5_000; // give up on a request that takes longer than this
const FEED_LOST_AFTER_MS = 30_000; // no good answer for this long: the feed is lost

class Feed {
	sites = $state([]); // from /api/sites: where each sensor is
	live = $state(null); // from /api/live: the latest reading of each sensor

	levels = $state({}); // step 3: the level of each sensor
	changes = $state({}); // step 3: how often each level changed since the app opened

	polling = $state(true); // step 4: Pause / Resume
	lastOk = $state(null); // when (browser clock) we last got a good answer
	lastError = $state(null); // what went wrong last time, if anything
	now = $state(Date.now()); // ticks every second, so "… s ago" stays up to date

	// 'connecting', 'live', 'delayed' or 'lost'
	status = $derived(
		this.lastOk == null
			? this.lastError ? 'lost' : 'connecting'
			: !this.lastError ? 'live'
			: this.now - this.lastOk < FEED_LOST_AFTER_MS ? 'delayed'
			: 'lost'
	);

	geojson = $derived(toGeoJSON(this.sites, this.live, this.levels));

	alerts = $derived(
		this.sites
			.filter((s) => this.levels[s.id] === 'danger' || this.levels[s.id] === 'warning')
			.sort((a, b) => (this.levels[b.id] === 'danger') - (this.levels[a.id] === 'danger'))
	);

	untrusted = $derived(
		this.sites.filter((s) => this.levels[s.id] === 'stale' || this.levels[s.id] === 'suspect').length
	);

	readingFor = (id) => this.live?.readings.find((r) => r.site === id);

	secondsAgo = (t) => Math.round((this.now - t) / 1000);

	// Arrow functions, so they can be used directly as onclick={feed.poll}.
	poll = async () => {
		try {
			if (this.sites.length === 0) this.sites = (await getJSON('/api/sites')).sites; // only once
			this.live = await getJSON('/api/live');
			this.#updateLevels();
			this.lastOk = Date.now();
			this.lastError = null;
		} catch (e) {
			// Keep the last good data on screen, but remember that this attempt failed.
			this.lastError = e.name === 'TimeoutError' ? 'the API did not answer in time' : e.message;
		}
	};

	togglePolling = () => {
		this.polling = !this.polling;
	};

	#updateLevels() {
		const next = {};
		for (const site of this.sites) {
			const level = classify(site, this.readingFor(site.id), this.levels[site.id]);
			const before = this.levels[site.id];
			if (before && before !== level) this.changes[site.id] = (this.changes[site.id] ?? 0) + 1;
			next[site.id] = level;
		}
		this.levels = next;
	}

	// Start polling. Returns a function that stops it again.
	start() {
		let timer;
		let stopped = false;
		const tick = async () => {
			if (this.polling) await this.poll();
			if (!stopped) timer = setTimeout(tick, POLL_MS); // wait for the answer, then schedule
		};
		tick();
		const clock = setInterval(() => (this.now = Date.now()), 1000);
		return () => {
			stopped = true;
			clearTimeout(timer);
			clearInterval(clock);
		};
	}
}

// Fetch JSON, but never wait forever: a hanging server must count as a failure too.
async function getJSON(url) {
	const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (!res.ok) throw new Error(`${url} answered ${res.status}`);
	return res.json();
}

// The one and only feed. Every page imports this same object.
export const feed = new Feed();
```

Compare it with your page line by line: `levels` became `this.levels`, `feed` became `status`, the `onMount` loop became `start()`.

**You see:** nothing yet: nobody uses the feed.

### 5.B · The page uses the shared feed

Before you split the page, let it use the feed instead of its own copy. In `+page.svelte`, **delete** from the script: the three constants, all the `$state` and `$derived` lines, `getJSON`, `poll`, `updateLevels`, `readingFor`, `secondsAgo` and the whole `onMount(…)`. What's left of the script:

```svelte
<script>
	import { onMount } from 'svelte';
	import MapLibreMap from '#lib/MapLibreMap.svelte';
	import { LEVELS, showTime, showAge } from '#lib/sensors.js';
	import { feed } from '#lib/feed.svelte.js';

	onMount(() => feed.start()); // start() returns the stop function; Svelte calls it when the page goes
</script>
```

Now put `feed.` in front of every name in the HTML that came from the feed:

| Was | Becomes |
|---|---|
| `feed === 'lost'`, `{feed}` | `feed.status === 'lost'`, `{feed.status}` |
| `live`, `sites`, `levels`, `changes`, `alerts`, `untrusted`, `lastOk`, `lastError`, `polling`, `geojson` | `feed.live`, `feed.sites`, … , `feed.geojson` |
| `readingFor(…)`, `secondsAgo(…)` | `feed.readingFor(…)`, `feed.secondsAgo(…)` |
| `onclick={() => (polling = !polling)}` | `onclick={feed.togglePolling}` |
| `onclick={poll}` | `onclick={feed.poll}` |

**You see:** exactly the same page as at the end of step 4, working as before. The difference is invisible: the data now lives in `feed.svelte.js`.

### 5.C · The layout starts the feed and shows the status

The status line and banners should be on **every** page, so they move to the layout. `ssr = false` moves with them: create **`app/src/routes/+layout.js`**:

```js
// Web maps need the browser (a canvas, WebGL, the window size).
// Every page of this app is rendered only in the browser.
export const ssr = false;
```

and delete `app/src/routes/+page.js`.

Replace **all of** `app/src/routes/+layout.svelte` with:

```svelte
<script>
	import { onMount } from 'svelte';
	import favicon from '#lib/assets/favicon.svg';
	import { feed } from '#lib/feed.svelte.js';
	import { showTime } from '#lib/sensors.js';

	// The layout is the frame around EVERY page, and it stays mounted while you move
	// between pages. So this is the place to start the sensor feed: once, for the whole app.
	let { children } = $props();

	onMount(() => feed.start());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Flood twin · Tambaram</title>
</svelte:head>

<div class="app">
	<header>
		<strong class="title">Flood twin · Tambaram</strong>

		<div class="status">
			<span class="dot {feed.status}">●</span>
			{#if feed.status === 'connecting'}
				Connecting …
			{:else if feed.status === 'live'}
				<strong>Live</strong> · {showTime(feed.live?.time)} IST · {feed.secondsAgo(feed.lastOk)} s ago
			{:else if feed.status === 'delayed'}
				<strong>Delayed</strong> · last update {feed.secondsAgo(feed.lastOk)} s ago
			{:else}
				<strong>Feed lost</strong> · {feed.lastError}
			{/if}
			<button onclick={feed.togglePolling}>{feed.polling ? 'Pause' : 'Resume'}</button>
			<button onclick={feed.poll}>Update now</button>
		</div>
	</header>

	{#if feed.status === 'lost'}
		<div class="banner lost">
			<strong>No data from the sensors{feed.lastOk ? ` for ${feed.secondsAgo(feed.lastOk)} s` : ''}.</strong>
			{#if feed.live}
				Showing the last known levels, from {showTime(feed.live.time)} IST. They may be out of date.
			{/if}
		</div>
	{/if}

	{#if feed.live}
		<div class="banner" class:alert={feed.alerts.length > 0}>
			{#if feed.alerts.length > 0}
				<strong>
					{feed.status === 'lost' ? 'Last known: ' : ''}{feed.alerts.length}
					{feed.alerts.length === 1 ? 'sensor' : 'sensors'} at warning or danger:
				</strong>
				{#each feed.alerts as site, i (site.id)}
					{i > 0 ? ', ' : ''}{site.id} ({feed.readingFor(site.id).depth_m} m)
				{/each}
			{:else if feed.status === 'lost'}
				<!-- "No warnings" while the feed is down would be a false all-clear. -->
				<strong>Flood warnings unknown: the feed is lost.</strong>
			{:else}
				<strong>No flood warnings.</strong>
			{/if}
			<span class="note">· {feed.untrusted} of {feed.sites.length} sensors without recent or trustworthy data</span>
		</div>
	{/if}

	<main>
		{@render children()}
	</main>
</div>
```

Under it, the style: a dark-blue header, the coloured dots, the banners, and a column that fills the window (`.app`, `main`):

```svelte
<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
	}
	/* The app fills the window: header and banners on top, the page takes the rest. */
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}
	main {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 1.2rem;
		padding: 0.5rem 1rem;
		background: #17324a;
		color: #fff;
	}
	.title {
		font-size: 1.05rem;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
	}
	nav a {
		color: #cfe0ee;
		text-decoration: none;
		padding: 0.25rem 0.6rem;
		border-radius: 4px;
	}
	nav a small {
		opacity: 0.7;
	}
	nav a.active {
		background: #fff;
		color: #17324a;
	}
	.status {
		margin-left: auto;
		font-size: 0.85rem;
	}
	.status button {
		margin-left: 0.3rem;
	}
	.dot.connecting {
		color: #b0b0b0;
	}
	.dot.live {
		color: #66bb6a;
	}
	.dot.delayed {
		color: #ffa726;
	}
	.dot.lost {
		color: #ef5350;
	}
	.banner {
		padding: 0.4rem 1rem;
		font-size: 0.9rem;
		background: #e8f1f8;
		border-left: 5px solid #5b8db8;
	}
	.banner.alert {
		background: #fdecea;
		border-left-color: #c62828;
	}
	.banner.lost {
		background: #333;
		color: #fff;
		border-left-color: #c62828;
	}
	.note {
		color: #555;
		font-size: 0.85rem;
	}
</style>
```

In `+page.svelte`, **delete** what the layout now does: the `onMount` line and its import, the status paragraph, both banners and their CSS.

**You see:** a dark-blue header with the title and the status, the banners under it, and your map and table below. **Network** tab: still one `/api/live` every 10 s.

### 5.D · The sensor table gets its own page

Create the folder `app/src/routes/sensors/` and in it **`+page.svelte`**:

```svelte
<script>
	import { feed } from '#lib/feed.svelte.js';
	import { LEVELS, showTime, showAge } from '#lib/sensors.js';

	// The sensor table, a page of its own. It reads the same shared feed as the map.
</script>

<div class="page">
	<h1>Sensor data</h1>
	<p>
		The latest reading of each of the {feed.sites.length} water-level sensors. <em>Changes</em> counts how
		often a sensor's level changed since you opened the app.
	</p>

	<!-- the <table> from your +page.svelte goes here, unchanged -->
</div>
```

**Cut** the `<table>…</table>` from `app/src/routes/+page.svelte` and paste it in place of the comment. Move its CSS too, and give `.page` a width: `max-width: 60rem; margin: 1.5rem auto; padding: 0 1rem;`.

**You see:** open `/sensors`: the table under the header. `/` shows only the map now.

### 5.E · The map gets its own page

Create `app/src/routes/maplibre/` and in it **`+page.svelte`**:

```svelte
<script>
	import MapLibreMap from '#lib/MapLibreMap.svelte';
	import { feed } from '#lib/feed.svelte.js';
</script>

<MapLibreMap geojson={feed.geojson} />
```

In `MapLibreMap.svelte`, let the map fill whatever space it gets:

```css
	.map {
		width: 100%;
		height: 100%;
	}
```

**You see:** `/maplibre`: the map fills everything below the header and banners, without a scroll bar.

### 5.F · Navigation, and `/` goes to the map

Delete `app/src/routes/+page.svelte` (its table and map have moved). Create **`app/src/routes/+page.js`** in its place:

```js
import { redirect } from '@sveltejs/kit';

// The home address has no page of its own; it sends you to the map.
export function load() {
	redirect(307, '/maplibre');
}
```

In `+layout.svelte`, add to the script:

```js
	import { page } from '$app/state';

	const pages = [
		{ href: '/maplibre', name: 'MapLibre GL', what: '2D map' },
		{ href: '/sensors', name: 'Sensor data', what: 'table' }
	];
```

and in the header, after the title:

```svelte
		<nav>
			{#each pages as p (p.href)}
				<a href={p.href} class:active={page.url.pathname === p.href}>
					{p.name} <small>{p.what}</small>
				</a>
			{/each}
		</nav>
```

**You see:** `/` sends you to `/maplibre`. The header has two links; the current page's is white. Switch pages: the status keeps counting, and the **Changes** column on *Sensor data* keeps its numbers. The feed never restarts.

### 5.G · A list of layers and a Layers box

Create **`app/src/lib/layers.svelte.js`**:

```js
// The information layers you can switch on and off, shared by every page.
export const layers = $state({
	sensors: { label: 'Water-level sensors', visible: true, legend: 'levels' }
});
```

Create **`app/src/lib/LayerPanel.svelte`**:

```svelte
<script>
	import { layers } from '#lib/layers.svelte.js';
	import { LEVELS } from '#lib/sensors.js';

	let open = $state(true);
</script>

<section class="panel">
	<button class="head" onclick={() => (open = !open)} aria-expanded={open}>
		Layers <span>{open ? '▾' : '▸'}</span>
	</button>

	{#if open}
		{#each Object.entries(layers) as [id, layer] (id)}
			<label>
				<input type="checkbox" bind:checked={layer.visible} />
				{layer.label}
			</label>
			{#if layer.visible && layer.legend === 'levels'}
				<ul class="legend">
					{#each Object.entries(LEVELS) as [key, l] (key)}
						<li><i style:background={l.colour}></i>{l.label}</li>
					{/each}
				</ul>
			{/if}
		{/each}
	{/if}
</section>

<style>
	.panel {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 10;
		min-width: 13rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.95);
		border-radius: 6px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		font-size: 0.9rem;
	}
	.head {
		all: unset;
		cursor: pointer;
		display: flex;
		justify-content: space-between;
		width: 100%;
		font-weight: 600;
	}
	label {
		display: block;
		margin-top: 0.45rem;
		cursor: pointer;
	}
	.legend {
		list-style: none;
		margin: 0.25rem 0 0 1.4rem;
		padding: 0;
		font-size: 0.8rem;
	}
	i {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		margin-right: 0.35rem;
	}
</style>
```

### 5.H · A frame for map pages

Create **`app/src/lib/MapPage.svelte`**:

```svelte
<script>
	import LayerPanel from '#lib/LayerPanel.svelte';
	import { feed } from '#lib/feed.svelte.js';

	// The frame of every map page: the map fills the space, the layer panel floats on top,
	// and the map goes grey when the feed is lost.
	let { children } = $props();
</script>

<div class="map-page">
	<div class="map" class:faded={feed.status === 'lost'}>
		{@render children()}
	</div>
	<LayerPanel />
</div>

<style>
	.map-page {
		position: relative;
		height: 100%;
	}
	.map {
		height: 100%;
	}
	.faded {
		filter: grayscale(0.9) opacity(0.6);
	}
</style>
```

Use it on the map page, and give the map the layers:

```svelte
<script>
	import MapPage from '#lib/MapPage.svelte';
	import MapLibreMap from '#lib/MapLibreMap.svelte';
	import { feed } from '#lib/feed.svelte.js';
	import { layers } from '#lib/layers.svelte.js';
</script>

<MapPage>
	<MapLibreMap geojson={feed.geojson} {layers} />
</MapPage>
```

**You see:** the *Layers* box at the top left of the map, with the legend. The checkbox does nothing yet.

### 5.I · The map follows the checkbox

In `MapLibreMap.svelte`, receive `layers`:

```js
	let { geojson, layers } = $props();
```

and after the other `$effect`:

```js
	// Show or hide the sensor layers when the checkbox in the layer panel changes.
	$effect(() => {
		const visibility = layers.sensors.visible ? 'visible' : 'none';
		for (const id of ['sensor-dots', 'sensor-labels']) map?.setLayoutProperty(id, 'visibility', visibility);
	});
```

**You see:** untick *Water-level sensors*: the dots and labels disappear. Go to *Sensor data* and back: still off. Stop the API: the map goes grey. That's the reference of this step. Commit.


---

[Step 6 · Charts in the popup →](06-charts.md)

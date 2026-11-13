# Step 4 · Live updates and "feed lost"

[← Step 3](03-thresholds.md) · [Guide overview](README.md) · [Step 5 →](05-pages-layers.md)

**You build:** a page that asks for new readings every 10 seconds by itself, shows whether the feed is *Live*, *Delayed* or *Lost*, and never pretends that old data is current.
**You learn:** polling with `setTimeout`; timeouts with `AbortSignal`; cleaning up timers; describing a situation as a small state machine.
**Time:** about 45 minutes.
**Start from:** your step 3, or the tag `step-3`.

---

## Why this matters

During a flood, the twin is open on a screen in a control room for hours. Nobody presses *Refresh*. If the connection to the sensors breaks, the map keeps showing the last colours, and they look exactly like current ones. A twin that shows yesterday's map as if it were today's is worse than no twin.

So in this step the page polls by itself, and it says, loudly, when it can't get data.

All changes are in `app/src/routes/+page.svelte`.

## 4.1 · Never wait forever

`fetch()` waits as long as the server takes. A server that hangs would freeze your feed without an error. Write a helper that gives up after 5 seconds and treats a bad status as an error:

```js
const TIMEOUT_MS = 5_000;

async function getJSON(url) {
	const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (!res.ok) throw new Error(`${url} answered ${res.status}`);
	return res.json();
}
```

(`5_000` is just `5000`; the `_` makes long numbers easier to read.)

## 4.2 · Poll, don't load

Rename `load()` to **`poll()`** and change it:

- Fetch `/api/sites` **only the first time** (`if (sites.length === 0)`): sites don't change.
- Fetch `/api/live` every time, with `getJSON`.
- Replace `error` by two pieces of state that describe the feed's health:

  ```js
  let lastOk = $state(null);    // when (browser clock, ms) we last got a good answer
  let lastError = $state(null); // what went wrong last time, or null
  ```

  On success: `lastOk = Date.now(); lastError = null;`. On failure: set `lastError` to the message, but **keep** `live`, `levels` and everything else. The last good data stays on screen; we only remember that it's getting old. For a timeout (`e.name === 'TimeoutError'`), write something a person understands, like *the API did not answer in time*.

## 4.3 · Ask again every 10 seconds

You could write `setInterval(poll, 10_000)`. Don't: if the API is slow and takes 12 seconds to answer, `setInterval` sends the next request anyway, and requests pile up exactly when the server is already struggling (during a flood, when everyone opens the map).

Instead: poll, **wait for the answer**, then schedule the next one with `setTimeout`:

```js
const POLL_MS = 10_000;
let polling = $state(true); // for a Pause button

onMount(() => {
	let timer;
	let stopped = false;

	async function tick() {
		if (polling) await poll();
		if (!stopped) timer = setTimeout(tick, POLL_MS);
	}
	tick();

	return () => {
		stopped = true;
		clearTimeout(timer);
	};
});
```

The function that `onMount` **returns** runs when the page goes away. Without it, the timer would keep polling forever in the background, even after you've left the page. (You'll see that this matters in step 5, when there are several pages.)

Replace the *Refresh* button by two buttons: **Pause / Resume** (switches `polling`) and **Update now** (calls `poll`).

## 4.4 · Live, delayed or lost?

The feed is in one of four situations:

| Status | When |
|---|---|
| `connecting` | No good answer yet, and no error yet |
| `live` | The last request worked |
| `delayed` | The last request failed, but we had a good answer less than 30 s ago |
| `lost` | No good answer for 30 s (or never, and there was an error) |

Write that as one derived value, `feed`, from `lastOk`, `lastError` and the current time. There's a catch: `Date.now()` is not state, so a `$derived` that uses it would never recompute while nothing else changes, and *delayed* would never turn into *lost*. So keep a ticking clock in state:

```js
let now = $state(Date.now());
// in onMount:
const clock = setInterval(() => (now = Date.now()), 1000);
// and in the clean-up function:
clearInterval(clock);
```

Now write `let feed = $derived(…)` using `lastOk`, `lastError`, `now` and `FEED_LOST_AFTER_MS = 30_000`. A chain of `condition ? a : b` works well here.

## 4.5 · Say it on screen

1. **A status line** at the top: a coloured dot (grey, green, orange, red for the four statuses) and a text:
   - *Connecting to the sensor feed …*
   - **Live** · sensor time 14:30 IST · updated 3 s ago
   - **Delayed** · last update 15 s ago, retrying
   - **Feed lost** · *the reason from `lastError`*

   A helper `secondsAgo(t)` that returns `Math.round((now - t) / 1000)` keeps the "… s ago" ticking.

2. **A dark banner when the feed is lost:** *No data from the sensors for 45 s. The map shows the last known levels, from 14:30 IST. They may be out of date.*

3. **The alert banner must not lie.** While the feed is lost:
   - with alerts, it starts with **"Last known:"**;
   - without alerts, it must **not** say *No flood warnings*. It says **"Flood warnings unknown: the feed is lost."** A false all-clear is the most dangerous thing a flood map can show.

4. **Grey out the map and the table** while the feed is lost. Wrap the map in a `<div class:faded-map={feed === 'lost'}>` and give that class `filter: grayscale(0.9) opacity(0.6);`.

## Check

- [ ] Leave the page alone: the dot is green, the sensor time moves on every 10 s, "updated … s ago" counts up and resets.
- [ ] Stop the API (Ctrl+C in terminal 1). Within 10 s: orange, **Delayed**. After 30 s: red, **Feed lost**, a dark banner, a grey map, *Last known:* or *Flood warnings unknown*.
- [ ] Start the API again: green within 10 s, **without reloading the page**.
- [ ] **Pause** stops the updates; **Update now** still works.
- [ ] Open the browser's developer tools, **Network** tab: exactly one request to `/api/live` every 10 s.

Commit your work.

## Stuck?

| Problem | Try |
|---|---|
| It never becomes *lost*, stays *delayed* | Your `feed` doesn't depend on a `$state` that changes every second. Use `now` |
| Requests every 10 s become two, then four… | Hot reload started a second timer: your clean-up function is missing or doesn't stop the timer. Reload the page to check |
| When the API is back, it stays *lost* | Set `lastError = null` on success |
| The map is empty after the API was down at the start | `sites` stayed empty: fetch it in `poll()` while `sites.length === 0`, not only once in `onMount` |

Compare: `git diff step-4 -- app/src`.

<details>
<summary>🔍 What changed in <code>app/src/routes/+page.svelte</code> from <code>step-3</code> to <code>step-4</code></summary>

```diff
--- a/app/src/routes/+page.svelte
+++ b/app/src/routes/+page.svelte
@@ -7,18 +7,32 @@
 	// Step 2: show them on a map as well as in the table.
 	// Step 3: turn each reading into a level (dry / watch / warning / danger, or stale / suspect).
+	// Step 4: ask for new readings by itself, and say so clearly when the feed is lost.
+
+	const POLL_MS = 10_000; // ask the API every 10 s (= 10 minutes of replayed data)
+	const TIMEOUT_MS = 5_000; // give up on a request that takes longer than this
+	const FEED_LOST_AFTER_MS = 30_000; // no good answer for this long: the feed is lost
 
 	let sites = $state([]); // from /api/sites: where each sensor is
 	let live = $state(null); // from /api/live: the latest reading of each sensor
-	let error = $state(null);
 
 	// Step 3: the level of each sensor, and how often it changed since you opened the page.
-	// We keep the previous levels because hysteresis needs them.
 	let levels = $state({});
 	let changes = $state({});
 
-	// The same data as GeoJSON for the map. $derived recomputes it whenever its inputs change.
-	let geojson = $derived(toGeoJSON(sites, live, levels));
+	// Step 4: the health of the feed.
+	let polling = $state(true); // the Pause / Resume button
+	let lastOk = $state(null); // when (browser clock) we last got a good answer
+	let lastError = $state(null); // what went wrong last time, if anything
+	let now = $state(Date.now()); // ticks every second, so "… s ago" stays up to date
+
+	let feed = $derived(
+		lastOk == null
+			? lastError ? 'lost' : 'connecting'
+			: !lastError ? 'live'
+			: now - lastOk < FEED_LOST_AFTER_MS ? 'delayed'
+			: 'lost'
+	);
 
-	// The alert banner: every sensor at warning or danger, most severe first.
+	let geojson = $derived(toGeoJSON(sites, live, levels));
 	let alerts = $derived(
 		sites
@@ -28,14 +42,21 @@
 	let untrusted = $derived(sites.filter((s) => levels[s.id] === 'stale' || levels[s.id] === 'suspect').length);
 
-	async function load() {
-		error = null;
+	// Fetch JSON, but never wait forever: a hanging server must count as a failure too.
+	async function getJSON(url) {
+		const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
+		if (!res.ok) throw new Error(`${url} answered ${res.status}`);
+		return res.json();
+	}
+
+	async function poll() {
 		try {
-			const [sitesRes, liveRes] = await Promise.all([fetch('/api/sites'), fetch('/api/live')]);
-			if (!sitesRes.ok || !liveRes.ok) throw new Error(`API answered ${sitesRes.status} / ${liveRes.status}`);
-			sites = (await sitesRes.json()).sites;
-			live = await liveRes.json();
+			if (sites.length === 0) sites = (await getJSON('/api/sites')).sites; // only once
+			live = await getJSON('/api/live');
 			updateLevels();
+			lastOk = Date.now();
+			lastError = null;
 		} catch (e) {
-			error = `Could not reach the sensor API: ${e.message}. Is it running?`;
+			// Keep the last good data on screen, but remember that this attempt failed.
+			lastError = e.name === 'TimeoutError' ? 'the API did not answer in time' : e.message;
 		}
 	}
@@ -51,10 +72,33 @@
 	}
 
-	onMount(load);
+	onMount(() => {
+		let timer;
+		let stopped = false;
+
+		// Poll, wait, poll again. We wait for each answer before scheduling the next request
+		// (setTimeout, not setInterval), so a slow API never piles up requests.
+		async function tick() {
+			if (polling) await poll();
+			if (!stopped) timer = setTimeout(tick, POLL_MS);
+		}
+		tick();
+
+		const clock = setInterval(() => (now = Date.now()), 1000);
+
+		// Clean up when the page goes away, or the timers keep running.
+		return () => {
+			stopped = true;
+			clearTimeout(timer);
+			clearInterval(clock);
+		};
+	});
 
-	// Look up a site's latest reading by its id.
 	function readingFor(id) {
 		return live?.readings.find((r) => r.site === id);
 	}
+
+	function secondsAgo(t) {
+		return Math.round((now - t) / 1000);
+	}
 </script>
 
@@ -66,11 +110,26 @@
 	<h1>Tambaram water levels</h1>
 
-	<p>
-		Sensor time: <strong>{showTime(live?.time)} IST</strong>
-		<button onclick={load}>Refresh</button>
+	<p class="status">
+		<span class="feed {feed}">●</span>
+		{#if feed === 'connecting'}
+			Connecting to the sensor feed …
+		{:else if feed === 'live'}
+			<strong>Live</strong> · sensor time {showTime(live?.time)} IST · updated {secondsAgo(lastOk)} s ago
+		{:else if feed === 'delayed'}
+			<strong>Delayed</strong> · last update {secondsAgo(lastOk)} s ago, retrying
+		{:else}
+			<strong>Feed lost</strong> · {lastError}
+		{/if}
+		<button onclick={() => (polling = !polling)}>{polling ? 'Pause' : 'Resume'}</button>
+		<button onclick={poll}>Update now</button>
 	</p>
 
-	{#if error}
-		<p class="error">{error}</p>
+	{#if feed === 'lost'}
+		<div class="banner lost">
+			<strong>No data from the sensors{lastOk ? ` for ${secondsAgo(lastOk)} s` : ''}.</strong>
+			{#if live}
+				The map shows the last known levels, from {showTime(live.time)} IST. They may be out of date.
+			{/if}
+		</div>
 	{/if}
 
@@ -78,8 +137,14 @@
 		<div class="banner" class:alert={alerts.length > 0}>
 			{#if alerts.length > 0}
-				<strong>{alerts.length} {alerts.length === 1 ? 'sensor' : 'sensors'} at warning or danger:</strong>
+				<strong>
+					{feed === 'lost' ? 'Last known: ' : ''}{alerts.length}
+					{alerts.length === 1 ? 'sensor' : 'sensors'} at warning or danger:
+				</strong>
 				{#each alerts as site, i (site.id)}
 					{i > 0 ? ', ' : ''}{site.id} ({readingFor(site.id).depth_m} m)
 				{/each}
+			{:else if feed === 'lost'}
+				<!-- "No warnings" while the feed is down would be a false all-clear. -->
+				<strong>Flood warnings unknown: the feed is lost.</strong>
 			{:else}
 				<strong>No flood warnings.</strong>
@@ -89,5 +154,7 @@
 	{/if}
 
-	<MapLibreMap {geojson} />
+	<div class:faded-map={feed === 'lost'}>
+		<MapLibreMap {geojson} />
+	</div>
 
 	<p class="legend">
@@ -97,5 +164,5 @@
 	</p>
 
-	<table>
+	<table class:faded={feed === 'lost'}>
 		<thead>
 			<tr><th>Site</th><th>Type</th><th>Depth (m)</th><th>Level</th><th>Measured</th><th>Age</th><th>Changes</th></tr>
@@ -126,4 +193,22 @@
 		padding: 0 1rem;
 	}
+	.status button {
+		margin-left: 0.4rem;
+	}
+	.feed {
+		font-size: 1.1rem;
+	}
+	.feed.connecting {
+		color: #b0b0b0;
+	}
+	.feed.live {
+		color: #2e7d32;
+	}
+	.feed.delayed {
+		color: #ef6c00;
+	}
+	.feed.lost {
+		color: #c62828;
+	}
 	.banner {
 		padding: 0.6rem 0.9rem;
@@ -137,4 +222,9 @@
 		border-left-color: #c62828;
 	}
+	.banner.lost {
+		background: #333;
+		color: #fff;
+		border-left-color: #c62828;
+	}
 	.note {
 		display: block;
@@ -143,4 +233,8 @@
 		margin-top: 0.2rem;
 	}
+	/* Feed lost: grey the map out, so nobody mistakes old colours for the current situation. */
+	.faded-map {
+		filter: grayscale(0.9) opacity(0.6);
+	}
 	.legend {
 		display: flex;
@@ -175,6 +269,3 @@
 		color: #888;
 	}
-	.error {
-		color: #b00020;
-	}
 </style>
```

</details>

<details>
<summary>📄 <code>app/src/routes/+page.svelte</code> as it is at <code>step-4</code></summary>

```svelte
<script>
	import { onMount } from 'svelte';
	import MapLibreMap from '#lib/MapLibreMap.svelte';
	import { toGeoJSON, classify, LEVELS, showTime, showAge } from '#lib/sensors.js';

	// Step 1: ask the sensor API for the sites and their latest readings.
	// Step 2: show them on a map as well as in the table.
	// Step 3: turn each reading into a level (dry / watch / warning / danger, or stale / suspect).
	// Step 4: ask for new readings by itself, and say so clearly when the feed is lost.

	const POLL_MS = 10_000; // ask the API every 10 s (= 10 minutes of replayed data)
	const TIMEOUT_MS = 5_000; // give up on a request that takes longer than this
	const FEED_LOST_AFTER_MS = 30_000; // no good answer for this long: the feed is lost

	let sites = $state([]); // from /api/sites: where each sensor is
	let live = $state(null); // from /api/live: the latest reading of each sensor

	// Step 3: the level of each sensor, and how often it changed since you opened the page.
	let levels = $state({});
	let changes = $state({});

	// Step 4: the health of the feed.
	let polling = $state(true); // the Pause / Resume button
	let lastOk = $state(null); // when (browser clock) we last got a good answer
	let lastError = $state(null); // what went wrong last time, if anything
	let now = $state(Date.now()); // ticks every second, so "… s ago" stays up to date

	let feed = $derived(
		lastOk == null
			? lastError ? 'lost' : 'connecting'
			: !lastError ? 'live'
			: now - lastOk < FEED_LOST_AFTER_MS ? 'delayed'
			: 'lost'
	);

	let geojson = $derived(toGeoJSON(sites, live, levels));
	let alerts = $derived(
		sites
			.filter((s) => levels[s.id] === 'danger' || levels[s.id] === 'warning')
			.sort((a, b) => (levels[b.id] === 'danger') - (levels[a.id] === 'danger'))
	);
	let untrusted = $derived(sites.filter((s) => levels[s.id] === 'stale' || levels[s.id] === 'suspect').length);

	// Fetch JSON, but never wait forever: a hanging server must count as a failure too.
	async function getJSON(url) {
		const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) throw new Error(`${url} answered ${res.status}`);
		return res.json();
	}

	async function poll() {
		try {
			if (sites.length === 0) sites = (await getJSON('/api/sites')).sites; // only once
			live = await getJSON('/api/live');
			updateLevels();
			lastOk = Date.now();
			lastError = null;
		} catch (e) {
			// Keep the last good data on screen, but remember that this attempt failed.
			lastError = e.name === 'TimeoutError' ? 'the API did not answer in time' : e.message;
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

	onMount(() => {
		let timer;
		let stopped = false;

		// Poll, wait, poll again. We wait for each answer before scheduling the next request
		// (setTimeout, not setInterval), so a slow API never piles up requests.
		async function tick() {
			if (polling) await poll();
			if (!stopped) timer = setTimeout(tick, POLL_MS);
		}
		tick();

		const clock = setInterval(() => (now = Date.now()), 1000);

		// Clean up when the page goes away, or the timers keep running.
		return () => {
			stopped = true;
			clearTimeout(timer);
			clearInterval(clock);
		};
	});

	function readingFor(id) {
		return live?.readings.find((r) => r.site === id);
	}

	function secondsAgo(t) {
		return Math.round((now - t) / 1000);
	}
</script>

<svelte:head>
	<title>Flood twin · Tambaram</title>
</svelte:head>

<main>
	<h1>Tambaram water levels</h1>

	<p class="status">
		<span class="feed {feed}">●</span>
		{#if feed === 'connecting'}
			Connecting to the sensor feed …
		{:else if feed === 'live'}
			<strong>Live</strong> · sensor time {showTime(live?.time)} IST · updated {secondsAgo(lastOk)} s ago
		{:else if feed === 'delayed'}
			<strong>Delayed</strong> · last update {secondsAgo(lastOk)} s ago, retrying
		{:else}
			<strong>Feed lost</strong> · {lastError}
		{/if}
		<button onclick={() => (polling = !polling)}>{polling ? 'Pause' : 'Resume'}</button>
		<button onclick={poll}>Update now</button>
	</p>

	{#if feed === 'lost'}
		<div class="banner lost">
			<strong>No data from the sensors{lastOk ? ` for ${secondsAgo(lastOk)} s` : ''}.</strong>
			{#if live}
				The map shows the last known levels, from {showTime(live.time)} IST. They may be out of date.
			{/if}
		</div>
	{/if}

	{#if live}
		<div class="banner" class:alert={alerts.length > 0}>
			{#if alerts.length > 0}
				<strong>
					{feed === 'lost' ? 'Last known: ' : ''}{alerts.length}
					{alerts.length === 1 ? 'sensor' : 'sensors'} at warning or danger:
				</strong>
				{#each alerts as site, i (site.id)}
					{i > 0 ? ', ' : ''}{site.id} ({readingFor(site.id).depth_m} m)
				{/each}
			{:else if feed === 'lost'}
				<!-- "No warnings" while the feed is down would be a false all-clear. -->
				<strong>Flood warnings unknown: the feed is lost.</strong>
			{:else}
				<strong>No flood warnings.</strong>
			{/if}
			<span class="note">{untrusted} of {sites.length} sensors have no recent or no trustworthy data.</span>
		</div>
	{/if}

	<div class:faded-map={feed === 'lost'}>
		<MapLibreMap {geojson} />
	</div>

	<p class="legend">
		{#each Object.entries(LEVELS) as [key, l] (key)}
			<span><i style:background={l.colour}></i>{l.label}</span>
		{/each}
	</p>

	<table class:faded={feed === 'lost'}>
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
	.status button {
		margin-left: 0.4rem;
	}
	.feed {
		font-size: 1.1rem;
	}
	.feed.connecting {
		color: #b0b0b0;
	}
	.feed.live {
		color: #2e7d32;
	}
	.feed.delayed {
		color: #ef6c00;
	}
	.feed.lost {
		color: #c62828;
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
	.banner.lost {
		background: #333;
		color: #fff;
		border-left-color: #c62828;
	}
	.note {
		display: block;
		font-size: 0.85rem;
		color: #555;
		margin-top: 0.2rem;
	}
	/* Feed lost: grey the map out, so nobody mistakes old colours for the current situation. */
	.faded-map {
		filter: grayscale(0.9) opacity(0.6);
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
</style>
```

</details>

**Why it was done this way, things to try, questions:** [STEPS.md, step 4](../STEPS.md#step-4--live-updates-and-a-feed-lost-indicator--step-4).

---

[Step 5 · Pages and layers →](05-pages-layers.md)

# Step 1 · The live feed as a table

[← Step 0](00-sveltekit.md) · [Guide overview](README.md) · [Step 2 →](02-maplibre.md)

**You build:** a page that asks the sensor API for every sensor and its latest reading, and shows them in a table with a *Refresh* button.
**You learn:** connecting to an API through the dev server; Svelte's `$state`, `onMount`, `{#each}` and `{#if}`; showing times correctly.
**Time:** about 45 minutes.
**Start from:** your step 0, or the tag `step-0`.

---

## 1.1 · Start the API and look at it

In **terminal 1**, in the repository folder:

```bash
python api/main.py
```

Open port **8000** and add `/docs` to the address. Try **`/sites`** and **`/live`** with *Try it out → Execute*. Read [The sensor API](api.md): you need the shape of these two answers in this step.

**Answer for yourself before you go on:** in `/live`, how old is TBM-01's reading? What does `age_s` mean?

## 1.2 · Let the dev server pass `/api` on to the API

Your page will ask for `/api/live`. Teach the dev server to pass everything that starts with `/api` on to port 8000 (see [How your app connects to it](api.md#how-your-app-connects-to-it)).

In `app/vite.config.js`, add a `server` block after `plugins: [ … ],`:

```js
	// The browser asks this dev server for /api/…, and the dev server passes the
	// request on to the sensor API. The browser only ever talks to one address.
	server: {
		proxy: {
			'/api': {
				target: process.env.API_URL ?? 'http://localhost:8000',
				rewrite: (path) => path.replace(/^\/api/, '')
			}
		}
	}
```

`rewrite` removes the `/api` again: `/api/live` arrives at the API as `/live`. `process.env.API_URL ?? …` means "the address in `API_URL` if you set one, otherwise port 8000 on this machine".

**Test it.** In **terminal 2**:

```bash
cd app
npm run dev
```

Open port 5173 and add **`/api/live`** to the address. You should see the API's JSON, served through your app's address. If you see *Not found*, check that the `server` block is inside `defineConfig({ … })`, and restart `npm run dev`: changes to `vite.config.js` need a restart.

## 1.3 · Fetch the data when the page opens

Replace everything in `app/src/routes/+page.svelte` with a script that:

1. keeps three pieces of **state**: `sites` (an empty list to start), `live` (`null` to start) and `error` (`null`);
2. has an `async function load()` that fetches `/api/sites` and `/api/live`, and stores `sites` (the `sites` list from the first answer) and `live` (the whole second answer);
3. runs `load()` once when the page opens.

What you need:

```js
import { onMount } from 'svelte';

let sites = $state([]);         // $state: when this changes, the page updates
onMount(load);                  // run load() once, after the page is on screen

const res = await fetch('/api/sites');   // ask
const body = await res.json();           // read the answer as JSON
```

Two requests that don't depend on each other can run at the same time:

```js
const [sitesRes, liveRes] = await Promise.all([fetch('/api/sites'), fetch('/api/live')]);
```

**Test it** before you build the table: put `<pre>{JSON.stringify(live, null, 2)}</pre>` under the script. Save: the page should show the JSON from `/live`.

## 1.4 · Show a table

Now replace the `<pre>` with a table: one row per site with **Site**, **Type**, **Depth (m)**, **Measured** and **Age**.

The sites and the readings are in two different lists. Write a small helper that finds a site's reading:

```js
function readingFor(id) {
	return live?.readings.find((r) => r.site === id);
}
```

`live?.readings` means "`live.readings`, unless `live` is still `null`": the page is drawn once before the data arrives, and must not crash then.

In the HTML, `{#each}` repeats a piece of HTML for every item in a list, and `{@const}` gives a value a name inside it:

```svelte
<tbody>
	{#each sites as site (site.id)}
		{@const r = readingFor(site.id)}
		<tr>
			<td>{site.id}</td>
			<td>{site.type}</td>
			<td>{r?.depth_m ?? '–'}</td>
			…
		</tr>
	{/each}
</tbody>
```

`(site.id)` is the **key**: it tells Svelte which row belongs to which site when the list changes. `?? '–'` shows a dash when there is no value (TBM-17 has never reported).

## 1.5 · Show times the way people read them

The API gives `time: 1794465329`. Nobody can read that. Write two helpers:

- `showTime(seconds)`: the time in **IST** (Indian time), like *12 Nov, 14:35*.
- `showAge(seconds)`: an age like *4 min*, *3 h* or *12 days*.

JavaScript's `Date` counts in **milliseconds**, the API in **seconds**. Converting to a time zone is built in:

```js
new Date(seconds * 1000).toLocaleString('en-GB', {
	timeZone: 'Asia/Kolkata',
	day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
});
```

Both helpers should return `'–'` for `null`.

**Why keep UTC and convert only for display?** Your computer, the server and the sensors can all be in different time zones. One time zone everywhere inside, local time only on screen, avoids a whole family of bugs.

## 1.6 · Refresh, and say when the API is down

1. Above the table, show the replay's "now" (`live.time`) and a **Refresh** button that calls `load()` again:

   ```svelte
   <button onclick={load}>Refresh</button>
   ```

2. Put the inside of `load()` in `try { … } catch (e) { … }`. When something fails, set `error` to a message a person understands, like *Could not reach the sensor API: … Is it running?* Also check `res.ok`: a server that answers `502` is not "fine".
3. Show the error above the table only when there is one:

   ```svelte
   {#if error}
   	<p class="error">{error}</p>
   {/if}
   ```

4. Give the page a title in the browser tab with `<svelte:head><title>Flood twin · Tambaram</title></svelte:head>`, and add some CSS in a `<style>` block so the table is readable.

## Check

- [ ] The table shows 33 sensors with their type, depth, time and age.
- [ ] TBM-17 shows dashes, not `null` or `undefined`.
- [ ] Times are in IST. (The API's `/health` shows `now` in UTC seconds: is your page 5 h 30 min ahead of it?)
- [ ] **Refresh** shows a later sensor time (one real minute is one hour of data).
- [ ] Stop the API (Ctrl+C in terminal 1) and press **Refresh**: your error message appears. Start the API again, press **Refresh**: it's gone.

Commit: `git add -A && git commit -m "My step 1: the feed as a table"`.

## Stuck?

| Problem | Try |
|---|---|
| `/api/live` gives *404 Not Found* | The proxy isn't active: is the `server` block inside `defineConfig`? Did you restart `npm run dev`? |
| `/api/live` gives *500* or *ECONNREFUSED* in terminal 2 | The API isn't running: start it in terminal 1 |
| `Cannot read properties of null (reading 'readings')` | You used `live.readings` before the data arrived. Use `live?.readings` |
| The table is empty, no error | Did you store `.sites` from the first answer, not the whole object? Use `console.log` and the browser's developer tools (F12 → *Console*) |
| Times are 5 h 30 min off | You forgot `* 1000`, or the `timeZone` |

Compare: `git diff step-1 -- app/src app/vite.config.js`. Take over: see [If you get stuck](README.md#if-you-get-stuck).

<details>
<summary>📄 <code>app/src/routes/+page.svelte</code> as it is at <code>step-1</code></summary>

```svelte
<script>
	import { onMount } from 'svelte';

	// Step 1: ask the sensor API for the sites and their latest readings, and show them as a table.

	let sites = $state([]); // from /api/sites: where each sensor is
	let live = $state(null); // from /api/live: the latest reading of each sensor
	let error = $state(null);

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

	// Times in the API are Unix seconds in UTC. Convert them only for display.
	function showTime(seconds) {
		if (seconds == null) return '–';
		return new Date(seconds * 1000).toLocaleString('en-GB', {
			timeZone: 'Asia/Kolkata',
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function showAge(seconds) {
		if (seconds == null) return '–';
		if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
		if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
		return `${Math.round(seconds / 86400)} days`;
	}

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
		max-width: 46rem;
		margin: 2rem auto;
		padding: 0 1rem;
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
	.error {
		color: #b00020;
	}
</style>
```

</details>

<details>
<summary>📄 <code>app/vite.config.js</code> as it is at <code>step-1</code></summary>

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

**Why it was done this way, and questions to think about:** [STEPS.md, step 1](../STEPS.md#step-1--fetch-the-live-sensor-feed--step-1).

---

[Step 2 · Sensors on a map →](02-maplibre.md)

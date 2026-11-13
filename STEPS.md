# Walkthrough

Each step ends with a git tag. If you fall behind, save your work and jump to the tag:

```bash
git stash                 # put your own changes aside
git checkout step-3       # continue from the end of step 3
```

---

## Before we start: where does Docker fit?

You may expect containers to come at the **end**, in Lab 7B. In fact you are inside one from the first minute.

There are two different jobs for containers:

| | **Dev container** (from step 0) | **Production image** (step 9, Lab 7B) |
|---|---|---|
| Defined in | `.devcontainer/devcontainer.json` | `api/Dockerfile`, `app/Dockerfile`, `docker-compose.yml` |
| Contains | Tools to **build** the app: Node, Python, Docker, editor extensions | Only what is needed to **run** the finished app |
| Who uses it | Developers (you, today) | The server that hosts the twin |
| Written | Before the first line of code | Once you know what you are shipping |

This is the usual order in a real team: agree on the development environment first, so everyone's machine is the same, then write the app, then package it for production. You can't write a good production image before you know what the app needs.

---

## Step 0 · An empty SvelteKit app → `step-0`

**Goal:** a web app running in your browser, served from inside the dev container.

**What was done** (you don't need to repeat it, it's already in the repo):

```bash
npx sv create app --template minimal --no-types --no-add-ons --install npm
```

This created `app/` with the smallest possible SvelteKit project.

**Try it**

```bash
cd app
npm run dev
```

Open port **5173** (Codespaces offers it in a pop-up, or use the **Ports** tab). You see *Welcome to SvelteKit*.

**Look around**

| File | What it is |
|---|---|
| `app/src/routes/+page.svelte` | The home page. Every folder in `routes/` is a URL |
| `app/src/routes/+layout.svelte` | The frame around every page |
| `app/package.json` | The app's dependencies and scripts (`dev`, `build`) |
| `.devcontainer/devcontainer.json` | The machine you are working on |

**Try:** change the text in `+page.svelte` and save. The browser updates by itself. That is the dev server's *hot reload*.

**Questions**
- `devcontainer.json` asks for Node 26, Python 3.15 and Docker. Why does the whole class get exactly the same versions?
- Which file would you change to give the app a different title in the browser tab?

---

## Step 1 · Fetch the live sensor feed → `step-1`

**Goal:** the app asks a sensor service for the latest water levels and shows them in a table.

### The pieces

```
 data/          ──▶  api/  (Python, port 8000)  ──▶  app/  (SvelteKit, port 5173)  ──▶  your browser
 30 days of          replays the data as if           asks the API, shows
 real readings       it were live                     a table
```

- **`data/`**: 30 days of real readings from 33 water-level sensors in Tambaram, unfiltered. Read `data/README.md`.
- **`api/main.py`**: a small web service (FastAPI). It pretends the recorded data is live: it starts at the 4 November rain event and plays **one hour of data per real minute**.
- **`app/`**: the web app. The browser asks the app for `/api/…`, and the app's dev server forwards it to the API (`app/vite.config.js`). The browser only ever talks to one address.

### Run it (two terminals)

Terminal 1, the sensor API:

```bash
python api/main.py
```

Terminal 2, the web app (click **+** in the terminal panel for a second terminal):

```bash
cd app
npm run dev
```

Open port **5173**. You see a table with one row per sensor. Press **Refresh** a few times: the sensor time moves on.

### Explore the API

Open port **8000** and add `/docs` to the address. FastAPI shows every endpoint, and you can try each one with **Try it out**:

| Endpoint | Returns |
|---|---|
| `/sites` | Where each sensor is, and its type |
| `/live` | The latest reading of every sensor *now* |
| `/history/TBM-16?from=…&to=…` | All readings of one sensor in a time window |
| `/health` | Is the service up, and where is the replay |

### Look at the code

| File | What to look for |
|---|---|
| `app/src/routes/+page.svelte` | `load()` fetches `/api/sites` and `/api/live`; `$state` makes the table update when the data arrives |
| `app/vite.config.js` | The `proxy` block that forwards `/api` to port 8000 |
| `api/main.py` | `data_now()`: how a recording becomes "live" |

### Questions

- Look at the **Depth** and **Age** columns. Which sensors would you trust right now? Which ones are clearly wrong, and how can you tell?
- TBM-01 shows −7.49 m measured days ago. Should the app show that number at all?
- Times in the API are in UTC seconds; the table shows IST. Why store UTC and convert only for display?
- Stop the API (Ctrl+C in terminal 1) and press **Refresh**. What does the app say? Start it again.

---

## Step 2 · MapLibre GL: sensors on a map → `step-2`

**Goal:** the same 33 sensors, now as dots on a 2D web map. Click a dot to see its latest reading.

### What was done

```bash
cd app
npm install maplibre-gl
```

| File | What changed |
|---|---|
| `app/src/lib/sensors.js` | **New.** `toGeoJSON()` turns sites + readings into GeoJSON. The time helpers moved here from the page |
| `app/src/lib/MapLibreMap.svelte` | **New.** The map component: basemap, a source, two layers, a popup |
| `app/src/routes/+page.svelte` | Builds the GeoJSON with `$derived` and puts `<MapLibreMap {geojson} />` above the table |
| `app/src/routes/+page.js` | **New.** `ssr = false`: this page is rendered only in the browser |
| `app/vite.config.js` | `optimizeDeps.exclude`: keeps MapLibre's web worker working in the dev server |

### Run it

Same two terminals as step 1. Open port **5173**: the map is above the table. Zoom in until the sensor ids appear, and click a dot.

### Three ideas to take away

**1 · GeoJSON is the common language.** The API gives us its own JSON. We turn it into GeoJSON once (`toGeoJSON`), and from then on any web map can draw it: MapLibre here, and CesiumJS or deck.gl in the optional extras at the end. Note the order: GeoJSON is **[lon, lat]**, not [lat, lon]. Swap them and Tambaram ends up in the Southern Ocean.

**2 · Source + layer.** MapLibre separates *what* from *how*:

```js
m.addSource('sensors', { type: 'geojson', data: geojson });       // what: the data
m.addLayer({ id: 'sensor-dots', type: 'circle', source: 'sensors', // how: draw it as circles
             paint: { 'circle-radius': 7, 'circle-color': '#1f6fb2' } });
```

One source can feed several layers: here a `circle` layer for the dots and a `symbol` layer for the labels. When new data arrives, we only call `setData()` on the source; every layer redraws by itself.

**3 · The basemap is someone else's server.** The grey streets come from OpenFreeMap, a free vector tile service built on OpenStreetMap. No API key, but your map now depends on it. Open your browser's developer tools (**Network** tab) and pan the map: every request to `tiles.openfreemap.org` is a piece of the basemap. In a real twin you decide whether you can live with that, or host the tiles yourself.

### Why `ssr = false`?

SvelteKit normally renders a page once on the server, then again in the browser. A web map needs things only a browser has: a canvas, WebGL, the window size. `export const ssr = false` in `+page.js` says: skip the server, render this page in the browser only.

### Try

- In `MapLibreMap.svelte`, change `circle-color` and `circle-radius`. Save and watch the map update.
- Change the style URL from `positron` to `liberty` or `bright`.
- Change `minzoom: 13` on the label layer. What happens at 10? At 16?
- Make the radius depend on the data: `'circle-radius': ['interpolate', ['linear'], ['get', 'depth_m'], 0, 5, 0.5, 15]`. What happens to the sensors with negative depths? (Step 3 deals with that properly.)

### Questions

- Every dot is the same colour. Looking only at the map, can you tell where it is flooding? What would you need?
- TBM-01 still shows −7.49 m from 12 days ago, as a dot that looks exactly like a fresh one. Is that a problem? How would you show it?
- TBM-16 and TBM-17 have exactly the same coordinates, so one dot hides the other. Which one do you see when you click? How should a map show two sensors in one place?

---

## Step 3 · Threshold colours, alert banner, hysteresis → `step-3`

**Goal:** turn numbers into decisions. Each sensor gets a level (dry, watch, warning, danger), the map and table are coloured by it, and a banner lists the sensors that need attention. Readings we can't trust are shown as such, not as water.

### What changed

| File | What changed |
|---|---|
| `app/src/lib/sensors.js` | **The rules.** `THRESHOLDS`, `HYSTERESIS_M`, `STALE_AFTER_S`, `SUSPECT_BELOW_M`, the `LEVELS` colours, and the functions `waterLevel()` and `classify()` |
| `app/src/routes/+page.svelte` | Keeps each sensor's level between refreshes, the alert banner, a legend, and **Level** and **Changes** columns |
| `app/src/lib/MapLibreMap.svelte` | Dots take their colour from the data; the most severe are drawn on top |

### Run it

Same two terminals. To land in the middle of the 4 November event straight away, start the API like this:

```bash
REPLAY_START=2026-11-04T15:00 python api/main.py
```

Press **Refresh** every few seconds (one real minute is one hour of data) and watch the banner, the colours and the **Changes** column.

### The rules, in order

`classify()` asks two questions, in this order:

1. **Can we trust this reading?** No reading for 30 minutes → *No recent data* (grey). Depth below −0.10 m, or more than the sensor's mounting height → *Suspect* (purple).
2. **Only then: how deep is it?** 0.15 m → *Watch*, 0.30 m → *Warning*, 0.50 m → *Danger*.

The order matters. Without step 1, TBM-01's −7.49 m from a week ago would simply count as "dry", and the map would look reassuring for a place we know nothing about.

The thresholds are teaching values (kerb height, cars stalling, unsafe to walk). In a real twin they come from the city's emergency plan, and may differ per site: 0.30 m in an underpass is not the same as 0.30 m on a main road.

### Hysteresis

A level that hovers around a threshold makes a nervous map. Try this in the `app/` folder:

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

Without hysteresis the sensor jumps between *watch* and *warning* four times in seven readings; every jump could be an SMS to someone. With it, a sensor **enters** warning at 0.30 m but only **leaves** it below 0.25 m (`HYSTERESIS_M = 0.05`). To do that, `waterLevel()` needs to know the previous level. That is why the page keeps `levels` between refreshes.

### Try

- Set `HYSTERESIS_M = 0` and refresh during the event. Watch the **Changes** column.
- Set `STALE_AFTER_S` to 5 minutes. How many sensors go grey? Some sensors report every minute, others every 5 minutes.
- Give underpasses a lower warning threshold than streets. Where would that rule live?

### Questions

- TBM-33 reads above 0.5 m almost the whole month (typically about 0.75 m), also on days without rain, so it is nearly always *Danger*. Danger, or a sensor that needs recalibrating? Can the app tell the difference? Can you?
- TBM-14 is always negative, between −1 and −9 m. It is now *Suspect*. Who should be told, and how?
- The banner says how many sensors have no trustworthy data. Why put that in the banner, and not only in the table?
- Our levels are computed in the **browser**. Two people with the page open since different times can see different levels for the same sensor (hysteresis depends on history). Where should this logic live in a real system?

---

## Step 4 · Live updates and a "feed lost" indicator → `step-4`

*Coming next.*

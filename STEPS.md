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

**Goal:** the app asks for new readings by itself, and says loudly when it can't get them. A twin that shows yesterday's map as if it were today's is worse than no twin.

### What changed

Only `app/src/routes/+page.svelte`:

| Piece | What it does |
|---|---|
| `POLL_MS`, `tick()` | Ask `/api/live` every 10 s. *Pause*/*Resume* and *Update now* replace the Refresh button |
| `getJSON()` | Every request gives up after 5 s (`AbortSignal.timeout`). A server that hangs counts as a failure too |
| `lastOk`, `lastError`, `feed` | The state of the feed: **connecting**, **live**, **delayed** (a request failed, but less than 30 s ago), **lost** (nothing good for 30 s) |
| Feed lost banner | Dark banner, greyed-out map, "Last known" in front of the warnings |

### Run it

Same two terminals. The dot next to the title should be green: **Live**. Leave the page alone and watch the sensor time move on.

**Now break it.** Press Ctrl+C in the API terminal and watch the page for 30 seconds:

1. After the next poll: orange, **Delayed**.
2. After 30 s: red, **Feed lost**. The map goes grey, and the warnings say *Last known*.
3. Start the API again (`python api/main.py`). Within 10 s it is green again, without reloading the page.

### Three ideas to take away

**1 · Polling: `setTimeout`, not `setInterval`.** `tick()` waits for the answer before it schedules the next request. With `setInterval`, a slow server gets a new request every 10 s whether it answered the last one or not, and they pile up exactly when the server is already struggling (during a flood, when everyone opens the map).

**2 · "No news" is not "good news".** When the feed is lost, the page never says *No flood warnings*. It says *Flood warnings unknown*. Look for that `{:else if feed === 'lost'}` in the banner. A false all-clear is the most dangerous thing a flood map can show.

**3 · Keep the last good data, but label it.** On a failure we don't clear the map; we keep the last readings and say how old they are. People can still use them, as long as they know they're old.

### Two kinds of "old"

Step 3 already has *No recent data* for a single sensor that stopped reporting. Step 4 is about the whole **feed**: the connection between your browser and the API. They are different failures with different fixes. A dead sensor needs a technician in Tambaram; a lost feed needs someone to look at the server.

### Try

- Change `FEED_LOST_AFTER_MS` to 5 s. Is the page now more honest, or just more nervous?
- Make the page stop polling when the browser tab is hidden (`document.visibilityState`). Why would 40 open laptops in a classroom care?
- Set `POLL_MS` to 1 s and open the **Network** tab in the developer tools. Now picture 10,000 residents during a cyclone. (Lab 7B comes back to this.)

### Questions

- Stop the API and start it again. The sensor time jumps **back** (the replay restarts). The app accepts the older data without a word. In a real feed, when can older data arrive, and what should the app do?
- The API can be up while the sensors behind it are not: every answer arrives on time, but the readings stop changing. Does our *Live* dot catch that? How would you detect it?
- The status says "/api/live answered 502". Is that a good message for a duty officer at 3 a.m.? What would you write instead?

---

## Step 5 · Pages, one shared feed, switchable layers → `step-5`

**Goal:** turn the demo into an app. The map gets its own page, the sensor table gets a page of its own, and the sensors become one **information layer** among others to come, switched on and off in a layer panel.

### The new shape

```
                      +layout.svelte   header, navigation, feed status, banners
                      │  starts the feed once ──▶ feed.svelte.js  (polls /api/live every 10 s)
                      │
          ┌───────────┴──────────────┐
      /maplibre                   /sensors
      MapLibreMap                 the table
      inside MapPage: map + LayerPanel ──▶ layers.svelte.js
```

| File | What it is |
|---|---|
| `app/src/lib/feed.svelte.js` | **New.** The sensor feed: data, levels, polling, feed status. Moved out of the page |
| `app/src/lib/layers.svelte.js` | **New.** The list of information layers and whether each is on |
| `app/src/lib/LayerPanel.svelte` | **New.** The *Layers* box with a checkbox per layer, and the legend |
| `app/src/lib/MapPage.svelte` | **New.** The frame of every map page: the map, the layer panel, grey when the feed is lost |
| `app/src/routes/+layout.svelte` | Header with navigation and feed status, the banners, and `feed.start()` |
| `app/src/routes/maplibre/+page.svelte` | **New.** The map page: a few lines |
| `app/src/routes/sensors/+page.svelte` | **New.** The sensor table |
| `app/src/routes/+page.js` | The home address now sends you to `/maplibre` |
| `app/src/routes/+layout.js` | `ssr = false` for the whole app (was one page) |
| `app/src/lib/MapLibreMap.svelte` | Takes a `layers` prop and hides the sensors when they are switched off. Now fills its page |

### Run it

Same two terminals. Open port **5173**: you land on **MapLibre GL**. Switch pages with the navigation bar. Untick **Water-level sensors** in the *Layers* box, open **Sensor data**, and come back: the sensors are still off. The choice lives in `layers.svelte.js`, not in the page.

### Three ideas to take away

**1 · State that outlives a page belongs in a store.** In step 4 the page did the polling. With several pages, that would mean four pollers, or a feed that restarts (and forgets its hysteresis history, step 3) every time you change page. `feed.svelte.js` holds **one** feed. The layout starts it, and because the layout stays mounted while you move between pages, it keeps running. Every page imports the same `feed` object. Check: open **Sensor data**, then a map, then back: the *Changes* column has kept counting.

**2 · `.svelte.js` files.** `$state` and `$derived` also work outside components, in files whose name ends in `.svelte.js`. In `feed.svelte.js` they sit on a class: `feed.status` and `feed.geojson` recompute by themselves when the data changes, on every page that uses them.

**3 · A layer is data + "how to draw it" + "is it on?".** `layers.svelte.js` only says *which* layers exist and whether they are on. The map component decides how to draw and hide it: in MapLibre, `setLayoutProperty(id, 'visibility', 'none')` on each style layer. Another map engine would do the same job in its own way (see the extras at the end).

### Adding a layer

The next information layers for a flood twin could be rain gauges, drains, flood-prone areas or a flood-depth map. For each one:

1. Add it to `layers.svelte.js`: `drains: { label: 'Storm-water drains', visible: false }`.
2. Get its data (an API endpoint, or a GeoJSON file in `app/static/`).
3. In the map component: draw it, and follow `layers.drains.visible`.

The layer panel picks it up by itself.

### Try

- Add a layer entry with no data behind it yet. What does the panel show? What do the maps do?
- Open the browser's developer tools on the **Network** tab and move between pages. How many `/api/live` requests do you see every 10 s?
- Reload the browser on `/sensors`. Which settings survive a reload, and which don't? Why?

### Questions

- The map page is only a few lines long. What would it take to add a second map engine (for example CesiumJS, or OpenLayers)? The extras at the end do exactly that.
- The layer choices are lost when you reload. Should they be kept: in the URL, in the browser, or on the server? What does each choice mean for sharing a link with a colleague?
- The feed is still computed in each browser (levels, hysteresis). Now that the app has pages and layers, is it time to move that to the server? What would change in Lab 7B?

---

## Step 6 · Sensor details: a day and a month in the popup → `step-6`

**Goal:** click a sensor on the MapLibre map and get its story, not only its latest number: **Now**, the last **Day** and the last **Month**, as tabs in the popup.

### What changed

| File | What changed |
|---|---|
| `api/main.py` | **New endpoint** `/history/{site}/hourly`: one summary per hour (min, mean, max, count), up to 31 days |
| `app/src/lib/SensorChart.svelte` | **New.** A small time-series chart in plain SVG, with the step 3 thresholds as dashed lines |
| `app/src/lib/SensorDetail.svelte` | **New.** The popup content: three tabs, loads the history when a tab is first opened |
| `app/src/lib/MapLibreMap.svelte` | The popup now holds a Svelte component instead of a fixed piece of HTML |

Restart the API after pulling this step: it has a new endpoint.

### Run it

Same two terminals. On the **MapLibre GL** page, click a sensor. Switch between **Now**, **Day** and **Month**. Leave the popup open on **Now**: the value keeps updating with the feed.

Try TBM-15 (a real event), TBM-22 (high all month: flood or offset?), TBM-14 (always negative: the chart says so).

### Three ideas to take away

**1 · Don't send what you can't show.** A month of one-minute readings is about 43,000 points per sensor. A 300-pixel-wide chart can't show them, and the phone of a field engineer shouldn't download them. So the **server** summarises: one row per hour with the lowest, mean and highest reading. The Day view uses the raw readings (`/history`, ~1,400 points); the Month view uses the summary (`/history/…/hourly`, ~720 rows). Choosing the right resolution per view is a design decision, not a detail.

**2 · Summaries can hide things.** The hourly *mean* of a sensor that jumps between 0.5 m and −0.3 m looks calm. That's why the Month chart also draws each hour's **range** as a bar. Which number would you put in a report: the mean or the max?

**3 · A map popup can hold a whole component.** MapLibre only knows HTML elements. `mount(SensorDetail, { target, props: { id } })` puts a live Svelte component into an empty `<div>`, and `unmount()` removes it when the popup closes. Because the component reads the shared `feed`, the **Now** tab stays live.

### Load on demand, again

The history is fetched only when you open the **Day** or **Month** tab, and only once per popup. Open the **Network** tab in the developer tools and watch when the requests go out. Don't download what nobody looks at: the flood layers in the next step follow the same rule.

### Try

- Add a **Week** tab. Which endpoint would you use, raw or hourly?
- In `SensorChart.svelte`, change `gap_s`. What happens to the gaps in TBM-03's line?
- Draw the hourly **max** instead of the mean as the line.

### Questions

- The chart cuts off readings below −0.5 m and says so underneath. Is it better to cut them off, show them, or hide them?
- The summaries are computed on every request. With 10,000 users clicking sensors during a cyclone, what would you change? (Lab 7B.)
- The Day view starts 24 hours before the replay's "now". After an API restart (step 4), what happens to a popup that is already open?

---

## Step 7 · A flood scenario: one raster, one vector → `step-7`

*Coming next.*

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

*Coming next.*

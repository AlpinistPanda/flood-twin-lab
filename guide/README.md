# Build the flood twin yourself

In the lab you **run and change** a finished flood twin. This guide is for when you want to **build it yourself**, from an empty folder to the whole twin running in containers, in ten steps.

You build the **web app**. The **sensor API** (the service that delivers the water levels) is given: in a real project it belongs to someone else, such as the city or a sensor company, and you connect to it. [The sensor API](api.md) describes what it offers and how to connect to it.

Every step ends where one of the repository's git tags (`step-0` … `step-9`) ends. Try each step on your own first. If you get stuck, compare your code with that tag, or take it over and carry on from there. See [*If you get stuck*](#if-you-get-stuck) below.

## The steps

| Step | You build | You learn | Time |
|---|---|---|---|
| [0 · An empty SvelteKit app](00-sveltekit.md) | A new web app, running in your browser | Creating a SvelteKit project, its files, the dev server | 20 min |
| [1 · The live feed as a table](01-feed-table.md) | A page that asks the API for the latest readings | Svelte 5 basics: `$state`, `{#each}`, `fetch`; the dev-server proxy | 45 min |
| [2 · Sensors on a map](02-maplibre.md) | A MapLibre GL map with a dot per sensor | GeoJSON, sources and layers, popups, components | 60 min |
| [3 · Thresholds and alerts](03-thresholds.md) | Coloured levels, an alert banner, hysteresis | Turning numbers into decisions; `$derived` | 60 min |
| [4 · Live updates](04-live.md) | Automatic polling and a *Feed lost* warning | Timers, timeouts, a small state machine | 45 min |
| [5 · Pages and layers](05-pages-layers.md) | A map page, a table page, a layer panel | Routing, layouts, shared state in `.svelte.js` files | 90 min |
| [6 · Charts in the popup](06-charts.md) | A Day and a Month chart for every sensor | Drawing charts in SVG; loading data on demand | 75 min |
| [7 · A flood model: raster and vector](07-flood-layers.md) | A flood-depth raster and exposed buildings | Cloud-Optimized GeoTIFFs, colour functions, layer order | 75 min |
| [8 · The flood over time](08-flood-time.md) | A time slider for 119 hourly flood maps | Multi-band rasters, exclusive layer groups | 75 min |
| [9 · Containers](09-containers.md) | Dockerfiles and a Compose file for the whole twin | Production builds, nginx, Docker Compose, a load test | 75 min |

About **ten hours** in total if everything goes well. Spread it over a few evenings: each step ends with something that works.

The explanations of *why* (design choices, things to try, questions to discuss) are in [STEPS.md](../STEPS.md). This guide is about *how*: what to type, in which file, in which order.

## Before you start

**What you should know:** a little HTML and JavaScript (variables, functions, arrays, objects). You don't need to know Svelte or MapLibre: the guide explains what you need when you need it.

**Where you work:** in a **GitHub Codespace** (nothing to install), or on your own laptop.

### A · In a GitHub Codespace (recommended)

1. Open the repository on GitHub: **https://github.com/AlpinistPanda/flood-twin-lab**
2. Switch the branch from `main` to **`start`** (the branch menu above the file list).
3. **Code → Codespaces → Create codespace on start.**

The `start` branch has everything **except the web app**: the sensor data, the sensor API, the load test, and this guide. The `app/` folder doesn't exist yet: you create it in step 0.

A free GitHub account includes 120 core hours of Codespaces a month: about 60 hours on the smallest (2-core) machine. Stop the Codespace when you take a break (*github.com/codespaces → ⋯ → Stop codespace*); it also stops by itself after 30 minutes of inactivity. Your files are kept.

### B · On your own laptop

You need **Git**, **conda** ([Miniforge](https://conda-forge.org/download/)) and, for step 9, **Docker Desktop**. Then:

```bash
git clone --branch start https://github.com/AlpinistPanda/flood-twin-lab.git
cd flood-twin-lab
conda env create -f environment.yml
conda activate flood-twin
```

The `flood-twin` environment has Python 3.15 (for the API) and Node.js 26 (for the web app). Run `conda activate flood-twin` in every new terminal.

### Save your work after every step

Git is your safety net. At the end of every step, in the repository folder:

```bash
git add -A
git commit -m "My step 2: sensors on a map"
```

In a Codespace you can't push to the course repository. If you want to keep your work on GitHub, the Codespace offers to create a **fork** (your own copy) the first time you push.

## Two terminals

From step 1 on, the twin runs in two terminals side by side:

| Terminal | Folder | Runs | Port |
|---|---|---|---|
| 1 · the sensor API | the repository folder | `python api/main.py` | 8000 |
| 2 · the web app | `app/` | `npm run dev` | 5173 |

In a Codespace, click **+** in the terminal panel for a second terminal. Open a port with the pop-up, or from the **Ports** tab (right-click → *Open in Browser*). On a laptop, open `http://localhost:5173`.

## If you get stuck

Each step has a **Stuck?** section at the end. There are three ways out, from small to large. All commands run in the **repository folder** (not in `app/`).

**1 · Look at the reference.** Each step shows the reference files at the end, folded. Or print one in the terminal:

```bash
git show step-3:app/src/lib/sensors.js
```

**2 · Compare your code with the reference.** Lines with `-` are in the reference, lines with `+` are yours:

```bash
git diff step-3 -- app/src
```

**3 · Take over the reference and carry on.** This replaces your `app/` with the reference version of that step. Commit your own attempt first if you want to keep it.

```bash
git add -A && git commit -m "My attempt at step 3"   # optional: keep your attempt
rm -rf app/src                                       # remove your source files
git checkout step-3 -- app                           # take the reference app of step 3
cd app && npm install && cd ..                       # install its packages
```

You can also take over a single file: `git checkout step-3 -- app/src/lib/sensors.js`.

The reference code has comments that start with *Step 3:* and so on. They are there to explain, not something you have to copy.

## The versions we use

The guide was tested with these versions. Newer versions usually work, but not always the same way; if something behaves differently from the guide, install the exact version.

| What | Version |
|---|---|
| Node.js / npm | 26 / 12 |
| Python | 3.15 |
| `sv` (creates the SvelteKit project) | 1.3.0 |
| SvelteKit / Svelte / Vite | 3.2 / 5.57 / 8.3 |
| MapLibre GL JS | 6.18.0 |
| `@geomatico/maplibre-cog-protocol` | 0.10.0 |
| `@sveltejs/adapter-static` | 4.0.1 |

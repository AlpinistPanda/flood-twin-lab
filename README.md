# Flood twin lab: from a sensor feed to a web map, then into containers

Hands-on material for **Day 7 of the ABCD Centre Winter School 2026** (IIT Madras), *The Tech Stack — Part I*.
Session lead: Dr. ir. Özgün Balaban (TU Eindhoven, Resilient Hydro Twin project).

We build one small web app in **steps**. Each step is a git **tag**, so you can always jump to a working version:

```bash
git checkout step-2      # jump to the end of step 2
```

| Tag | Step | Lab |
|---|---|---|
| `step-0` | An empty SvelteKit app, running inside a dev container | 7A |
| `step-1` | Fetch the live sensor feed and show it as a table | 7A |
| `step-2` | MapLibre GL: sensors on a 2D web map | 7A |
| `step-3` | Threshold colours, alert banner, hysteresis | 7A |
| `step-4` | Live updates and a "feed lost" indicator | 7A |
| `step-5` | Pages, one shared feed, layers you switch on and off | 7A |
| `step-6` | Sensor details: the latest value, the last day and the last month as charts in the popup | 7A |
| `step-7` | A flood scenario as a raster layer, exposed buildings as a vector layer | 7A |
| `step-8` | The flood over time: a multi-temporal raster with a time slider | 7A |
| `step-9` | The whole twin in containers: Dockerfiles, Docker Compose, an optional load test | 7B |

**Optional extras**, each one more map engine on top of `step-9`:

| Tag | Adds |
|---|---|
| `extra-cesium` | A CesiumJS page: the sensors as columns on a 3D globe |
| `extra-deck` | A deck.gl page: 3D columns as GPU layers on a tilted MapLibre map |

**In the lab:** follow the brief for your session:

- **[LAB-7A.md](LAB-7A.md)** (75 min: 14:45–15:30 and 16:00–16:30 IST): live sensors, alerts and a flood model on a web map, then the same twin in 3D
- **[LAB-7B.md](LAB-7B.md)** (30 min: 17:05–17:35 IST): the whole twin in containers, then stress it

The full step-by-step walkthrough is in **[STEPS.md](STEPS.md)**.

## Start

**A · GitHub Codespaces (recommended, nothing to install).** *Code → Codespaces → Create codespace on main*. When the terminal shows a prompt, start the sensor API:

```bash
python api/main.py
```

Then, in a second terminal, the web app:

```bash
cd app
npm run dev
```

Open the forwarded port **5173**.

**B · Your own laptop, with conda.** You need [conda](https://conda-forge.org/download/) and Git (and Docker for Lab 7B). Once, from the repository folder:

```bash
conda env create -f environment.yml
```

Then, every time you work on the lab:

```bash
conda activate flood-twin
```

The `flood-twin` environment contains Python 3.15, Node.js 26 and the API's packages. Run `npm install` in `app/` once, then the same commands as in route A.

## Layout

| Path | What |
|---|---|
| `.devcontainer/` | The development environment as a container: Node, Python, Docker |
| `data/` | 30 days of real water-level readings from 33 sensors in Tambaram, Chennai, and the maximum depth of a 100-year flood scenario (see `data/README.md`) |
| `api/` | The sensor API: replays the data as if it were live (Python, FastAPI) |
| `app/` | The SvelteKit web app |
| `STEPS.md` | Step-by-step walkthrough |

## Credits & licence

Sensor data and flood scenario: for teaching use in this course. Map data and building outlines © OpenStreetMap contributors (ODbL). Lab code: MIT.

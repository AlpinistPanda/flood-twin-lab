# Lab 7A · Live sensors, alerts and a flood model on a web map

**Day 7, Wednesday 18 November 2026 · 14:45–15:25 IST (40 minutes)**
*Task 7: connecting live sensor feeds to a web viewer with active threshold alerts.*

You get a working flood twin of **Tambaram** (Chennai): 33 real water-level sensors, replayed as a live feed, on a MapLibre web map, with alerts and a 100-year flood scenario. In 40 minutes you won't build it from scratch. You **run** it, **change its rules**, **break it**, and put a **flood model next to the measurements**.

Want to see how it was built, step by step? Everything is in [STEPS.md](STEPS.md), one git tag per step. That is for after the lab.

---

## Before the lab: start your Codespace (during the lecture)

1. Open the repository on GitHub, then **Code → Codespaces → Create codespace on main**.
2. Wait until the terminal shows a prompt. The first start installs everything and takes a few minutes; let it run while you listen.

No GitHub account, or no Codespace? Pair up with your neighbour.

---

## 0 · Start the twin (5 min)

The twin has two parts, each in its own terminal.

**Terminal 1, the sensor API.** It replays 30 days of real readings as if they were live: **one hour of data per real minute**. Start it at the evening of the 4 November rain event, so there is something to see:

```bash
REPLAY_START=2026-11-04T15:00 python api/main.py
```

**Terminal 2, the web app.** Click **+** in the terminal panel for a second terminal:

```bash
cd app
npm run dev
```

A pop-up offers to open port **5173**; or use the **Ports** tab. You see the map of Tambaram with the sensors as coloured dots, and a red banner if sensors are at *Warning* or *Danger*.

**Look around (2 min):**

- Click a sensor: **Now**, **Day** and **Month** tabs.
- **Sensor data** (top bar): the same sensors as a table.
- The dot next to *Live*: green while the feed is fine.

---

## 1 · From a number to an alert (12 min)

Every reading becomes a **level**: *Dry, Watch, Warning, Danger*, or *Suspect* / *No recent data* if we can't trust it. The rules are a few lines at the top of **`app/src/lib/sensors.js`**:

| Name | Default | Meaning |
|---|---|---|
| `THRESHOLDS` | 0.15 / 0.30 / 0.50 m | Watch / Warning / Danger |
| `HYSTERESIS_M` | 0.05 m | A sensor leaves a level only 5 cm **below** its threshold |
| `STALE_AFTER_S` | 30 min | Older readings are *No recent data* |
| `SUSPECT_BELOW_M` | −0.10 m | Lower readings can't be water: *Suspect* |

Open the file in the editor. Save a change, and the browser picks it up by itself.

**Do:**

1. Lower the *Warning* threshold from `0.3` to `0.2`. How many sensors does the banner list now? Would you send an SMS to residents for 0.2 m?
2. Set `HYSTERESIS_M = 0`. Open **Sensor data** and watch the **Changes** column for two minutes. Then set it back to `0.05`. What does hysteresis protect you from?
3. Find **TBM-14** and **TBM-33** in the table, and click them on the map (Month tab). One is always negative, one is always high. Which is a broken sensor, which might be a sensor that needs recalibrating, and how would you know?

**Discuss:** who should decide these thresholds: the programmer, the city, or the residents?

---

## 2 · When the feed fails (5 min)

**Do:** in terminal 1, stop the API with **Ctrl+C**. Watch the app for 30 seconds:

- the dot turns orange (*Delayed*), then red (*Feed lost*);
- the map turns grey, and the banner says the levels may be out of date;
- with no sensors at *Warning*, it says **"Flood warnings unknown"**, not "No flood warnings".

Start the API again (press ↑ and Enter in terminal 1). Within 10 seconds the app is *Live* again.

**Discuss:** why is "Flood warnings unknown" so important? What could go wrong if the map just kept showing the last colours?

---

## 3 · A flood model next to the measurements (13 min)

The sensors say what the water **is** doing. A hydrodynamic model says what it **could** do. In the *Layers* box:

1. Tick **Buildings**: 14,188 OpenStreetMap buildings that get at least 0.15 m of water in a **100-year flood**, coloured like the sensors. Click one.
2. Under **Flood depth**, choose **Maximum depth**: the deepest water each 10 m cell reaches in that flood. Click the map anywhere: the depth there.
3. Choose **Over time**: a time bar appears at the bottom. Press ▶ (about 30 seconds for 118 hours), or drag it. Watch the wet area: when does the water arrive, and how long does it stay?

**Do:** find a sensor that sits inside the blue at the peak (*Time 59:00*). Click it, open **Month**: did that sensor ever measure anything like the model's depth?

**Discuss:**

- The model and the sensors disagree in places. Which one do you trust, and for which decision?
- *Exposure is not damage*: a building in 0.8 m of water is exposed. What would you need to know to estimate the damage?
- 99% of these buildings are tagged only "building" in OpenStreetMap. Homes, schools, hospitals look the same. What does that mean for an evacuation plan?

---

## Recap (in the room, 3 min)

Be ready to answer one of these:

1. Which rule in `sensors.js` would you change first for Tambaram, and why?
2. What is the difference between "no warnings" and "warnings unknown", and where in the app is it handled?
3. What does the flood model add that the sensors can't give you, and the other way round?

**Keep your Codespace open:** Lab 7B (after the break) continues in it.

---

## Done early? Two more map engines

The same twin, with a second map engine, as optional branches:

```bash
git stash                    # put your own changes aside
git checkout extra-cesium    # or: git checkout extra-deck
cd app && npm install        # the engine's packages
npm run dev
```

- **`extra-cesium`**: a **CesiumJS** page: the sensors, all buildings in 3D and the flood on a 3D globe.
- **`extra-deck`**: a **deck.gl** page: the same, as GPU layers on a tilted map.

Compare them with the MapLibre page. Does 3D help you decide where the pumps should go? The Resilient Hydro Twin started on CesiumJS and moved to MapLibre when its users said they didn't need 3D. Would you have decided the same?

Go back with `git checkout main` (and `npm install` in `app/`).

---

## If something doesn't work

| Problem | Try |
|---|---|
| Port 5173 doesn't open | **Ports** tab → right-click 5173 → *Open in Browser* |
| "Could not reach the sensor API" or *Feed lost* | Is terminal 1 still running `python api/main.py`? Start it again |
| No sensors at *Warning* | You started without `REPLAY_START`: the replay begins before the rain. Restart the API with the command in step 0 |
| The map is grey | That is the *Feed lost* warning (step 2): start the API |
| Nothing changes after editing `sensors.js` | Did you save? The app updates on save; the levels change at the next update (every 10 s) |
| Lost in your changes | `git stash` puts them aside; `git checkout main` gets the original back |

# Lab 7A · Live sensors, alerts and a flood model on a web map

**Day 7, Wednesday 18 November 2026 · 75 minutes in two parts**
**Part 1:** 14:45–15:30 IST, before the tea break · **Part 2:** 16:00–16:30 IST, after it
*Task 7: connecting live sensor feeds to a web viewer with active threshold alerts.*

You get a working flood twin of **Tambaram** (Chennai): 33 real water-level sensors, replayed as a live feed, on a MapLibre web map, with alerts and a 100-year flood scenario. You won't build it from scratch. In **part 1** you **run** it, **change its rules**, **break it**, and put a **flood model next to the measurements**. In **part 2** you see the same twin in **3D**, and look at **how it was built**.

Want to see how it was built, step by step? Everything is in [STEPS.md](STEPS.md), one git tag per step. That is for after the lab.

---

## Before the lab: start your Codespace (during the lecture)

1. Open the repository on GitHub, then **Code → Codespaces → Create codespace on main**.
2. Wait until the terminal shows a prompt. The first start installs everything and takes a few minutes; let it run while you listen.

No GitHub account, or no Codespace? Pair up with your neighbour.

---

# Part 1 · 14:45–15:30

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
- the map turns grey, and a dark banner says the levels may be out of date;
- the red alert banner now starts with **"Last known:"**. If no sensor was at *Warning*, it says **"Flood warnings unknown"**, never "No flood warnings".

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

## Recap of part 1 (in the room, 5 min)

Be ready to answer one of these:

1. Which rule in `sensors.js` would you change first for Tambaram, and why?
2. What is the difference between "no warnings" and "warnings unknown", and where in the app is it handled?
3. What does the flood model add that the sensors can't give you, and the other way round?

**Leave your Codespace as it is** and enjoy your tea. Part 2 continues in it.

---

# Part 2 · 16:00–16:30

## 4 · Back after tea (2 min)

A Codespace stops by itself after 30 minutes without activity, so yours may have stopped during the break. Your files are safe.

- If the editor says the Codespace has stopped, click **Restart codespace** (or open it again from **github.com/codespaces**). It takes about half a minute.
- Start the two terminals again, as in step 0.

---

## 5 · The same twin in 3D (15 min)

The repository has two more map engines, each as an extra page on the same twin. **Half the room takes CesiumJS, the other half deck.gl**, so you can compare in the recap.

In **terminal 2**, stop the web app (**Ctrl+C**), then:

```bash
git stash                      # put your own changes aside
git checkout extra-cesium      # or: git checkout extra-deck
npm install                    # the engine's packages (you are still in app/)
npm run dev
```

The API in terminal 1 keeps running. Open port **5173** again: there is a new page in the top bar.

- **`extra-cesium`**: a **CesiumJS** globe. Right-drag (or Ctrl+drag) to tilt, scroll to zoom in on a neighbourhood.
- **`extra-deck`**: **deck.gl** on a tilted MapLibre map. Ctrl+drag to tilt and turn.

**Do:** switch on **Buildings** (now *all* 78,045, grey if not exposed) and, under *Flood depth*, **Over time**. Press ▶ in the time bar and watch the water rise between the buildings.

**Discuss:**

- What does 3D show you that the 2D map didn't? What does it hide (look at the streets behind tall columns)?
- Every building is 6 m tall, because OpenStreetMap almost never records heights here. Does the 3D view look *true*, or just *real*?
- The Resilient Hydro Twin started on CesiumJS and moved to MapLibre when its users said they didn't need 3D. For *"where should the pumps go in the next hour?"*, which page would you open?

---

## 6 · How was it built? (8 min)

Everything you used today was built in small steps, one git tag per step. In terminal 2, still in the `app/` folder (stop the app with Ctrl+C first, or open a third terminal and `cd app`):

```bash
git tag                                        # step-0 … step-9, extra-cesium, extra-deck
git diff step-9 extra-deck --stat -- src       # the code the deck.gl extra added
git diff step-4 step-5 --stat -- src          # when the app got pages and the Layers box
```

**Do:** pick one step from the list in [STEPS.md](STEPS.md) that interests you (for example *step 3: the alert rules*, or *step 8: the flood over time*) and read its section. Find the file it talks about in the editor.

**Discuss:** the deck.gl extra adds a whole map engine in 7 files and about 250 lines of code. What made that possible? (Hint: step 2's *GeoJSON is the common language*, and step 5's *one shared feed*.)

---

## Recap of part 2 (3 min)

Cesium people, deck.gl people: one sentence each. Would you put your engine into a flood twin for Tambaram? For whom?

**Lab 7B** comes after the next lecture, in the same Codespace.

---

## If something doesn't work

| Problem | Try |
|---|---|
| Port 5173 doesn't open | **Ports** tab → right-click 5173 → *Open in Browser* |
| "Could not reach the sensor API" or *Feed lost* | Is terminal 1 still running `python api/main.py`? Start it again |
| No sensors at *Warning* | You started without `REPLAY_START`: the replay begins before the rain. Restart the API with the command in step 0 |
| The map is grey | That is the *Feed lost* warning (step 2): start the API |
| Nothing changes after editing `sensors.js` | Did you save? The app updates on save; the levels change at the next update (every 10 s) |
| The Codespace has stopped (after the break) | **Restart codespace**, or open it from github.com/codespaces; then start both terminals again |
| `npm install` on an extra is slow | It downloads the engine (Cesium is large): give it a minute |
| Lost in your changes | `git stash` puts them aside; `git checkout main` gets the original back |

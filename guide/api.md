# The sensor API

[← Guide overview](README.md)

The web app you build doesn't read sensor files. It asks a **web service** (an API) for the water levels, the way a real twin asks a city's sensor platform. This page describes that service: what it offers, and how your app connects to it.

You don't build the API in this guide. In a real project it belongs to someone else, such as the city, a sensor company or another team, and you get a description like this one. The repository has a working version in `api/main.py` that **replays** 30 days of real readings from 33 sensors in Tambaram as if they were live.

## Start it

In terminal 1, in the repository folder:

```bash
python api/main.py
```

It listens on port **8000**. Open that port and add **`/docs`** to the address: FastAPI shows every endpoint, and you can try each one with **Try it out**. Keep the API running while you work on the app.

### Settings

You set these as environment variables in front of the command, for example `REPLAY_START=2026-11-04T15:00 python api/main.py`.

| Variable | Default | Meaning |
|---|---|---|
| `REPLAY_START` | `2026-11-04T03:00` | Where in the data the replay begins (UTC). `2026-11-04T15:00` starts in the middle of the 4 November rain event |
| `REPLAY_SPEED` | `60` | Seconds of data per real second. 60 means one hour of data per real minute |
| `PORT` | `8000` | The port to listen on |

At the end of the data, the replay starts again at `REPLAY_START`. When you restart the API, the replay starts again too.

## The rules

- Every answer is **JSON**. Only `GET` requests.
- **Times** are Unix time in **seconds, UTC** (not milliseconds, as JavaScript's `Date.now()` uses). Convert to Indian time (IST, UTC+5:30) only when you show a time.
- **Depths** are metres of water above the street at the sensor. The data is real and **unfiltered**: negative depths, spikes, gaps and dead sensors are all in there. Read [`data/README.md`](../data/README.md).
- Errors come back with a status code and a message: `404 {"detail": "Unknown site XX"}`, or `400` for a time window that is too long.

## Endpoints

### `GET /sites`: where the sensors are

Ask once, when the app starts: sites don't change.

```json
{
  "area": "Tambaram, Chennai",
  "time_unit": "unix seconds, UTC",
  "depth_unit": "m",
  "sites": [
    {
      "id": "TBM-01",
      "type": "street",
      "lat": 12.9861,
      "lon": 80.1242,
      "sensor_height_m": 2.5,
      "installed": "2026-09-24",
      "readings": 7039,
      "first": 1791907555,
      "last": 1793182596
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | `TBM-01` … `TBM-33` |
| `type` | `street`, `underpass` or `drain` |
| `lat`, `lon` | Location (WGS 84) |
| `sensor_height_m` | How high the sensor hangs above the street. A depth above this is impossible |
| `readings`, `first`, `last` | How many readings the site has, and the time of the first and last one |

### `GET /live`: the latest reading of every sensor, now

Ask this again and again (step 4 asks every 10 seconds).

```json
{
  "time": 1794465586,
  "readings": [
    { "site": "TBM-01", "time": 1793182596, "depth_m": -7.49, "age_s": 1282990 },
    { "site": "TBM-02", "time": 1794465329, "depth_m": 0.01, "age_s": 257 },
    { "site": "TBM-17", "time": null, "depth_m": null, "age_s": null }
  ]
}
```

| Field | Meaning |
|---|---|
| `time` | The replay's "now" |
| `readings[].time` | When this sensor last reported |
| `readings[].depth_m` | What it reported |
| `readings[].age_s` | How old that reading is, in seconds. A sensor that stopped reporting keeps its last reading, getting older and older: deciding when that is too old is up to your app |

A sensor that has never reported has `null` everywhere.

### `GET /history/{site}`: every reading of one sensor in a time window

```
/history/TBM-15                              the last 24 hours
/history/TBM-15?from=1794379191&to=1794465591
```

At most **7 days** per request. `from` defaults to 24 hours before `to`; `to` defaults to now.

```json
{
  "site": "TBM-15",
  "from": 1794379191,
  "to": 1794465591,
  "readings": [
    { "time": 1794379423, "depth_m": 0.07 },
    { "time": 1794379723, "depth_m": 0.06 }
  ]
}
```

### `GET /history/{site}/hourly`: one summary per hour

For long periods: a month of one-minute readings is about 43,000 points, far too many for a chart. This endpoint sends one row per hour.

```
/history/TBM-15/hourly                       the last 30 days
```

At most **31 days** per request. Hours without readings are left out, so gaps stay visible.

```json
{
  "site": "TBM-15",
  "from": 1791873587,
  "to": 1794465587,
  "hours": [
    { "time": 1791907200, "min": 0.01, "mean": 0.018, "max": 0.03, "n": 55 },
    { "time": 1791910800, "min": 0.02, "mean": 0.025, "max": 0.03, "n": 60 }
  ]
}
```

`time` is the start of the hour, `n` the number of readings in it.

### `GET /health`: is the service up?

```json
{
  "status": "ok",
  "replay": { "start": 1793761200, "speed": 60.0, "now": 1794465589 },
  "data": { "from": 1791907513, "to": 1794499497, "sites": 33 }
}
```

Docker uses this in step 9 to know when the API is ready.

## How your app connects to it

The browser shows your app from one address (port 5173) and the API lives at another (port 8000). In a Codespace, both get their own long web address, and you don't want to write those into your code.

So the browser **never talks to the API directly**. It asks your app's own address for `/api/live`, and the **dev server passes the request on** to the API, without the `/api`:

```
browser  ──  GET /api/live  ──▶  dev server (5173)  ──  GET /live  ──▶  sensor API (8000)
```

You set that up in step 1 (a `proxy` in `app/vite.config.js`). In production (step 9), **nginx** does the same job. Your code only ever uses relative addresses like `fetch('/api/live')`, and works the same in both.

### Using another API

To use another API with the same endpoints, for example one running on another machine, start the dev server with its address:

```bash
API_URL=http://192.168.1.20:8000 npm run dev
```

If your API has **different** endpoints or field names (say, `level_cm` instead of `depth_m`), don't spread that over your app. Convert its answers in **one place**, right where you fetch them, into the shapes above. The rest of the app stays the same. In this app, that place is `poll()` (step 4, then `feed.svelte.js` from step 5 on).

## Want to see inside?

`api/main.py` is about 170 lines of Python. The interesting part is `data_now()`: how a recording becomes "live". Not needed for the guide, but worth a look if you want to build such a replay for your own data.

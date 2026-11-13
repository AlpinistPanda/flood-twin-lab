"""Sensor API for the flood twin lab.

Serves the Tambaram water-level dataset in ../data as if it were a live sensor
network. "Live" is a replay: the API maps the real clock onto the 30 days of
recorded data, so the latest reading changes over time like a real feed.

Run:   python api/main.py                → http://localhost:8000/docs
Env:   REPLAY_START   where the replay begins (ISO date/time in UTC, default 2026-11-04T03:00 = 08:30 IST, just before the rain)
       REPLAY_SPEED   data seconds per real second (default 60: one hour of data per minute)
       PORT           default 8000
"""
from __future__ import annotations

import bisect
import csv
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

DATA = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
REPLAY_START = os.getenv("REPLAY_START", "2026-11-04T03:00")
REPLAY_SPEED = float(os.getenv("REPLAY_SPEED", "60"))


def to_epoch(text: str) -> int:
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


# ---------- Load the dataset once, at start-up ----------
META = json.loads((DATA / "sites.json").read_text())
SITES = {s["id"]: s for s in META["sites"]}
TIMES: dict[str, list[int]] = {}
DEPTHS: dict[str, list[float]] = {}
for site_id in SITES:
    with (DATA / "readings" / f"{site_id}.csv").open() as f:
        rows = list(csv.DictReader(f))
    TIMES[site_id] = [int(r["time"]) for r in rows]
    DEPTHS[site_id] = [float(r["depth_m"]) for r in rows]

DATA_START = min(t[0] for t in TIMES.values() if t)
DATA_END = max(t[-1] for t in TIMES.values() if t)
REPLAY_FROM = to_epoch(REPLAY_START)
STARTED = time.time()


def data_now() -> int:
    """The moment in the dataset that counts as 'now'. Loops back to REPLAY_START at the end."""
    elapsed = (time.time() - STARTED) * REPLAY_SPEED
    span = DATA_END - REPLAY_FROM
    return REPLAY_FROM + int(elapsed % span)


# ---------- The API ----------
app = FastAPI(
    title="Tambaram water-level sensors",
    description="Replay of 30 days of real, unfiltered sensor readings. Times are Unix seconds (UTC).",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])


@app.get("/sites")
def sites():
    """All sensor sites with their location and type."""
    return META


@app.get("/live")
def live():
    """The latest reading of every site at the current replay time.

    `age_s` is how old that reading is. A site that stopped reporting keeps its
    last reading, with a growing age: deciding when that is 'too old' is up to you.
    """
    now = data_now()
    readings = []
    for site_id, times in TIMES.items():
        i = bisect.bisect_right(times, now) - 1
        if i < 0:
            readings.append({"site": site_id, "time": None, "depth_m": None, "age_s": None})
        else:
            readings.append({"site": site_id, "time": times[i], "depth_m": DEPTHS[site_id][i],
                             "age_s": now - times[i]})
    return {"time": now, "readings": readings}


@app.get("/history/{site_id}")
def history(
    site_id: str,
    start: int | None = Query(None, alias="from", description="Unix seconds, default: 24 h before 'to'"),
    end: int | None = Query(None, alias="to", description="Unix seconds, default: the current replay time"),
):
    """All readings of one site between `from` and `to` (at most 7 days)."""
    if site_id not in SITES:
        raise HTTPException(404, f"Unknown site {site_id}")
    end = end if end is not None else data_now()
    start = start if start is not None else end - 86400
    if end < start:
        raise HTTPException(400, "'to' must be after 'from'")
    if end - start > 7 * 86400:
        raise HTTPException(400, "Ask for at most 7 days at a time")
    times = TIMES[site_id]
    i, j = bisect.bisect_left(times, start), bisect.bisect_right(times, end)
    return {
        "site": site_id,
        "from": start,
        "to": end,
        "readings": [{"time": times[k], "depth_m": DEPTHS[site_id][k]} for k in range(i, j)],
    }


@app.get("/history/{site_id}/hourly")
def history_hourly(
    site_id: str,
    start: int | None = Query(None, alias="from", description="Unix seconds, default: 30 days before 'to'"),
    end: int | None = Query(None, alias="to", description="Unix seconds, default: the current replay time"),
):
    """One summary per hour (min, mean, max, number of readings) between `from` and `to` (at most 31 days).

    For long periods: a month of one-minute readings is ~43,000 points, too many for a chart.
    Hours without readings are left out, so gaps stay visible.
    """
    if site_id not in SITES:
        raise HTTPException(404, f"Unknown site {site_id}")
    end = end if end is not None else data_now()
    start = start if start is not None else end - 30 * 86400
    if end < start:
        raise HTTPException(400, "'to' must be after 'from'")
    if end - start > 31 * 86400:
        raise HTTPException(400, "Ask for at most 31 days at a time")
    times, depths = TIMES[site_id], DEPTHS[site_id]
    i, j = bisect.bisect_left(times, start), bisect.bisect_right(times, end)
    hours: dict[int, list[float]] = {}
    for k in range(i, j):
        hours.setdefault(times[k] - times[k] % 3600, []).append(depths[k])
    return {
        "site": site_id,
        "from": start,
        "to": end,
        "hours": [
            {"time": h, "min": min(v), "mean": round(sum(v) / len(v), 3), "max": max(v), "n": len(v)}
            for h, v in sorted(hours.items())
        ],
    }


@app.get("/health")
def health():
    """Is the service up, and where is the replay?"""
    return {
        "status": "ok",
        "replay": {"start": REPLAY_FROM, "speed": REPLAY_SPEED, "now": data_now()},
        "data": {"from": DATA_START, "to": DATA_END, "sites": len(SITES)},
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))

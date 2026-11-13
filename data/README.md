# Dataset: water levels in Tambaram, Chennai

Thirty days (13 October – 12 November 2026) of readings from **33 water-level sensors** in the Tambaram area of Chennai, covering the start of the north-east monsoon. Site identifiers and locations have been anonymised. Use it for teaching within this course only.

## Files

| File | Contents |
|---|---|
| `sites.json` | One entry per sensor site |
| `readings/TBM-xx.csv` | All readings of one site: `time,depth_m` |

### `sites.json`

| Field | Meaning |
|---|---|
| `id` | Site id, `TBM-01` … `TBM-33`, numbered from north to south |
| `type` | Where the sensor is: `street`, `underpass` or `drain` |
| `lat`, `lon` | Location (WGS84), rounded to about 10 m |
| `sensor_height_m` | Height of the sensor above the ground |
| `installed` | Installation date |
| `readings`, `first`, `last` | Number of readings and the time of the first and last one |

### `readings/TBM-xx.csv`

| Column | Meaning |
|---|---|
| `time` | Unix time in **seconds, UTC**. Convert to local time (IST = UTC+5:30) only for display |
| `depth_m` | Water depth above the ground at the sensor, in metres |

## This is real, unfiltered sensor data

The readings are exactly as the sensors reported them. Nothing has been cleaned, on purpose. Expect what you will meet in any real sensor network:

- **Different reporting intervals:** most sites report every minute, some every 4–5 minutes, and some change interval during the month.
- **Gaps:** sites that stop for hours or days, and one site (`TBM-17`) with no readings at all.
- **Negative depths, small:** many sites drift a few centimetres to a few decimetres below `0` when the street is dry. One site (`TBM-14`) is below zero for the whole month. A calibration offset?
- **Negative depths, large:** sudden drops to −5 … −9 m at several sites, usually for a single reading. These cannot be real water depths.
- **Spikes:** occasional jumps of several metres upwards that vanish again.
- **Flat lines:** `TBM-26` reads `0` for the whole month. Is the street dry, or is the sensor broken?
- **Real events:** several rain events, the strongest on **4–5 November** and **6–8 November**, when many sites rise together.

Deciding what to show, what to flag and what to ignore is part of building a digital twin.

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

## Flood scenario layers (step 7)

Made from a hydrodynamic model run of a **100-year flood** for the same area. They are model results, not observations, and not calibrated against the sensors.

The model wrote the water depth at 119 moments during the event. We keep one raster: the **maximum** depth each cell reached at any moment.

| File | What | Size |
|---|---|---|
| `data/flood/max_depth_100yr_utm.tif` | **For analysis** (QGIS, Python). The maximum depth (m) on the model's own grid: WGS 84 / UTM 44N (EPSG:32644), 10 m cells, Float32. **Every value kept**, from 0.007 m up, no rounding. Empty (NaN) where the model never had water. | 2.9 MB |
| `app/static/layers/max_depth_100yr.tif` | **For the web map.** The same maximum depth, prepared for the browser: reprojected to Web Mercator (EPSG:3857), rounded to the centimetre, cells below 0.05 m empty (dry). Cloud-Optimized GeoTIFF. | 1.9 MB |
| `app/static/layers/depth_timeseries_100yr.tif` | **For the time slider (step 8).** The depth at every model output, one per hour: 119 bands, Time 0:00 to Time 118:00. Stored the way the RHT platform stores depth: **whole centimetres as 16-bit integers** (`uint16`), 65535 = no data or dry, with a scale factor of 0.01 so QGIS and GDAL show metres. Same Web Mercator grid as the max-depth file. | 16.9 MB |
| `app/static/layers/depth_timeseries_100yr.json` | Which model step each band holds, the time between steps (60 minutes), and the wet area (km², ≥ 0.05 m) per step. | 2 KB |
| `app/static/layers/buildings_exposure.geojson` | **Vector.** The 14,188 OpenStreetMap buildings with at least 0.15 m of water, out of 78,045 in the area. `depth_m` is the deepest 10 m cell the building touches; `use` is the OpenStreetMap `building` tag. | 4.1 MB |

Things to notice:

- **Exposure, not damage.** A building with 0.8 m of water is *exposed*. How much damage that causes depends on what the building is, how it is built and what is inside: that is what an impact model such as Delft-FIAT adds, with depth-damage curves.
- **We don't know what the buildings are.** 99% of the OpenStreetMap buildings here are tagged only `building=yes`. Homes, shops, schools and hospitals look the same to us.
- **Very deep cells.** A few cells reach 20–35 m. These are lakes and quarries in the terrain model, not streets.
- **Centimetres, not metres.** Stored as decimal metres (32-bit floats) the time series is about four times larger: for 30 steps we measured 24.7 MB against 6.2 MB as whole centimetres (16-bit integers). Nothing is lost: the web data was already rounded to the centimetre. *Store centimetres, compute in metres.*
- **Time 0:00 is the start of the model run**, not a clock time. Each step is one hour.
- **The thin film.** Half of the wet area has less than 5 cm of water. We leave it out (dry), which is a choice: show it, and the whole map turns blue.

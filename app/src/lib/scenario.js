// Step 7: two static layers from a flood MODEL, next to the live SENSORS.
//
//   max_depth_100yr.tif         RASTER: the maximum water depth of a 100-year flood scenario,
//                               one value per 10 m cell, as a Cloud-Optimized GeoTIFF.
//   buildings_exposure.geojson  VECTOR: OpenStreetMap buildings with at least 0.15 m of water in
//                               that scenario, and the depth at each building.
//
// Both are plain files in app/static/layers/, served by the web server like an image.
// No tile server, no database: the browser reads only the parts it needs.
//
// Step 8: a third file, the flood OVER TIME:
//
//   depth_timeseries_100yr.tif  RASTER with one band per time step (30 of them). Stored like the
//                               RHT platform does: whole centimetres as 16-bit integers, 65535 =
//                               no data. Four times smaller than decimal metres.
//   depth_timeseries_100yr.json Which model step each band is, and the wet area per step.

import * as maplibregl from 'maplibre-gl';
import { cogProtocol, setColorFunction, locationValues } from '@geomatico/maplibre-cog-protocol';
import { waterLevel, LEVELS } from '#lib/sensors.js';

export const FLOOD_URL = `${location.origin}/layers/max_depth_100yr.tif`;
export const BUILDINGS_URL = '/layers/buildings_exposure.geojson';
export const TIMESERIES_URL = `${location.origin}/layers/depth_timeseries_100yr.tif`;
const TIMESERIES_META_URL = '/layers/depth_timeseries_100yr.json';

// Depth classes for the raster, light to dark blue. [from (m), colour]
export const DEPTH_CLASSES = [
	[0.05, '#c6dbef'],
	[0.15, '#9ecae1'],
	[0.3, '#6baed6'],
	[0.5, '#3182bd'],
	[1, '#08519c'],
	[2, '#08306b']
];
const RGB = DEPTH_CLASSES.map(([from, hex]) => [from, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]);

// One depth (m) → one colour. Called for EVERY pixel of every tile, so keep it simple and fast.
function paint(depth, colour) {
	if (!(depth >= DEPTH_CLASSES[0][0])) return colour.set([0, 0, 0, 0]); // dry, or no data (NaN): transparent
	let rgb = RGB[0][1];
	for (const [from, c] of RGB) if (depth >= from) rgb = c;
	colour.set([...rgb, 210]);
}

// The max-depth file holds metres, one band.
const colourDepth = ([depth], colour) => paint(depth, colour);

// The time series holds centimetres, one band per time step. Which band to show is `shownBand`.
const NODATA_CM = 65535;
let shownBand = 0;
const colourDepthAtStep = (pixel, colour) => {
	const cm = pixel[shownBand];
	paint(cm === NODATA_CM ? NaN : cm / 100, colour); // we store centimetres, we compute in metres
};

let registered = false;
function registerOnce() {
	if (registered) return;
	maplibregl.addProtocol('cog', cogProtocol); // once per page
	setColorFunction(FLOOD_URL, colourDepth);
	setColorFunction(TIMESERIES_URL, colourDepthAtStep);
	registered = true;
}

// The raster. `cog://` tells MapLibre to hand the URL to the COG plugin, which reads the
// GeoTIFF in the browser with HTTP range requests and turns it into map tiles.
export function addFloodDepth(map, beforeId) {
	registerOnce();
	map.addSource('flood', { type: 'raster', url: `cog://${FLOOD_URL}`, tileSize: 256 });
	map.addLayer({ id: 'flood-depth', type: 'raster', source: 'flood', paint: { 'raster-opacity': 0.8 } }, beforeId);
}

// The depth in the raster at one place (a click), read from the file, not from the picture.
// Always at full resolution (zoom 16): at lower zooms the plugin reads the COG's overviews,
// coarser copies of the data stored in the file for zoomed-out views, and the value can differ.
export async function floodDepthAt(lngLat) {
	const [depth] = await locationValues(FLOOD_URL, { latitude: lngLat.lat, longitude: lngLat.lng }, 16);
	return Number.isFinite(depth) && depth >= DEPTH_CLASSES[0][0] ? depth : null;
}

// ── Step 8: the flood over time ──────────────────────────────────────────────

// Which model step each band holds, and the wet area per step. Loaded once.
let meta;
export async function timeseriesInfo() {
	meta ??= fetch(TIMESERIES_META_URL).then((r) => r.json());
	return meta;
}

// Show time step `band` (0 = the first band). The colours are made when MapLibre asks the plugin
// for a tile, so to show another step we remove the layer and its source and add them again:
// MapLibre asks for the tiles again, and the plugin colours them with the new band. The plugin
// keeps the bytes it has already downloaded, so changing the step costs no new download here.
export function addFloodTimeseries(map, band, beforeId) {
	registerOnce();
	shownBand = band;
	map.addSource('flood-time', { type: 'raster', url: `cog://${TIMESERIES_URL}`, tileSize: 256 });
	map.addLayer(
		{
			id: 'flood-time',
			type: 'raster',
			source: 'flood-time',
			paint: { 'raster-opacity': 0.8, 'raster-fade-duration': 0 }
		},
		beforeId
	);
}

export function showFloodStep(map, band, beforeId) {
	if (band === shownBand || !map.getLayer('flood-time')) return;
	const visibility = map.getLayoutProperty('flood-time', 'visibility');
	map.removeLayer('flood-time');
	map.removeSource('flood-time');
	addFloodTimeseries(map, band, beforeId);
	map.setLayoutProperty('flood-time', 'visibility', visibility ?? 'visible');
}

// The depth at one place at the shown time step, in metres (null: dry or no data).
// Unlike the colour function above, locationValues() applies the file's scale factor for us:
// it returns metres (0.84), not centimetres (84), and NaN where the file says "no data".
export async function floodDepthAtStep(lngLat) {
	const values = await locationValues(TIMESERIES_URL, { latitude: lngLat.lat, longitude: lngLat.lng }, 16);
	const depth = values[shownBand];
	return Number.isFinite(depth) && depth >= DEPTH_CLASSES[0][0] ? depth : null;
}

// The vector layer: building outlines, coloured with the SAME thresholds as the sensors (step 3).
export function addBuildings(map, beforeId) {
	map.addSource('buildings', { type: 'geojson', data: BUILDINGS_URL });
	map.addLayer(
		{
			id: 'buildings-exposed',
			type: 'fill',
			source: 'buildings',
			paint: {
				'fill-color': [
					'step', ['get', 'depth_m'],
					LEVELS.watch.colour, 0.3, LEVELS.warning.colour, 0.5, LEVELS.danger.colour
				],
				'fill-opacity': 0.85
			}
		},
		beforeId
	);
}

export function buildingPopup(p) {
	const level = waterLevel(p.depth_m);
	return `<strong>Building</strong> · OpenStreetMap ${p.osm_id}<br>
		Type: ${p.use}<br>
		Max flood depth: <strong>${p.depth_m} m</strong> · ${LEVELS[level].label}<br>
		<small>100-year scenario. Exposure, not damage.</small>`;
}

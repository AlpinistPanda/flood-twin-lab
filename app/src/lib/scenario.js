// Step 7: two static layers from a flood MODEL, next to the live SENSORS.
//
//   max_depth_100yr.tif         RASTER: the maximum water depth of a 100-year flood scenario,
//                               one value per 10 m cell, as a Cloud-Optimized GeoTIFF.
//   buildings_exposure.geojson  VECTOR: OpenStreetMap buildings with at least 0.15 m of water in
//                               that scenario, and the depth at each building.
//
// Both are plain files in app/static/layers/, served by the web server like an image.
// No tile server, no database: the browser reads only the parts it needs.

import * as maplibregl from 'maplibre-gl';
import { cogProtocol, setColorFunction, locationValues } from '@geomatico/maplibre-cog-protocol';
import { waterLevel, LEVELS } from '#lib/sensors.js';

export const FLOOD_URL = `${location.origin}/layers/max_depth_100yr.tif`;
export const BUILDINGS_URL = '/layers/buildings_exposure.geojson';

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

// Called for EVERY pixel of every tile, so keep it simple and fast.
function colourDepth([depth], colour) {
	if (!(depth >= DEPTH_CLASSES[0][0])) return colour.set([0, 0, 0, 0]); // dry, or no data (NaN): transparent
	let rgb = RGB[0][1];
	for (const [from, c] of RGB) if (depth >= from) rgb = c;
	colour.set([...rgb, 210]);
}

let registered = false;

// The raster. `cog://` tells MapLibre to hand the URL to the COG plugin, which reads the
// GeoTIFF in the browser with HTTP range requests and turns it into map tiles.
export function addFloodDepth(map, beforeId) {
	if (!registered) {
		maplibregl.addProtocol('cog', cogProtocol); // once per page
		setColorFunction(FLOOD_URL, colourDepth);
		registered = true;
	}
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

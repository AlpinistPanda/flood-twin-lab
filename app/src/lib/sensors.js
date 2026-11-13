// Helpers shared by the page and the map engines.

// ── Step 3: from a number to a decision ───────────────────────────────────────

// Water depth on a street, in metres. These are teaching values, not an official standard:
//   0.15 m  over the kerb, ankle deep
//   0.30 m  cars stall, hard to walk
//   0.50 m  dangerous for people and vehicles
// Ordered from the most to the least severe.
export const THRESHOLDS = [
	{ level: 'danger', depth_m: 0.5 },
	{ level: 'warning', depth_m: 0.3 },
	{ level: 'watch', depth_m: 0.15 }
];

// Hysteresis: a sensor enters a level at its threshold, but only leaves it when the water drops
// this much BELOW the threshold. Without it, a level that hovers around 0.30 m switches
// warning → watch → warning → … at every reading. Set it to 0 to see that happen.
export const HYSTERESIS_M = 0.05;

// A reading older than this is not "now" any more.
export const STALE_AFTER_S = 30 * 60;

// Readings below this can't be water depth: the sensor or its calibration is wrong.
// (Small negatives such as −0.02 m are measurement noise around zero.)
export const SUSPECT_BELOW_M = -0.1;

// Every level, with its colour. The map and the table both use this.
export const LEVELS = {
	danger: { label: 'Danger', colour: '#c62828' },
	warning: { label: 'Warning', colour: '#ef6c00' },
	watch: { label: 'Watch', colour: '#f9c80e' },
	dry: { label: 'Dry', colour: '#5b8db8' },
	suspect: { label: 'Suspect', colour: '#8e5bb5' },
	stale: { label: 'No recent data', colour: '#b0b0b0' }
};

const RANK = { dry: 0, watch: 1, warning: 2, danger: 3 };

// The water level for a depth, given the level the sensor had last time.
export function waterLevel(depth, previous = 'dry') {
	for (const t of THRESHOLDS) {
		// Already at this level (or higher) last time? Then use the lower "leave" threshold.
		const alreadyThere = (RANK[previous] ?? 0) >= RANK[t.level];
		const threshold = alreadyThere ? t.depth_m - HYSTERESIS_M : t.depth_m;
		if (depth >= threshold) return t.level;
	}
	return 'dry';
}

// The full status of one sensor: first "can we trust this reading?", then "how deep is it?".
export function classify(site, reading, previous) {
	if (!reading || reading.age_s > STALE_AFTER_S) return 'stale';
	if (reading.depth_m < SUSPECT_BELOW_M || reading.depth_m > site.sensor_height_m) return 'suspect';
	return waterLevel(reading.depth_m, previous);
}

// ── Step 2: GeoJSON for the maps ──────────────────────────────────────────────

// Turn the API's sites + latest readings into GeoJSON: the format every web map understands.
// One Point feature per sensor; the reading and its level go into the feature's properties.
export function toGeoJSON(sites, live, levels = {}) {
	return {
		type: 'FeatureCollection',
		features: sites.map((site) => {
			const r = live?.readings.find((r) => r.site === site.id);
			const level = levels[site.id] ?? 'stale';
			return {
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [site.lon, site.lat] }, // GeoJSON is [lon, lat]!
				properties: {
					id: site.id,
					type: site.type,
					depth_m: r?.depth_m ?? null,
					time: r?.time ?? null,
					age_s: r?.age_s ?? null,
					level,
					colour: LEVELS[level].colour
				}
			};
		})
	};
}

// ── Display helpers ───────────────────────────────────────────────────────────

// Times in the API are Unix seconds in UTC. Convert them only for display.
export function showTime(seconds) {
	if (seconds == null) return '–';
	return new Date(seconds * 1000).toLocaleString('en-GB', {
		timeZone: 'Asia/Kolkata',
		day: '2-digit',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function showAge(seconds) {
	if (seconds == null) return '–';
	if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
	if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
	return `${Math.round(seconds / 86400)} days`;
}

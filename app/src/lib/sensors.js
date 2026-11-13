// Helpers shared by the page and the map engines.

// Turn the API's sites + latest readings into GeoJSON: the format every web map understands.
// One Point feature per sensor; the reading goes into the feature's properties.
export function toGeoJSON(sites, live) {
	return {
		type: 'FeatureCollection',
		features: sites.map((site) => {
			const r = live?.readings.find((r) => r.site === site.id);
			return {
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [site.lon, site.lat] }, // GeoJSON is [lon, lat]!
				properties: {
					id: site.id,
					type: site.type,
					depth_m: r?.depth_m ?? null,
					time: r?.time ?? null,
					age_s: r?.age_s ?? null
				}
			};
		})
	};
}

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

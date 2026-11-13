<script>
	import { onMount } from 'svelte';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { showTime, showAge } from '#lib/sensors.js';

	// Step 2: the sensors on a 2D web map with MapLibre GL.
	// The page gives us the data as GeoJSON; this component only draws it.
	let { geojson } = $props();

	let container; // the <div> the map draws into
	let map = $state(null); // set once the map and its style have loaded

	onMount(() => {
		const m = new maplibregl.Map({
			container,
			// The basemap: a free vector style from OpenFreeMap, built on OpenStreetMap data. No API key.
			style: 'https://tiles.openfreemap.org/styles/positron',
			// Start on the box around all 33 sensors: [west, south] to [east, north], in [lon, lat].
			bounds: [
				[80.08, 12.89],
				[80.2, 12.99]
			],
			fitBoundsOptions: { padding: 30 }
		});
		m.addControl(new maplibregl.NavigationControl(), 'top-right');
		m.addControl(new maplibregl.ScaleControl(), 'bottom-left');

		m.on('load', () => {
			// 1. A source holds the data ...
			m.addSource('sensors', { type: 'geojson', data: geojson });

			// 2. ... and layers say how to draw it. A circle per sensor:
			m.addLayer({
				id: 'sensor-dots',
				type: 'circle',
				source: 'sensors',
				paint: {
					'circle-radius': 7,
					'circle-color': '#1f6fb2',
					'circle-stroke-width': 1.5,
					'circle-stroke-color': '#ffffff'
				}
			});

			// ... and its id as a label, once you zoom in far enough.
			m.addLayer({
				id: 'sensor-labels',
				type: 'symbol',
				source: 'sensors',
				minzoom: 13,
				layout: {
					'text-field': ['get', 'id'],
					'text-font': ['Noto Sans Regular'],
					'text-size': 11,
					'text-offset': [0, 1.2],
					'text-anchor': 'top'
				},
				paint: { 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
			});

			// Click a sensor: show its latest reading in a popup.
			m.on('click', 'sensor-dots', (e) => {
				const p = e.features[0].properties;
				new maplibregl.Popup()
					.setLngLat(e.features[0].geometry.coordinates)
					.setHTML(
						`<strong>${p.id}</strong> · ${p.type}<br>
						 Depth: ${p.depth_m ?? '–'} m<br>
						 Measured: ${showTime(p.time)} IST (${showAge(p.age_s)} ago)`
					)
					.addTo(m);
			});
			m.on('mouseenter', 'sensor-dots', () => (m.getCanvas().style.cursor = 'pointer'));
			m.on('mouseleave', 'sensor-dots', () => (m.getCanvas().style.cursor = ''));

			map = m;
		});

		return () => m.remove(); // clean up when the component goes away
	});

	// When new data arrives (Refresh), give it to the source. The map redraws by itself.
	$effect(() => {
		map?.getSource('sensors').setData(geojson);
	});
</script>

<div class="map" bind:this={container}></div>

<style>
	.map {
		width: 100%;
		height: 60vh;
		border-radius: 6px;
	}
</style>

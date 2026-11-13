<script>
	import { onMount, mount, unmount } from 'svelte';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import SensorDetail from '#lib/SensorDetail.svelte';
	import { addFloodDepth, addBuildings, floodDepthAt, buildingPopup } from '#lib/scenario.js';

	// Step 2: the sensors on a 2D web map with MapLibre GL.
	// The page gives us the data as GeoJSON; this component only draws it.
	// Step 5: `layers` says which information layers are switched on.
	let { geojson, layers } = $props();

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
				layout: {
					// Step 3: draw the most severe sensors on top.
					'circle-sort-key': ['match', ['get', 'level'], 'danger', 3, 'warning', 2, 'watch', 1, 0]
				},
				paint: {
					'circle-radius': 7,
					// Step 3: each feature carries its own colour (set in toGeoJSON).
					'circle-color': ['get', 'colour'],
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

			// Click a sensor: open a popup with the SensorDetail component in it (step 6).
			// MapLibre only knows HTML elements, so we make an empty <div>, let Svelte mount the
			// component into it, and unmount it again when the popup closes.
			m.on('click', 'sensor-dots', (e) => {
				const id = e.features[0].properties.id;
				const target = document.createElement('div');
				const detail = mount(SensorDetail, { target, props: { id } });
				const popup = new maplibregl.Popup({ maxWidth: 'none' })
					.setLngLat(e.features[0].geometry.coordinates)
					.setDOMContent(target);
				popup.on('close', () => unmount(detail)); // (in MapLibre 6, .on() can't be chained)
				popup.addTo(m);
			});
			m.on('mouseenter', 'sensor-dots', () => (m.getCanvas().style.cursor = 'pointer'));
			m.on('mouseleave', 'sensor-dots', () => (m.getCanvas().style.cursor = ''));

			// Step 7: a click that misses the sensors: a building? Otherwise the flood depth there.
			m.on('click', async (e) => {
				if (m.queryRenderedFeatures(e.point, { layers: ['sensor-dots'] }).length) return; // handled above
				const building = m.getLayer('buildings-exposed')
					? m.queryRenderedFeatures(e.point, { layers: ['buildings-exposed'] })[0]
					: null;
				if (building) {
					new maplibregl.Popup().setLngLat(e.lngLat).setHTML(buildingPopup(building.properties)).addTo(m);
				} else if (layers.flood.visible) {
					const depth = await floodDepthAt(e.lngLat);
					const text = depth == null ? 'Dry in this scenario' : `Max flood depth: <strong>${depth.toFixed(2)} m</strong>`;
					new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`${text}<br><small>100-year scenario</small>`).addTo(m);
				}
			});

			map = m;
		});

		return () => m.remove(); // clean up when the component goes away
	});

	// When new data arrives (Refresh), give it to the source. The map redraws by itself.
	$effect(() => {
		map?.getSource('sensors').setData(geojson);
	});

	// Step 5: show or hide the sensor layers when the checkbox in the layer panel changes.
	$effect(() => {
		const visibility = layers.sensors.visible ? 'visible' : 'none';
		for (const id of ['sensor-dots', 'sensor-labels']) map?.setLayoutProperty(id, 'visibility', visibility);
	});

	// Step 7: the scenario layers. Added the first time they are switched on (so nobody downloads
	// them who doesn't look at them), then only shown and hidden.
	// They go UNDER the basemap's labels, so street names stay readable on top of the water.
	$effect(() => {
		if (!map) return;
		const underLabels = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
		// The raster always goes below the buildings, whichever is switched on first.
		const underBuildings = map.getLayer('buildings-exposed') ? 'buildings-exposed' : underLabels;
		if (layers.flood.visible && !map.getLayer('flood-depth')) addFloodDepth(map, underBuildings);
		if (layers.buildings.visible && !map.getLayer('buildings-exposed')) addBuildings(map, underLabels);
		for (const [id, on] of [['flood-depth', layers.flood.visible], ['buildings-exposed', layers.buildings.visible]]) {
			if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
		}
	});
</script>

<div class="map" bind:this={container}></div>

<style>
	.map {
		width: 100%;
		height: 100%;
	}
</style>

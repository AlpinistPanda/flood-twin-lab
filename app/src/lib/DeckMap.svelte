<script>
	import { onMount } from 'svelte';
	import * as maplibregl from 'maplibre-gl';
	import '#lib/maplibre-worker.js'; // step 9: so the map also works in the production build
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { showTime, showAge, LEVELS, columnHeight } from '#lib/sensors.js';
	import {
		BUILDINGS_ALL_URL,
		BUILDING_HEIGHT_M,
		buildingColour,
		addFloodDepth,
		addFloodTimeseries,
		showFloodStep,
		floodDepthAt,
		floodDepthAtStep,
		buildingPopup,
		timeseriesInfo
	} from '#lib/scenario.js';

	// Extra (deck.gl): the same data as deck.gl layers, drawn on top of a MapLibre basemap.
	// deck.gl doesn't draw basemaps; it draws DATA, on the GPU, very fast.
	//   sensors    a ColumnLayer: a column per sensor, as tall as the water is deep
	//   buildings  a GeoJsonLayer: all 78,045 buildings as 3D blocks; the exposed ones coloured
	//              by flood depth, the others grey
	//   flood      the max-depth and time-series COGs: drawn by MapLibre underneath, with the very
	//              same code as the MapLibre page (scenario.js), because this map IS MapLibre
	// Step 5: `layers` says which information layers are switched on.
	let { geojson, layers } = $props();

	let container;
	let map = $state(null); // the MapLibre map, once its style has loaded
	let overlay = $state(null); // deck.gl, living inside the MapLibre map
	let deck; // the deck.gl layer classes, loaded on demand

	onMount(() => {
		let m;
		let cancelled = false;

		(async () => {
			// Like Cesium, deck.gl is only downloaded when someone picks this engine.
			const [mapbox, layerClasses] = await Promise.all([import('@deck.gl/mapbox'), import('@deck.gl/layers')]);
			if (cancelled) return;
			deck = layerClasses;

			m = new maplibregl.Map({
				container,
				style: 'https://tiles.openfreemap.org/styles/positron',
				center: [80.14, 12.935],
				zoom: 11.6,
				pitch: 50, // tilt the map, so the columns stand up
				bearing: -15
			});
			m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

			// deck.gl joins MapLibre as a control ("MapboxOverlay" works with MapLibre too).
			// It draws on its own canvas, on top of the map, and follows every pan and zoom.
			// (interleaved: true would share MapLibre's canvas instead, but in deck.gl 9.4 that
			// relies on MapLibre internals that changed in MapLibre 6, and it crashes.)
			const o = new mapbox.MapboxOverlay({
				interleaved: false,
				layers: [],
				getTooltip: ({ object, layer }) =>
					object && (layer.id === 'buildings-3d' ? box(buildingPopup(object.properties)) : sensorTooltip(object.properties))
			});
			m.addControl(o);
			overlay = o;

			// A click that misses deck.gl's sensors and buildings: the flood depth there.
			m.on('click', async (e) => {
				if (o.pickObject({ x: e.point.x, y: e.point.y })) return; // the tooltip shows that
				let text;
				if (layers.floodTime.visible) {
					const [depth, info] = await Promise.all([floodDepthAtStep(e.lngLat), timeseriesInfo()]);
					const hours = (info.steps[layers.floodTime.band] * info.minutes_per_step) / 60;
					text = `${depth == null ? 'Dry at this moment' : `Flood depth: <strong>${depth.toFixed(2)} m</strong>`}<br><small>100-year scenario, Time ${hours}:00</small>`;
				} else if (layers.flood.visible) {
					const depth = await floodDepthAt(e.lngLat);
					text = `${depth == null ? 'Dry in this scenario' : `Max flood depth: <strong>${depth.toFixed(2)} m</strong>`}<br><small>100-year scenario</small>`;
				} else return;
				new maplibregl.Popup().setLngLat(e.lngLat).setHTML(text).addTo(m);
			});

			m.on('load', () => (map = m));
		})();

		return () => {
			cancelled = true;
			m?.remove();
		};
	});

	// New data → new layers. In deck.gl you never change a layer: you describe it again,
	// and deck.gl works out what actually changed and updates only that on the GPU.
	$effect(() => {
		overlay?.setProps({ layers: makeLayers(geojson) });
	});

	function makeLayers(geojson) {
		const result = [
			new deck.ColumnLayer({
				id: 'sensor-columns', // the same id each time: "this is the same layer, with new data"
				visible: layers.sensors.visible, // step 5: the checkbox in the layer panel
				data: geojson.features,
				getPosition: (f) => f.geometry.coordinates, // [lon, lat], straight from GeoJSON
				getElevation: (f) => columnHeight(f.properties),
				getFillColor: (f) => rgb(f.properties.colour),
				radius: 90,
				diskResolution: 16,
				extruded: true,
				pickable: true, // needed for the tooltip
				// When a depth changes, the column grows or shrinks smoothly, in 800 ms.
				transitions: { getElevation: 800, getFillColor: 800 }
			})
		];
		// The buildings: only described once they are switched on, so nobody downloads them
		// who doesn't look at them. deck.gl reads the GeoJSON file itself, and draws all 78,045
		// blocks in one go on the GPU.
		if (layers.buildings.visible) {
			result.unshift(
				new deck.GeoJsonLayer({
					id: 'buildings-3d',
					data: BUILDINGS_ALL_URL,
					extruded: true,
					getElevation: BUILDING_HEIGHT_M, // the same assumed height for every building
					getFillColor: (f) => rgb(buildingColour(f.properties.depth_m)), // grey if not exposed
					pickable: true
				})
			);
		}
		return result;
	}

	// The flood rasters: MapLibre layers under deck.gl's canvas, exactly as on the MapLibre page.
	$effect(() => {
		if (!map) return;
		const underLabels = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
		if (layers.flood.visible && !map.getLayer('flood-depth')) addFloodDepth(map, underLabels);
		if (map.getLayer('flood-depth')) map.setLayoutProperty('flood-depth', 'visibility', layers.flood.visible ? 'visible' : 'none');
	});

	$effect(() => {
		if (!map) return;
		const { visible, band } = layers.floodTime;
		const underLabels = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
		if (visible && !map.getLayer('flood-time')) addFloodTimeseries(map, band, underLabels);
		if (map.getLayer('flood-time')) {
			showFloodStep(map, band, underLabels);
			map.setLayoutProperty('flood-time', 'visibility', visible ? 'visible' : 'none');
		}
	});

	// deck.gl wants colours as [red, green, blue] numbers, not '#c62828'.
	function rgb(hex) {
		return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
	}

	const box = (html) => ({ html, style: { background: 'white', color: '#222', fontSize: '13px', borderRadius: '4px' } });

	function sensorTooltip(p) {
		return box(`<strong>${p.id}</strong> · ${p.type} · <strong>${LEVELS[p.level].label}</strong><br>
				Depth: ${p.depth_m ?? '–'} m<br>
				Measured: ${showTime(p.time)} IST (${showAge(p.age_s)} ago)`);
	}
</script>

<div class="map" bind:this={container}></div>

<style>
	.map {
		width: 100%;
		height: 100%;
	}
</style>

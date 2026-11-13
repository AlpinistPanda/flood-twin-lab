<script>
	import { onMount } from 'svelte';
	import { showTime, showAge, LEVELS, columnHeight } from '#lib/sensors.js';
	import {
		BUILDINGS_ALL_URL,
		BUILDING_HEIGHT_M,
		buildingColour,
		FLOOD_URL,
		TIMESERIES_URL,
		cogTile,
		cogBounds,
		useFloodStep,
		floodDepthAt,
		floodDepthAtStep,
		buildingPopup,
		timeseriesInfo
	} from '#lib/scenario.js';

	// Extra (Cesium): the same data on a 3D globe with CesiumJS.
	//   sensors    a column per sensor; its height shows the water depth (columnHeight in sensors.js)
	//   buildings  all 78,045 buildings, raised to an assumed height; the exposed ones coloured
	//              by flood depth, the others grey
	//   flood      the max-depth and time-series COGs, draped on the globe, with the SAME files,
	//              colours and time step as the MapLibre page
	// Step 5: `layers` says which information layers are switched on.
	let { geojson, layers } = $props();

	// How the basemap is restyled (see the Viewer below). Try other values: 1 is "unchanged".
	const BASEMAP_STYLE = { saturation: 0, brightness: 1.7, contrast: 0.45, gamma: 1.0 };

	let container; // the <div> the globe draws into
	let viewer = $state(null);
	let Cesium; // the library itself, loaded only when this component is shown
	let sensors; // step 5: a data source that holds the sensor columns, so we can hide them in one go

	onMount(() => {
		let v;
		let cancelled = false;

		(async () => {
			// Cesium loads workers, images and fonts at run time from this address.
			// scripts/copy-cesium.js put them in static/cesium-assets/ when you ran npm install.
			// (Not /cesium: that address is the CesiumJS page. A folder with the same name would win
			// in production, and reloading the page would fail.)
			globalThis.CESIUM_BASE_URL = '/cesium-assets';

			// A dynamic import: Cesium is big (several MB), so we only download it when
			// someone actually picks the globe. MapLibre users never pay for it.
			Cesium = await import('cesium');
			await import('cesium/Build/Cesium/Widgets/widgets.css');
			if (cancelled) return;

			v = new Cesium.Viewer(container, {
				// The imagery on the globe: OpenStreetMap's own raster tiles. No API key, but a
				// fair-use policy: fine for a class, not for a public app with many users.
				baseLayer: new Cesium.ImageryLayer(
					// OSM tiles stop at zoom level 19; closer than that, Cesium enlarges level 19
					// instead of asking for tiles that don't exist.
					new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/', maximumLevel: 19 }),
					// The OSM map is colourful, and our data is colour too. Cesium can restyle any
					// imagery itself: no colour, lighter, less contrast. The result looks like the
					// light grey basemap of the MapLibre page, so the flood and the buildings stand out.
					BASEMAP_STYLE
				),
				// Switch off the widgets that need a Cesium ion account, or that we don't use.
				baseLayerPicker: false,
				geocoder: false,
				timeline: false,
				animation: false,
				homeButton: false,
				navigationHelpButton: false,
				fullscreenButton: false,
				sceneModePicker: true // 3D globe, 2D map, or "Columbus view": try all three
			});

			// Look at Tambaram from the south, from 14 km up, tilted 45° down.
			v.camera.setView({
				destination: Cesium.Cartesian3.fromDegrees(80.14, 12.81, 14000),
				orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 }
			});

			// Don't let the camera dive into the street: stop 100 m above the ground.
			v.scene.screenSpaceCameraController.minimumZoomDistance = 100;

			// Step 5: one data source per information layer. Hiding a layer = hiding its source.
			sensors = new Cesium.CustomDataSource('sensors');
			await v.dataSources.add(sensors);

			// A click on the ground (not on a sensor or a building): the flood depth there.
			new Cesium.ScreenSpaceEventHandler(v.scene.canvas).setInputAction(
				(click) => probe(click.position),
				Cesium.ScreenSpaceEventType.LEFT_CLICK
			);

			viewer = v;
		})();

		return () => {
			cancelled = true;
			v?.destroy(); // free the WebGL context
		};
	});

	// ── Sensors ──────────────────────────────────────────────────────────────────

	// When new data arrives, update the columns. Cesium redraws by itself.
	$effect(() => {
		if (viewer) draw(geojson);
	});

	// Step 5: follow the checkbox in the layer panel.
	$effect(() => {
		if (viewer) sensors.show = layers.sensors.visible;
	});

	function draw(geojson) {
		for (const f of geojson.features) {
			const p = f.properties;
			const [lon, lat] = f.geometry.coordinates;
			const height = columnHeight(p);

			// Cesium keeps "entities". Make one per sensor the first time, then only update it.
			let e = sensors.entities.getById(p.id);
			if (!e) {
				e = sensors.entities.add({
					id: p.id,
					name: p.id,
					cylinder: { topRadius: 70, bottomRadius: 70, outline: false },
					label: {
						text: p.id,
						font: '13px sans-serif',
						fillColor: Cesium.Color.BLACK,
						showBackground: true,
						backgroundColor: Cesium.Color.WHITE.withAlpha(0.7),
						distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6000)
					}
				});
			}
			// The cylinder is centred on its position, so lift it by half its height.
			e.position = Cesium.Cartesian3.fromDegrees(lon, lat, height / 2);
			e.cylinder.length = height;
			e.cylinder.material = Cesium.Color.fromCssColorString(p.colour).withAlpha(0.9);
			// Shown in Cesium's info box when you click the column.
			e.description = `<p><strong>${LEVELS[p.level].label}</strong> · ${p.type}</p>
				<p>Depth: ${p.depth_m ?? '–'} m<br>
				Measured: ${showTime(p.time)} IST (${showAge(p.age_s)} ago)</p>`;
		}
	}

	// ── Buildings: 3D blocks ─────────────────────────────────────────────────────

	let buildings = null; // one Cesium "primitive" holding every building, once loaded
	let buildingsLoading = false;

	$effect(() => {
		if (!viewer) return;
		const on = layers.buildings.visible;
		if (on && !buildings && !buildingsLoading) loadBuildings();
		if (buildings) buildings.show = on;
	});

	// For the sensors, one entity per object is fine (33 of them). For 78,045 buildings it is far
	// too slow. Instead we describe every building as a "geometry instance" and hand them all to
	// ONE primitive: Cesium builds the 3D shapes in background workers and draws them in one go.
	// The price: no entity per building, so we show the info box ourselves (see probe() below).
	async function loadBuildings() {
		buildingsLoading = true;
		const geojson = await (await fetch(BUILDINGS_ALL_URL)).json();
		const instances = geojson.features.map(
			(f) =>
				new Cesium.GeometryInstance({
					geometry: new Cesium.PolygonGeometry({
						polygonHierarchy: new Cesium.PolygonHierarchy(
							Cesium.Cartesian3.fromDegreesArray(f.geometry.coordinates[0].flat()) // the outline, [lon, lat, lon, lat, …]
						),
						height: 0,
						extrudedHeight: BUILDING_HEIGHT_M // the same assumed height for every building
					}),
					attributes: {
						color: Cesium.ColorGeometryInstanceAttribute.fromColor(
							Cesium.Color.fromCssColorString(buildingColour(f.properties.depth_m)) // grey if not exposed
						)
					},
					id: f.properties // what a click on this building gives back
				})
		);
		const primitive = new Cesium.Primitive({
			geometryInstances: instances,
			appearance: new Cesium.PerInstanceColorAppearance({ translucent: false }),
			asynchronous: true // build the shapes in web workers, so the page doesn't freeze
		});
		primitive.show = layers.buildings.visible;
		viewer.scene.primitives.add(primitive);
		buildings = primitive;
	}

	// ── Flood rasters: the COG tiles, draped on the globe ────────────────────────

	// Cesium asks an "imagery provider" for map tiles by x, y and zoom level. We hand those
	// requests to the COG plugin, exactly as MapLibre does, and get the same coloured tiles back.
	async function cogLayer(url) {
		const [west, south, east, north] = await cogBounds(url);
		class CogImagery extends Cesium.UrlTemplateImageryProvider {
			requestImage(x, y, level) {
				return cogTile(url, level, x, y);
			}
		}
		const provider = new CogImagery({
			url: `${url}/{z}/{x}/{y}`, // only a name: requestImage() above does the work
			tilingScheme: new Cesium.WebMercatorTilingScheme(), // the same tile grid as web maps
			rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north), // don't ask outside the file
			maximumLevel: 18
		});
		return new Cesium.ImageryLayer(provider, { alpha: 0.8 });
	}

	let maxLayer = null;
	let maxLoading = false;
	$effect(() => {
		if (!viewer) return;
		const on = layers.flood.visible;
		if (on && !maxLayer && !maxLoading) {
			maxLoading = true;
			cogLayer(FLOOD_URL).then((layer) => {
				viewer.imageryLayers.add(layer, 1); // just above the basemap, under the time series
				layer.show = layers.flood.visible;
				maxLayer = layer;
			});
		}
		if (maxLayer) maxLayer.show = on;
	});

	// The time series: a new step means new colours, so we make a new layer for it, and remove the
	// old one a moment later (removing it first would make the map flicker).
	let timeLayer = null;
	let latest = 0; // which request is the newest, while the slider moves fast
	$effect(() => {
		if (!viewer) return;
		const { visible, band } = layers.floodTime;
		showStep(visible, band);
	});

	async function showStep(visible, band) {
		const request = ++latest;
		if (!visible) {
			if (timeLayer) timeLayer.show = false;
			return;
		}
		useFloodStep(band);
		const layer = await cogLayer(TIMESERIES_URL);
		if (request !== latest) return; // the slider has moved on
		viewer.imageryLayers.add(layer); // on top
		const old = timeLayer;
		timeLayer = layer;
		if (old) setTimeout(() => viewer?.imageryLayers.remove(old, true), 600);
	}

	// ── A click on the ground ───────────────────────────────────────────────────

	let probeEntity = null;
	function showInfo(title, point, html) {
		probeEntity ??= viewer.entities.add({ point: { pixelSize: 8, color: Cesium.Color.BLACK } });
		probeEntity.name = title;
		probeEntity.position = point;
		probeEntity.description = html;
		viewer.selectedEntity = probeEntity; // opens Cesium's info box
	}

	async function probe(position) {
		const picked = viewer.scene.pick(position);
		if (picked?.id instanceof Cesium.Entity) return; // a sensor: Cesium shows its info box itself
		const point = viewer.camera.pickEllipsoid(position);
		if (!point) return;
		if (picked?.id?.osm_id) return showInfo('Building', point, `<p>${buildingPopup(picked.id)}</p>`); // a building
		if (!layers.floodTime.visible && !layers.flood.visible) return;
		const c = Cesium.Cartographic.fromCartesian(point);
		const lngLat = { lng: Cesium.Math.toDegrees(c.longitude), lat: Cesium.Math.toDegrees(c.latitude) };

		let text;
		if (layers.floodTime.visible) {
			const [depth, info] = await Promise.all([floodDepthAtStep(lngLat), timeseriesInfo()]);
			const hours = (info.steps[layers.floodTime.band] * info.minutes_per_step) / 60;
			text = `${depth == null ? 'Dry at this moment' : `Flood depth: <strong>${depth.toFixed(2)} m</strong>`}<br>100-year scenario, Time ${hours}:00`;
		} else {
			const depth = await floodDepthAt(lngLat);
			text = `${depth == null ? 'Dry in this scenario' : `Max flood depth: <strong>${depth.toFixed(2)} m</strong>`}<br>100-year scenario`;
		}
		showInfo('Flood depth', point, `<p>${text}</p>`);
	}
</script>

<div class="globe" bind:this={container}></div>

<style>
	.globe {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
</style>

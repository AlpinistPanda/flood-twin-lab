<script>
	import MapPage from '#lib/MapPage.svelte';
	import MapLibreMap from '#lib/MapLibreMap.svelte';
	import { feed } from '#lib/feed.svelte.js';
	import { layers } from '#lib/layers.svelte.js';
</script>

<MapPage>
	<MapLibreMap geojson={feed.geojson} {layers} />
</MapPage>

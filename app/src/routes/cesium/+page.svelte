<script>
	import MapPage from '#lib/MapPage.svelte';
	import CesiumGlobe from '#lib/CesiumGlobe.svelte';
	import FloodTimeBar from '#lib/FloodTimeBar.svelte';
	import { feed } from '#lib/feed.svelte.js';
	import { layers } from '#lib/layers.svelte.js';
</script>

<MapPage>
	<CesiumGlobe geojson={feed.geojson} {layers} />
	<!-- Step 8: the time bar, while the flood-over-time layer is on -->
	{#if layers.floodTime.visible}
		<FloodTimeBar />
	{/if}
</MapPage>

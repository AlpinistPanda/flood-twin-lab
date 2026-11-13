<script>
	import LayerPanel from '#lib/LayerPanel.svelte';
	import { feed } from '#lib/feed.svelte.js';

	// Step 5: the frame shared by every map page: the map fills the space, the layer panel
	// floats on top, and the map goes grey when the feed is lost (step 4).
	let { children } = $props();
</script>

<div class="map-page">
	<div class="map" class:faded={feed.status === 'lost'}>
		{@render children()}
	</div>
	<LayerPanel />
</div>

<style>
	.map-page {
		position: relative;
		height: 100%;
	}
	.map {
		height: 100%;
	}
	/* Feed lost: grey the map out, so nobody mistakes old colours for the current situation. */
	.faded {
		filter: grayscale(0.9) opacity(0.6);
	}
</style>

<script>
	import { layers } from '#lib/layers.svelte.js';
	import { LEVELS } from '#lib/sensors.js';
	import { DEPTH_CLASSES } from '#lib/scenario.js';

	// Step 5: switch information layers on and off. Floats over the top-left of every map page.
	// Step 7: `supported` lists the layers this page can draw; the others are greyed out.
	let { supported = Object.keys(layers) } = $props();
	let open = $state(true);
</script>

<section class="panel">
	<button class="head" onclick={() => (open = !open)} aria-expanded={open}>
		Layers <span>{open ? '▾' : '▸'}</span>
	</button>

	{#if open}
		{#each Object.entries(layers) as [id, layer] (id)}
			{@const ok = supported.includes(id)}
			<label class:off={!ok} title={ok ? '' : 'Only on the MapLibre page'}>
				<input type="checkbox" bind:checked={layer.visible} disabled={!ok} />
				{layer.label}
			</label>
			{#if ok && layer.visible && layer.legend === 'levels'}
				<ul class="legend">
					{#each Object.entries(LEVELS) as [key, l] (key)}
						<li><i style:background={l.colour}></i>{l.label}</li>
					{/each}
				</ul>
			{:else if ok && layer.visible && layer.legend === 'exposure'}
				<ul class="legend">
					<li><i class="sq" style:background={LEVELS.watch.colour}></i>0.15 – 0.30 m</li>
					<li><i class="sq" style:background={LEVELS.warning.colour}></i>0.30 – 0.50 m</li>
					<li><i class="sq" style:background={LEVELS.danger.colour}></i>0.50 m and more</li>
				</ul>
			{:else if ok && layer.visible && layer.legend === 'depth'}
				<ul class="legend">
					{#each DEPTH_CLASSES as [from, colour], i (from)}
						<li>
							<i class="sq" style:background={colour}></i>{from}{i < DEPTH_CLASSES.length - 1 ? ` – ${DEPTH_CLASSES[i + 1][0]}` : ' and more'} m
						</li>
					{/each}
				</ul>
			{/if}
		{/each}
	{/if}
</section>

<style>
	.panel {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 10;
		min-width: 13rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.95);
		border-radius: 6px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		font-size: 0.9rem;
	}
	.head {
		all: unset;
		cursor: pointer;
		display: flex;
		justify-content: space-between;
		width: 100%;
		font-weight: 600;
	}
	label {
		display: block;
		margin-top: 0.45rem;
		cursor: pointer;
	}
	.legend {
		list-style: none;
		margin: 0.25rem 0 0 1.4rem;
		padding: 0;
		font-size: 0.8rem;
	}
	label.off {
		color: #999;
		cursor: default;
	}
	i.sq {
		border-radius: 2px;
	}
	i {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		margin-right: 0.35rem;
		vertical-align: -0.05rem;
	}
</style>

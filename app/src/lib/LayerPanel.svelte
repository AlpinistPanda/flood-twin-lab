<script>
	import { layers } from '#lib/layers.svelte.js';
	import { LEVELS } from '#lib/sensors.js';

	// Step 5: switch information layers on and off. Floats over the top-left of every map page.
	let open = $state(true);
</script>

<section class="panel">
	<button class="head" onclick={() => (open = !open)} aria-expanded={open}>
		Layers <span>{open ? '▾' : '▸'}</span>
	</button>

	{#if open}
		{#each Object.entries(layers) as [id, layer] (id)}
			<label>
				<input type="checkbox" bind:checked={layer.visible} />
				{layer.label}
			</label>
			{#if layer.visible && layer.legend === 'levels'}
				<ul class="legend">
					{#each Object.entries(LEVELS) as [key, l] (key)}
						<li><i style:background={l.colour}></i>{l.label}</li>
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
	i {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		margin-right: 0.35rem;
		vertical-align: -0.05rem;
	}
</style>

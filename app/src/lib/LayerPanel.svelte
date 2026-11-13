<script>
	import { layers, GROUPS } from '#lib/layers.svelte.js';
	import { LEVELS } from '#lib/sensors.js';
	import { DEPTH_CLASSES, NOT_EXPOSED_COLOUR } from '#lib/scenario.js';

	// Step 5: switch information layers on and off. Floats over the top-left of every map page.
	// Step 7: `supported` lists the layers this page can draw; the others are greyed out.
	let { supported = Object.keys(layers) } = $props();
	let open = $state(true);

	// Step 8: layers in a group are shown as one choice (radio buttons): one of them, or none.
	const members = (group) => Object.entries(layers).filter(([, l]) => l.group === group);
	const firstOf = (group) => members(group)[0][0];
	const chosen = (group) => members(group).find(([, l]) => l.visible)?.[0] ?? null;
	function choose(group, id) {
		for (const [key, l] of members(group)) l.visible = key === id;
	}
</script>

<section class="panel">
	<button class="head" onclick={() => (open = !open)} aria-expanded={open}>
		Layers <span>{open ? '▾' : '▸'}</span>
	</button>

	{#if open}
		{#each Object.entries(layers) as [id, layer] (id)}
			{@const ok = supported.includes(id)}
			{#if layer.group}
				<!-- A group: drawn once, at its first member, as radio buttons plus one legend -->
				{#if id === firstOf(layer.group)}
					<fieldset>
						<legend>{GROUPS[layer.group]}</legend>
						<label>
							<input type="radio" checked={!chosen(layer.group)} onchange={() => choose(layer.group, null)} />
							None
						</label>
						{#each members(layer.group) as [key, member] (key)}
							{@const can = supported.includes(key)}
							<label class:off={!can} title={can ? '' : 'Only on the MapLibre page'}>
								<input type="radio" checked={member.visible} disabled={!can} onchange={() => choose(layer.group, key)} />
								{member.option}
							</label>
						{/each}
					</fieldset>
					{#if chosen(layer.group)}
						<ul class="legend">
							{#each DEPTH_CLASSES as [from, colour], i (from)}
								<li>
									<i class="sq" style:background={colour}></i>{from}{i < DEPTH_CLASSES.length - 1 ? ` – ${DEPTH_CLASSES[i + 1][0]}` : ' and more'} m
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			{:else}
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
					<li><i class="sq" style:background={NOT_EXPOSED_COLOUR}></i>Not exposed (3D pages)</li>
				</ul>
			{/if}
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
	fieldset {
		border: none;
		margin: 0.45rem 0 0;
		padding: 0;
	}
	fieldset legend {
		padding: 0;
		margin-bottom: 0.1rem;
	}
	fieldset label {
		margin: 0.15rem 0 0 1.2rem;
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

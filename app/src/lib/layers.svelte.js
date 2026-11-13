// Step 5: the information layers you can switch on and off.
//
// Every map page shows the same list, and the choice is shared: switch the sensors off on
// one map page, open another, and they are off there too.
//
// To add a layer: add an entry here, then teach each map component to draw it
// (and to hide it when `visible` is false).
//
// Step 7: two layers from a flood scenario. They start switched off, and their data is only
// downloaded the first time you switch them on. Drawn on the MapLibre page only.
//
// Step 8: the flood over time. `band` is the time step on the slider (0 = the first one).
// The two flood layers form a GROUP: you see one of them, or none. Both on at once would put two
// blue rasters on top of each other, with one legend for both.

// The groups, and the title they get in the layer panel.
export const GROUPS = { flood: 'Flood depth, 100-year flood' };

export const layers = $state({
	sensors: { label: 'Water-level sensors (live)', visible: true, legend: 'levels' },
	buildings: { label: 'Buildings exposed, 100-year flood', visible: false, legend: 'exposure' },
	flood: { label: 'Max flood depth, 100-year flood', visible: false, legend: 'depth', group: 'flood', option: 'Maximum depth' },
	floodTime: { label: 'Flood depth over time, 100-year flood', visible: false, legend: 'depth', group: 'flood', option: 'Over time', band: 0 }
});

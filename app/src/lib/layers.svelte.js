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

export const layers = $state({
	sensors: { label: 'Water-level sensors (live)', visible: true, legend: 'levels' },
	buildings: { label: 'Buildings exposed, 100-year flood', visible: false, legend: 'exposure' },
	flood: { label: 'Max flood depth, 100-year flood', visible: false, legend: 'depth' }
});

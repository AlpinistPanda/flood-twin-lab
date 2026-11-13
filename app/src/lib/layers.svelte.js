// Step 5: the information layers you can switch on and off.
//
// The choice is shared by every page: switch the sensors off on the map, open the sensor
// table, come back, and they are still off.
//
// To add a layer: add an entry here, then teach each map component to draw it
// (and to hide it when `visible` is false).

export const layers = $state({
	sensors: { label: 'Water-level sensors', visible: true, legend: 'levels' }
});

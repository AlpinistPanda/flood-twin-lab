// Step 9: MapLibre does its heavy work (decoding tiles) in a web worker, loaded from a
// separate file next to MapLibre's own code. The dev server serves that file straight from
// node_modules, so in development it just works. The production build bundles MapLibre into
// new files, and the worker file is left behind: the map stays empty.
//
// The fix: `?url` asks Vite to copy the worker file into the build and give us its address,
// and setWorkerUrl() tells MapLibre where to find it. Import this file once, before making a map.

import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);

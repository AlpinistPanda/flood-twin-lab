// Extra (Cesium): CesiumJS needs some files at run time that are not JavaScript modules:
// web workers, images, fonts, the widget styles. They must be served as plain files.
// This copies them into static/cesium-assets/, which SvelteKit serves at /cesium-assets/.
// It runs by itself after every `npm install` (see "postinstall" in package.json).
import { cpSync, rmSync } from 'node:fs';

const from = 'node_modules/cesium/Build/Cesium';
const to = 'static/cesium-assets';

rmSync(to, { recursive: true, force: true });
for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
	cpSync(`${from}/${dir}`, `${to}/${dir}`, { recursive: true });
}
console.log(`Copied the CesiumJS static files to ${to}/`);

import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Step 9: build the app into plain files (HTML, JS, CSS) in build/, for nginx to serve.
			// Every page is rendered in the browser (ssr = false), so one fallback page is enough:
			// nginx answers every address with index.html, and the app shows the right page.
			adapter: adapter({ fallback: 'index.html' })
		})
	],

	// Step 2: MapLibre loads a web worker from a file next to its own code. Vite's dependency
	// pre-bundling would move that code and break the worker, so leave MapLibre as it is.
	optimizeDeps: {
		exclude: ['maplibre-gl']
	},

	// Step 1: the browser asks this dev server for /api/…, and the dev server passes the
	// request on to the sensor API. The browser only ever talks to one address.
	server: {
		proxy: {
			'/api': {
				target: process.env.API_URL ?? 'http://localhost:8000',
				rewrite: (path) => path.replace(/^\/api/, '')
			}
		}
	}
});

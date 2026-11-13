# Step 0 · An empty SvelteKit app

[Guide overview](README.md) · [Step 1 →](01-feed-table.md)

**You build:** a new SvelteKit web app, running in your browser.
**You learn:** what SvelteKit is, how to create a project, what its files do, the dev server.
**Time:** about 20 minutes.
**Start from:** the `start` branch (see [Before you start](README.md#before-you-start)). The reference for the end of this step is the tag `step-0`.

---

## Why SvelteKit?

A twin's web viewer is more than one page with one map: there's a map page, a table page, maybe a 3D page, shared settings, data that keeps updating. You could write all of that in plain HTML and JavaScript, but you'd spend most of your time keeping the page in sync with the data.

**Svelte** is a tool that does that for you: you say *what* the page should look like for the current data, and Svelte updates the page whenever the data changes. **SvelteKit** adds what an app needs around it: pages with their own addresses (`/maplibre`, `/sensors`), a development server, and a way to build the finished app for production.

Other frameworks (React, Vue, Angular) do the same job. The Resilient Hydro Twin uses SvelteKit, and so do we.

## 0.1 · Look at what you have

Your Codespace (or your clone) has these folders:

| Folder / file | What |
|---|---|
| `data/` | 30 days of readings from 33 sensors, and a flood scenario |
| `api/` | The sensor API (see [The sensor API](api.md)) |
| `loadtest/` | A load test, for step 9 |
| `guide/` | This guide |
| `.devcontainer/` | How the Codespace is set up: Node.js 26, Python 3.15, Docker |

Check the tools in the terminal:

```bash
node --version     # v26…
npm --version      # 12…
python --version   # Python 3.15…
```

## 0.2 · Create the app

In the repository folder:

```bash
npx sv@1.3.0 create app --template minimal --no-types --no-add-ons --install npm
```

What that says:

| Part | Meaning |
|---|---|
| `npx sv@1.3.0` | Download and run version 1.3.0 of `sv`, the official tool to create SvelteKit projects |
| `create app` | Make a new project in a folder called `app` |
| `--template minimal` | The smallest project: one page, no demo |
| `--no-types` | Plain JavaScript, not TypeScript. Easier to start with |
| `--no-add-ons` | Nothing extra (no test tools, no CSS frameworks) |
| `--install npm` | Install the packages straight away with npm |

`npx` may ask *Ok to proceed? (y)*: press Enter. After a minute you see *You're all set!*

## 0.3 · Run it

```bash
cd app
npm run dev
```

The **dev server** starts on port **5173**. Open it (pop-up, or the **Ports** tab). You see *Welcome to SvelteKit*.

Now open `app/src/routes/+page.svelte` in the editor, change the heading, and save. The browser updates by itself, without reloading. That's **hot reload**: you will use it in every step.

Stop the dev server with **Ctrl+C** when you're done.

## 0.4 · Know your files

| File | What it is |
|---|---|
| `app/package.json` | The app's name, its **scripts** (`npm run dev`, `npm run build`) and the **packages** it uses |
| `app/package-lock.json` | The exact version of every package that was installed. Commit it: everyone gets the same versions |
| `app/node_modules/` | The installed packages. Big, never commit it (it is in `.gitignore`) |
| `app/vite.config.js` | Settings for **Vite**, the tool that runs the dev server and builds the app, and for SvelteKit inside it |
| `app/src/app.html` | The HTML shell every page is put into |
| `app/src/routes/` | The **pages**. Every folder in here is an address: `routes/sensors/+page.svelte` becomes `/sensors` |
| `app/src/routes/+page.svelte` | The page at `/` |
| `app/src/routes/+layout.svelte` | The frame around every page. Right now it only adds the icon and shows the page |
| `app/src/lib/` | Your own code that pages share: components, helpers |
| `app/static/` | Files served as they are (`static/robots.txt` → `/robots.txt`) |

### `#lib`: importing your own files

Look at `package.json`:

```json
"imports": {
    "#lib": "./src/lib/index.js",
    "#lib/*": "./src/lib/*"
}
```

This lets you write `import { something } from '#lib/sensors.js'` from any file, however deep it is, instead of `'../../lib/sensors.js'`. (Older SvelteKit projects use `$lib` for the same thing.)

### A `.svelte` file

A Svelte **component** is one file with up to three parts:

```svelte
<script>
	// JavaScript: the data and what to do with it
	let name = $state('Tambaram');
</script>

<!-- HTML: what to show. {…} puts a JavaScript value in the page -->
<h1>Water levels in {name}</h1>

<style>
	/* CSS: only for this component, it can't leak into others */
	h1 { color: #1f6fb2; }
</style>
```

`$state(…)` is a **rune**: it tells Svelte "when this value changes, update the page". You meet the other runes (`$derived`, `$props`, `$effect`) in the next steps. In `vite.config.js` you'll see `runes: …`: that switches every component in the project to this way of writing.

## 0.5 · Save your work

In the repository folder (`cd ..` from `app/`):

```bash
git add -A
git commit -m "My step 0: an empty SvelteKit app"
```

## Check

- [ ] `npm run dev` in `app/` starts the dev server without errors.
- [ ] Port 5173 shows your page, and a change in `+page.svelte` appears in the browser when you save.
- [ ] `git status` says *nothing to commit*, and `node_modules` was not committed (`git show --stat HEAD | grep node_modules` prints nothing).

## Stuck?

| Problem | Try |
|---|---|
| `sv` asks questions instead of creating the project | You missed one of the options. Answer: *minimal*, *No* for TypeScript, no add-ons, *npm* |
| `Directory not empty` | There is already an `app` folder. Remove it (`rm -rf app`) and run the command again |
| Port 5173 doesn't open | **Ports** tab → right-click 5173 → *Open in Browser* |

Or take over the reference: `git checkout step-0 -- app`, then `cd app && npm install`.

The reference files of this step (the ones `sv` made, and the only ones you'll edit later):

<details>
<summary>📄 <code>app/package.json</code> as it is at <code>step-0</code></summary>

```json
{
	"name": "app",
	"version": "0.0.1",
	"private": true,
	"type": "module",
	"imports": {
		"#lib": "./src/lib/index.js",
		"#lib/*": "./src/lib/*"
	},
	"scripts": {
		"dev": "vite dev",
		"build": "vite build",
		"preview": "vite preview",
		"prepare": "svelte-kit sync || echo ''"
	},
	"devDependencies": {
		"@sveltejs/adapter-auto": "^8.0.0",
		"@sveltejs/kit": "^3.0.0",
		"@sveltejs/vite-plugin-svelte": "^7.2.0",
		"svelte": "^5.57.2",
		"vite": "^8.3.0"
	}
}
```

</details>

<details>
<summary>📄 <code>app/vite.config.js</code> as it is at <code>step-0</code></summary>

```js
import adapter from '@sveltejs/adapter-auto';
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

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	]
});
```

</details>

<details>
<summary>📄 <code>app/src/routes/+layout.svelte</code> as it is at <code>step-0</code></summary>

```svelte
<script>
	import favicon from '#lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
```

</details>

---

[Step 1 · The live feed as a table →](01-feed-table.md)

# Step 9 · The whole twin in containers

[← Step 8](08-flood-time.md) · [Guide overview](README.md)

**You build:** a production version of the twin, packaged as two Docker images and started with **one command**: `docker compose up --build`. Then you break it on purpose, and load it with 1,000 simulated users.
**You learn:** building a SvelteKit app into plain files; nginx as web server and proxy; Dockerfiles (layers, caching, multi-stage builds, health checks); Docker Compose (services, networks, restart policies, profiles).
**Time:** about 75 minutes.
**Start from:** your step 8, or the tag `step-8`. In a Codespace, Docker is already installed. On a laptop, start Docker Desktop.

---

## Development vs production

Until now the twin ran in **development mode**: two terminals, a dev server that rebuilds on every save, a proxy you configured in Vite. Good for building, not for a city: it needs Node.js, it's slow to start, and it depends on your terminals staying open.

In production:

```
                         ┌──────────── docker compose: one private network ────────────┐
browser ── port 8080 ──▶ │  app  nginx: the built app, the flood layers                │
                         │       /api/…  ──▶  api  Python: the sensor API + its data   │
                         └─────────────────────────────────────────────────────────────┘
```

| Development (steps 0–8) | Production (this step) |
|---|---|
| `npm run dev`: Vite serves the source, rebuilds on save | `npm run build` once: plain HTML, JS and CSS files |
| Vite's `proxy` passes `/api` on | **nginx** serves the files and passes `/api` on |
| `python api/main.py` in a terminal | The API in its own **container** |
| Two terminals you keep open | `docker compose up`: both, restarted when they crash |

A **Docker image** is a frozen machine: an operating system, the programs, your code and your data, built from a recipe called a **Dockerfile**. A **container** is that image running. **Docker Compose** starts several containers together from one file, and puts them on a private network where they find each other by name.

Stop both terminals from step 8 (Ctrl+C). The twin will run in Docker from now on.

## 9.1 · Build the app into plain files

SvelteKit uses an **adapter** to decide what `npm run build` produces. `adapter-auto` (what `sv` gave you) guesses a hosting platform. We want plain files that any web server can serve: **`adapter-static`**. In `app/`:

```bash
npm uninstall @sveltejs/adapter-auto
npm install -D @sveltejs/adapter-static@4.0.1
```

In `vite.config.js`, change the import to `@sveltejs/adapter-static`, and the adapter line to:

```js
adapter: adapter({ fallback: 'index.html' })
```

**Why `fallback`?** There is no file for `/maplibre` or `/sensors`: every page is made in the browser (`ssr = false`, step 5). The fallback is one `index.html` that starts the app, and the app shows the right page for the address. nginx will answer every unknown address with it (9.3).

**Try it:**

```bash
npm run build
ls build
```

`build/` has `index.html`, `_app/` (the JavaScript and CSS) and your `layers/`. That folder is the whole app.

## 9.2 · The MapLibre worker in the build

There's a catch that only shows up in production. MapLibre loads its **web worker** from a separate file next to its own code (step 2). The dev server serves that file straight from `node_modules`. The production build bundles MapLibre into new files and leaves the worker file behind: the map stays empty, with an error in the console.

The fix: ask Vite to copy the worker file into the build and give you its address (`?url`), and tell MapLibre where it is. Create **`app/src/lib/maplibre-worker.js`**:

```js
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);
```

and import it at the top of `MapLibreMap.svelte`, before the map is made:

```js
import '#lib/maplibre-worker.js';
```

## 9.3 · nginx: what the dev server did

**nginx** is a small, fast web server. It does what Vite did in development: serve the app, and pass `/api/…` on to the API. Create **`app/nginx.conf`** step by step.

**a · The server and the app's files.** Every address that is not a file gets `index.html` (the fallback from 9.1):

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**b · The proxy.** Inside the Compose network, the API is reachable by its service name: `http://api:8000`. Strip `/api` like Vite's `rewrite` did:

```nginx
    resolver 127.0.0.11 valid=10s;
    set $api http://api:8000;

    location /api/ {
        rewrite ^/api/(.*)$ /$1 break;
        proxy_pass $api;
        proxy_read_timeout 10s;
    }
```

Why the `resolver` and the variable, instead of simply `proxy_pass http://api:8000`? With a fixed name, nginx looks up the API's address **once**, when it starts. It then refuses to start while the API is down, taking the whole twin offline, and it would keep using an old address if a recreated API container got a new one. `127.0.0.11` is Docker's own name server; with a variable, nginx asks it again every 10 seconds.

**c · File types.** nginx doesn't know `.mjs` (the MapLibre worker, 9.2) and would send it as a download, which browsers refuse to run as a worker:

```nginx
    location ~ \.mjs$ {
        types { }
        default_type application/javascript;
        try_files $uri =404;
    }
```

**d · The flood layers and caching.** Browsers keep copies of files. For the layers, tell them to **check** each time whether the file has changed (`no-cache`; nginx answers *304 Not Modified* when it hasn't, which is almost free). For the COGs, keep **no** copy (`no-store`): with an old copy, the browser asks for a piece "only if the file hasn't changed", and after a rebuild nginx answers with the whole 17 MB file instead, which the COG plugin can't use.

```nginx
    location /layers/ {
        types {
            image/tiff tif;
            application/geo+json geojson;
            application/json json;
        }
        add_header Cache-Control "no-cache";

        location ~ \.tif$ {
            add_header Cache-Control "no-store";
        }
    }
```

**e · Compression** of text files (not the `.tif`, which is already compressed):

```nginx
    gzip on;
    gzip_types application/json application/geo+json application/javascript text/css;
```

All of b–e go inside the `server { … }` block.

## 9.4 · The app image: `app/Dockerfile`

Building the app needs Node.js and 200 MB of `node_modules`. Serving it needs only nginx and the `build/` folder. A **multi-stage** Dockerfile does both, and keeps only the second:

```dockerfile
# Stage 1: build
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve
FROM nginx:1-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
```

Every line is a **layer** that Docker caches. The order matters: `package.json` is copied and `npm ci` runs **before** the rest of the code. As long as your packages don't change, a rebuild skips the slow `npm ci`, even when you change your code. (`npm ci` installs exactly what `package-lock.json` says.)

**`app/.dockerignore`**: what `COPY . .` must not copy. Your local `node_modules` and `build` are big, and rebuilt inside the image anyway:

```
node_modules
build
.svelte-kit
```

**Try it**, in `app/`:

```bash
docker build -t flood-twin-app:test .
docker images flood-twin-app
```

About 140 MB: the Node.js stage is gone.

## 9.5 · The API image: `api/Dockerfile`

The API isn't yours, but packaging it is part of deploying the twin. It needs `api/` **and** `data/`, so it's built from the repository folder (the **context**), and its Dockerfile lives in `api/`. Write it yourself, with these steps:

1. Start from `python:3.15-slim`; work in `/srv`.
2. Copy `api/requirements.txt` and `pip install --no-cache-dir -r` it **first** (caching, as in 9.4).
3. Copy `data/` and `api/`. The data goes **inside** the image: everyone who runs it replays exactly the same 30 days.
4. Don't run as root: `RUN useradd --create-home twin` and `USER twin`.
5. `EXPOSE 8000`.
6. A **health check**, so Docker knows when the API is actually ready, not just started. The slim image has no `curl`, so use Python:

   ```dockerfile
   HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
     CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)"
   ```

7. Start it: `CMD ["python", "api/main.py"]`.

**`.dockerignore`** in the **repository folder**: the context is the whole repository, including `app/node_modules`. Ignore everything except what the API needs:

```
*
!api/
!data/
```

## 9.6 · The whole twin: `docker-compose.yml`

In the repository folder. Two services:

```yaml
services:
  api:
    build:
      context: .
      dockerfile: api/Dockerfile
    image: flood-twin-api:1.0
    environment:
      REPLAY_START: ${REPLAY_START:-2026-11-04T03:00}
      REPLAY_SPEED: ${REPLAY_SPEED:-60}
    restart: unless-stopped

  app:
    build: ./app
    image: flood-twin-app:1.0
    ports:
      - "8080:80"
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped
```

| Line | Meaning |
|---|---|
| `build` / `image` | Build the image from this Dockerfile, and give it this name and version |
| `environment` | `${REPLAY_START:-…}`: the value from your terminal if you set one, otherwise the default |
| `restart: unless-stopped` | When the program crashes, Docker starts it again. Unless *you* stopped it |
| `ports: "8080:80"` | Port 8080 on your machine goes to port 80 in the container. The `api` service has **no** `ports`: nobody outside can reach it, only `app`, over the private network. One public door, not two |
| `depends_on … service_healthy` | Start `app` only when the API's health check passes |

**The load test** is a third, optional service. `profiles` keeps it out of a normal `docker compose up`:

```yaml
  loadtest:
    image: locustio/locust:2.47.0
    profiles: [loadtest]
    volumes:
      - ./loadtest:/mnt/locust
    command: -f /mnt/locust/locustfile.py --host http://app
    ports:
      - "8089:8089"
    depends_on:
      - app
```

`volumes` makes the folder `loadtest/` (already in the repository) visible inside the container. Read `loadtest/locustfile.py`: each simulated user behaves like your app.

## 9.7 · Run it

In the repository folder:

```bash
docker compose up --build
```

The first build downloads Python, Node.js and nginx, and takes a few minutes. When the log goes quiet, open port **8080**: your twin, from containers. In a second terminal:

```bash
docker compose ps                  # both services; the API should say (healthy)
docker images | grep flood-twin    # your two images and their size
```

## 9.8 · Break it, then load it

**Stop the API** (an operator's mistake):

```bash
docker compose stop api
```

The app goes *Delayed*, then *Feed lost* (step 4). `docker compose start api`: *Live* again within 10 s, without reloading the page, and without restarting nginx (that's the `resolver`, 9.3b).

**Crash the API** (a bug):

```bash
docker compose exec api python -c "import os, signal; os.kill(1, signal.SIGTERM)"
docker compose ps
```

It comes back by itself: `restart: unless-stopped`.

**Load it:**

```bash
docker compose --profile loadtest up -d loadtest
```

Open port **8089**: 1,000 users, spawn rate 100, **Start**. After a minute, look at the **Statistics**: which request is slowest, and why? Then give the API a quarter of a CPU: in `docker-compose.yml`, on the line **below the API's `image:` line**, add `cpus: 0.25` (same indentation), run `docker compose up -d api`, and run the test again. Stop Locust with `docker compose stop loadtest`.

**Clean up:** `docker compose down`.

## Check

- [ ] `docker compose up --build` starts both services; `docker compose ps` shows the API as *healthy*.
- [ ] Port 8080: the map with sensors, *Live*, both pages, the popup charts, both flood layers and the time bar. No errors in the console.
- [ ] `docker images`: the app image is about 140 MB.
- [ ] Port 8000 is **not** reachable from your browser while only Docker runs: the API is private.
- [ ] Stopping and crashing the API behave as in 9.8.
- [ ] `curl -I http://localhost:8080/layers/depth_timeseries_100yr.tif` shows `Cache-Control: no-store`.

Commit your work. You've built the whole twin.

## Stuck?

| Problem | Try |
|---|---|
| The map is empty on port 8080, console: *worker* or *MIME type* errors | 9.2 (`setWorkerUrl`) and 9.3c (`.mjs`) |
| `/maplibre` gives *404 Not Found* after a reload | `try_files … /index.html` in nginx, and `fallback: 'index.html'` in the adapter |
| *Feed lost* from the start, nginx log says `host not found` or `502` | Is the service called `api` in the Compose file? Is the `resolver` line there? |
| `app` never starts: *dependency failed to start: container … is unhealthy* | The health check fails: `docker compose logs api`. Is the API listening on `0.0.0.0`, port 8000? |
| `npm ci` fails: *package-lock.json … not in sync* | Run `npm install` in `app/` and commit the new `package-lock.json` |
| The build is slow every time | `.dockerignore` is missing: Docker sends `node_modules` to the build each time |
| The flood layer stays empty after a rebuild | Reload the page once; check the `no-store` rule for `.tif` |

Compare: `git diff step-9 -- app docker-compose.yml api/Dockerfile .dockerignore`.

<details>
<summary>📄 <code>app/nginx.conf</code> as it is at <code>step-9</code></summary>

```nginx
# Step 9: nginx does in production what the Vite dev server did in development:
# serve the app, and pass /api/… on to the sensor API.

server {
    listen 80;
    root /usr/share/nginx/html;

    # Find the API by its name on the Compose network, and look the name up again every
    # 10 s. Without this, nginx looks it up once at start: it refuses to start while the API
    # is down, and keeps using an old address after the API container is recreated.
    resolver 127.0.0.11 valid=10s;
    set $api http://api:8000;

    # /api/live → http://api:8000/live (the same as the proxy in vite.config.js)
    location /api/ {
        rewrite ^/api/(.*)$ /$1 break;
        proxy_pass $api;
        proxy_read_timeout 10s;
    }

    # The flood layers (step 7). Browsers may keep a copy, but must ask "has it changed?" each
    # time ("no-cache"); nginx answers "304 Not Modified" if not, which costs almost nothing.
    # We first used "max-age=3600" (keep it for an hour without asking): after we updated a
    # layer, browsers kept showing the old file for up to an hour. Files whose name never
    # changes when their content does must be revalidated.
    # nginx also answers HTTP range requests by itself, which the COG plugin needs.
    location /layers/ {
        types {
            image/tiff tif;
            application/geo+json geojson;
            application/json json;
        }
        add_header Cache-Control "no-cache";

        # The COGs (.tif): keep no copy at all ("no-store"). The COG plugin asks for small pieces
        # (range requests). With an old copy in its cache, the browser asks "this piece, but only
        # if the file hasn't changed" (If-Range). After an update, or after rebuilding this
        # container, the file has a new version tag, so nginx sends the WHOLE file instead,
        # which the plugin can't use: the layer stays empty until the next reload. The plugin
        # keeps the pieces it needs in memory, so nothing is lost by not caching them here.
        location ~ \.tif$ {
            add_header Cache-Control "no-store";
        }
    }

    # MapLibre's web worker is a .mjs file. nginx doesn't know that extension and would send it
    # as "application/octet-stream"; browsers refuse to run a worker that isn't JavaScript.
    location ~ \.mjs$ {
        types { }
        default_type application/javascript;
        try_files $uri =404;
    }

    # Every other address is a page of the app: answer with index.html, the app does the rest.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Compress text on the way out (not the .tif: it is already compressed).
    gzip on;
    gzip_types application/json application/geo+json application/javascript text/css;
}
```

</details>

<details>
<summary>📄 <code>app/Dockerfile</code> as it is at <code>step-9</code></summary>

```dockerfile
# Step 9: the production image of the web app. Two stages:
#
#   build   a full Node.js environment that turns the SvelteKit app into plain files
#   serve   only nginx and those files: no Node.js, no node_modules, no source code
#
# The final image contains only the second stage, so it is small and has little to attack.

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:26-slim AS build
WORKDIR /app

# Dependencies first, so Docker can cache them (see api/Dockerfile).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:1-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
```

</details>

<details>
<summary>📄 <code>app/.dockerignore</code> as it is at <code>step-9</code></summary>

```gitignore
# Step 9: not needed in the build, and rebuilt inside the image anyway.
node_modules
build
.svelte-kit
```

</details>

<details>
<summary>📄 <code>api/Dockerfile</code> as it is at <code>step-9</code></summary>

```dockerfile
# Step 9: the production image of the sensor API.
#
# Built from the repository root (see docker-compose.yml), because it needs both api/ and data/.
# The data goes INSIDE the image: whoever runs this image gets exactly the same 30 days.

FROM python:3.15-slim

WORKDIR /srv

# 1. Dependencies first. Docker caches every step: as long as requirements.txt doesn't change,
#    a rebuild skips this (slow) step, even when you change the code.
COPY api/requirements.txt api/
RUN pip install --no-cache-dir -r api/requirements.txt

# 2. Then the data and the code.
COPY data/ data/
COPY api/ api/

# 3. Don't run as root: if someone breaks into the API, they can't change the container.
RUN useradd --create-home twin
USER twin

EXPOSE 8000

# 4. How Docker knows the API is healthy (not just started): ask /health every 10 s.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)"

CMD ["python", "api/main.py"]
```

</details>

<details>
<summary>📄 <code>.dockerignore</code> as it is at <code>step-9</code></summary>

```gitignore
# Step 9: what Docker may see when it builds from the repository root (the API image).
# Everything is ignored, except what the API needs. Without this file Docker would first copy
# app/node_modules (hundreds of MB) to the build, and throw it away.
*
!api/
!data/
```

</details>

<details>
<summary>📄 <code>docker-compose.yml</code> as it is at <code>step-9</code></summary>

```yaml
# Step 9: the whole twin as services, started with one command:
#
#   docker compose up --build
#
# Then open port 8080. Stop with Ctrl+C, or `docker compose down`.

services:
  # The sensor API (Python). No "ports": it is NOT reachable from outside, only by the
  # other services on the Compose network, by its name: http://api:8000
  api:
    build:
      context: .
      dockerfile: api/Dockerfile
    image: flood-twin-api:1.0
    environment:
      REPLAY_START: ${REPLAY_START:-2026-11-04T03:00}
      REPLAY_SPEED: ${REPLAY_SPEED:-60}
    restart: unless-stopped # crashed? Docker starts it again

  # The web app: nginx serving the built SvelteKit app, and passing /api on to the API.
  app:
    build: ./app
    image: flood-twin-app:1.0
    ports:
      - "8080:80" # port 8080 on your machine → port 80 in the container
    depends_on:
      api:
        condition: service_healthy # wait until the API's health check passes
    restart: unless-stopped

  # Optional: a load test. Only starts with:  docker compose --profile loadtest up
  loadtest:
    image: locustio/locust:2.47.0
    profiles: [loadtest]
    volumes:
      - ./loadtest:/mnt/locust
    command: -f /mnt/locust/locustfile.py --host http://app
    ports:
      - "8089:8089" # Locust's web page
    depends_on:
      - app
```

</details>

<details>
<summary>📄 <code>app/src/lib/maplibre-worker.js</code> as it is at <code>step-9</code></summary>

```js
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
```

</details>

<details>
<summary>📄 <code>app/vite.config.js</code> as it is at <code>step-9</code></summary>

```js
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
```

</details>

**Why it was done this way, things to try, questions:** [STEPS.md, step 9](../STEPS.md#step-9--the-whole-twin-in-containers--step-9). Lab 7B ([LAB-7B.md](../LAB-7B.md)) does 9.7 and 9.8 with questions.

## What next?

- **Another map engine.** The branches `extra/cesium` and `extra/deck` add a 3D page with CesiumJS or deck.gl on top of step 9. See how little they change: `git diff step-9 extra-deck --stat`.
- **Your own data.** Replace the API with one for your city's sensors (see [Using another API](api.md#using-another-api)), and the flood files with your own model's output (step 7, *Going further*).
- **Share it.** Push your images to a registry (GitHub Container Registry, Docker Hub), so others can run your exact version with `docker compose up`, without building.

---

## Walkthrough: step 9 in small pieces, with all the code

Stop the dev server. Keep the API running in terminal 1 until 9.H.

### 9.A · A production build, and a surprise

In `app/`:

```bash
npm uninstall @sveltejs/adapter-auto
npm install -D @sveltejs/adapter-static@4.0.1
```

In `app/vite.config.js`, change the first line to:

```js
import adapter from '@sveltejs/adapter-static';
```

and the adapter line to:

```js
			// Build the app into plain files (HTML, JS, CSS) in build/. Every page is rendered in the
			// browser (ssr = false), so one fallback page is enough: the server answers every
			// address with index.html, and the app shows the right page.
			adapter: adapter({ fallback: 'index.html' })
```

Build it, and look at the result with Vite's preview server, which serves `build/` as a real server would (and uses the same `/api` proxy):

```bash
npm run build
ls build
npm run preview
```

Open port **4173**.

**You see:** the header, the banner and the status work, the Layers box is there... but the **map is empty**. The console (F12) shows an error about a **worker**. The dev server served MapLibre's worker file from `node_modules`; the build left it behind. Stop the preview (Ctrl+C).

### 9.B · Bring the worker along

Create **`app/src/lib/maplibre-worker.js`**:

```js
// MapLibre does its heavy work in a web worker, loaded from a separate file. The production
// build bundles MapLibre into new files and leaves the worker file behind.
// `?url` asks Vite to copy the worker file into the build and give us its address,
// and setWorkerUrl() tells MapLibre where to find it.
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);
```

At the top of `MapLibreMap.svelte`, after the `maplibre-gl` import:

```js
	import '#lib/maplibre-worker.js'; // so the map also works in the production build
```

```bash
npm run build
npm run preview
```

**You see:** on port 4173 the whole twin works, from the built files. `ls build/_app/immutable/assets` shows a file `maplibre-gl-worker.….mjs`. Stop the preview.

### 9.C · nginx serves the app, in a container

Create **`app/nginx.conf`** with only the essentials:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    # Every other address is a page of the app: answer with index.html, the app does the rest.
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Create **`app/Dockerfile`**:

```dockerfile
# Stage 1: build the app with Node.js
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve the built files with nginx. Only this stage ends up in the image.
FROM nginx:1-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
```

and **`app/.dockerignore`**:

```
node_modules
build
.svelte-kit
```

Build the image and run it, in `app/`:

```bash
docker build -t flood-twin-app:test .
docker run --rm -p 8080:80 flood-twin-app:test
```

**You see:** port 8080: the header and the Layers box, but two problems. A **red *Feed lost***: of course, nginx doesn't know the API yet, and answers `/api/live` with `index.html`. And an **empty map** again, with a console error about the worker: nginx doesn't know the `.mjs` file type, and sends the worker as `application/octet-stream`. Browsers only run a worker that is sent as JavaScript. Stop it with Ctrl+C.

Tell nginx about `.mjs`. In `app/nginx.conf`, inside `server { … }`, above `location /`:

```nginx
    # MapLibre's web worker is a .mjs file. nginx doesn't know that extension and would send it
    # as "application/octet-stream"; browsers refuse to run a worker that isn't JavaScript.
    location ~ \.mjs$ {
        types { }
        default_type application/javascript;
        try_files $uri =404;
    }
```

```bash
docker build -t flood-twin-app:test .
docker run --rm -p 8080:80 flood-twin-app:test
```

**You see:** the map is back. Still *Feed lost*: that's 9.F. Stop with Ctrl+C.

Run `docker build` a second time: almost every line says `CACHED`, and it's done in a second. Change a `.svelte` file and build again: `npm ci` is still `CACHED`, only the steps after `COPY . .` run again.

### 9.D · The API in a container

Create **`api/Dockerfile`**:

```dockerfile
# Built from the repository folder (see docker-compose.yml), because it needs both api/ and data/.
# The data goes INSIDE the image: whoever runs this image gets exactly the same 30 days.
FROM python:3.15-slim

WORKDIR /srv

# 1. Dependencies first, so Docker can cache them.
COPY api/requirements.txt api/
RUN pip install --no-cache-dir -r api/requirements.txt

# 2. Then the data and the code.
COPY data/ data/
COPY api/ api/

# 3. Don't run as root.
RUN useradd --create-home twin
USER twin

EXPOSE 8000

# 4. How Docker knows the API is healthy (not just started): ask /health every 10 s.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)"

CMD ["python", "api/main.py"]
```

and, in the **repository folder**, **`.dockerignore`**:

```
*
!api/
!data/
```

Stop the API in terminal 1 (port 8000 must be free), then in the repository folder:

```bash
docker build -f api/Dockerfile -t flood-twin-api:test .
docker run --rm -p 8000:8000 flood-twin-api:test
```

**You see:** port 8000 with `/docs`: the API, now from a container. After about 10 s, `docker ps` (in another terminal) says `(healthy)`. Stop it with Ctrl+C.

### 9.E · Both together: Docker Compose

Create **`docker-compose.yml`** in the repository folder:

```yaml
# The whole twin as services, started with one command:  docker compose up --build

services:
  # The sensor API. No "ports": only the other services can reach it, by its name: http://api:8000
  api:
    build:
      context: .
      dockerfile: api/Dockerfile
    image: flood-twin-api:1.0
    environment:
      REPLAY_START: ${REPLAY_START:-2026-11-04T03:00}
      REPLAY_SPEED: ${REPLAY_SPEED:-60}
    restart: unless-stopped # crashed? Docker starts it again

  # The web app: nginx serving the built app, and passing /api on to the API.
  app:
    build: ./app
    image: flood-twin-app:1.0
    ports:
      - "8080:80" # port 8080 on your machine → port 80 in the container
    depends_on:
      api:
        condition: service_healthy # wait until the API's health check passes
    restart: unless-stopped
```

```bash
docker compose up --build
```

**You see:** both services start; `app` waits until `api` is healthy. Port 8080: still *Feed lost*. Both containers run, but nginx doesn't pass `/api` on yet. Stop with Ctrl+C.

### 9.F · nginx passes `/api` on: the simple way, and its weak spot

Add to `app/nginx.conf`, inside `server { … }`:

```nginx
    location /api/ {
        rewrite ^/api/(.*)$ /$1 break;
        proxy_pass http://api:8000;
    }
```

```bash
docker compose up --build -d
```

(`-d`: in the background. `docker compose logs -f` shows the logs, `docker compose ps` the services.)

**You see:** port 8080: *Live*! The whole twin works from containers.

Now an ordinary day at work: the API is stopped for maintenance, and meanwhile the web server restarts (an update, a reboot):

```bash
docker compose stop api
docker compose restart app
docker compose ps
docker compose logs app | tail -3
```

**You see:** `app` keeps *Restarting*, and its log says `host not found in upstream "api"`. nginx looks up the name `api` **once, when it starts**, and refuses to start when it can't. Reload port 8080: **nothing at all**, not even a *Feed lost* page. A problem in the API has taken the whole twin offline. Start the API again (`docker compose start api`), and nginx recovers.

### 9.G · nginx passes `/api` on: the robust way

Replace the `location /api/` block with:

```nginx
    # Find the API by its name on the Compose network, and look the name up again every 10 s.
    # Without this, nginx looks it up once at start: it refuses to start while the API is down,
    # and would keep using an old address if the API container got a new one.
    resolver 127.0.0.11 valid=10s;
    set $api http://api:8000;

    # /api/live → http://api:8000/live (the same as the proxy in vite.config.js)
    location /api/ {
        rewrite ^/api/(.*)$ /$1 break;
        proxy_pass $api;
        proxy_read_timeout 10s;
    }
```

`127.0.0.11` is Docker's own name server. With the address in a variable, nginx looks it up when a request comes in, and again every 10 seconds, instead of once at start.

Rebuild, then repeat the same test:

```bash
docker compose up --build -d
docker compose stop api
docker compose restart app
docker compose ps
```

**You see:** `app` is *Up*. Port 8080 shows the twin with *Feed lost* and *Flood warnings unknown*: the page tells the truth instead of disappearing. `docker compose start api`: *Live* again within 10 s, without touching nginx.

### 9.H · Caching and compression

The flood layers. Browsers must **ask** whether a layer has changed (`no-cache`), and keep **no** copy of the COGs (`no-store`), or a rebuilt container can leave the flood layer empty:

```nginx
    location /layers/ {
        types {
            image/tiff tif;
            application/geo+json geojson;
            application/json json;
        }
        add_header Cache-Control "no-cache";

        location ~ \.tif$ {
            add_header Cache-Control "no-store";
        }
    }

    # Compress text on the way out (not the .tif: it is already compressed).
    gzip on;
    gzip_types application/json application/geo+json application/javascript text/css;
```

```bash
docker compose up --build -d
curl -I http://localhost:8080/layers/depth_timeseries_100yr.json
curl -I http://localhost:8080/layers/depth_timeseries_100yr.tif
```

**You see:** `Cache-Control: no-cache` for the JSON, `no-store` for the `.tif`. In the browser: both flood layers and the time bar work.

`docker compose down` stops everything.

### 9.I · Break it

```bash
docker compose stop api       # an operator stops the API
docker compose start api      # and starts it again
docker compose exec api python -c "import os, signal; os.kill(1, signal.SIGTERM)"   # a crash
docker compose ps             # the API comes back by itself
```

**You see:** *Feed lost* after the stop, *Live* within 10 s after the start; after the crash, the API restarts by itself (`restart: unless-stopped`) and is *healthy* again after a few seconds.

### 9.J · The load test

Add a third service to `docker-compose.yml`, under `services:`:

```yaml
  # Optional: a load test. Only starts with:  docker compose --profile loadtest up
  loadtest:
    image: locustio/locust:2.47.0
    profiles: [loadtest]
    volumes:
      - ./loadtest:/mnt/locust
    command: -f /mnt/locust/locustfile.py --host http://app
    ports:
      - "8089:8089" # Locust's web page
    depends_on:
      - app
```

```bash
docker compose --profile loadtest up -d loadtest
```

**You see:** port 8089, Locust. 1,000 users, spawn rate 100, **Start**. After a minute, the **Statistics** tab: which request is slowest? Stop with `docker compose stop loadtest`, and everything with `docker compose down`.

That's the reference of this step, and the whole twin. Commit.


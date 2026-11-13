# Lab 7B · The whole twin in containers, then stress it

**Day 7, Wednesday 18 November 2026 · 16:35–17:45 IST (70 minutes)**
*Stress testing and containerisation: Dockerizing the entire twin workflow for deployment in production environments.*

In Lab 7A the twin ran in **development mode**: two terminals, a dev server, hot reload. That is how you build it, not how you run it for a city. In this lab you package the whole twin into **containers**, start it with **one command**, then **break it** and **load it** to see how it behaves.

Continue in the Codespace from Lab 7A. Everything you need is in `docker-compose.yml`, `api/Dockerfile`, `app/Dockerfile` and `app/nginx.conf`. The full explanation is in [STEPS.md](STEPS.md), step 9.

---

## 0 · Clean start (2 min)

Stop both terminals from Lab 7A (**Ctrl+C** in each). Put any changes you made aside and get the original:

```bash
git stash
git checkout main
```

---

## 1 · One command for the whole twin (15 min)

```bash
docker compose up --build
```

The first build downloads the base images (Python, Node.js, nginx) and takes **about a minute** in a Codespace. Read the next part while it runs.

**What is being built** (open the files in the editor):

| Service | Built from | What runs in it | Port |
|---|---|---|---|
| `api` | `api/Dockerfile` | The sensor API (Python) **with the 30 days of data inside the image** | *none* |
| `app` | `app/Dockerfile` | **nginx**, serving the built web app and the flood layers, and passing `/api/…` on to the API | **8080** |

When the log goes quiet, open port **8080** (pop-up or **Ports** tab). It is the same twin as in Lab 7A, now served from containers.

In a **second terminal**:

```bash
docker compose ps                  # both services, and the API's health
docker images | grep flood-twin    # the two images and their size
```

**Questions** (look at the files):

1. `app/Dockerfile` has **two stages**. What is in the first one, what ends up in the second, and why is the final image (about 140 MB) so much smaller than the build environment?
2. The `api` service has **no `ports:`**. Who can still reach it, and why is that a good idea?
3. The data is **inside** the API image. Good for reproducibility. What happens when the data changes every day?

---

## 2 · Break it on purpose (10 min)

A twin is only useful if it tells the truth when something fails.

**a · Stop the API** (as an operator would):

```bash
docker compose stop api
```

Watch the app: *Delayed*, then *Feed lost* after 30 seconds, and the map turns grey. Then:

```bash
docker compose start api
```

It is *Live* again within about 10 seconds, without reloading the page.

**b · Crash the API** (as a bug would). This stops the API's main process from inside the container:

```bash
docker compose exec api python -c "import os, signal; os.kill(1, signal.SIGTERM)"
```

Run `docker compose ps` a few times. The API comes back by itself, *healthy* after about 6 seconds: that is `restart: unless-stopped` in `docker-compose.yml`.

**Question:** in (a) Docker did **not** restart the API, in (b) it did. Why does Docker treat the two differently? Which one would you want at 3 a.m. during a cyclone?

---

## 3 · Stress test: how many people can it take? (25 min)

During a flood, everyone opens the map at once. **Locust** simulates that: each simulated user behaves like the real app, opening the page, asking for `/api/live` every 10 seconds, and now and then opening a sensor's **Month** chart (`loadtest/locustfile.py`).

In the second terminal, start Locust on its own, in the background (the twin keeps running):

```bash
docker compose --profile loadtest up -d loadtest
```

Open port **8089** (Locust's page).

**Run 1, normal load:** 100 users, spawn rate 20 → **Start**. After a minute, read the **Statistics** tab: requests per second, failures, and the response times (*Median*, *95%ile*). Then **Stop**.

**Run 2, a crowd:** 1,000 users, spawn rate 100. Which request is the slowest? Why that one? (Hint: look at what `/history/…/hourly` does in `api/main.py`.)

**Run 3, a small server:** give the API only a quarter of a CPU. In `docker-compose.yml`, find the API's `image:` line and add `cpus: 0.25` right below it, with the same indentation:

```yaml
    image: flood-twin-api:1.0
    cpus: 0.25
```

(Careful: `api:` appears twice in the file; the second one, under `depends_on:`, is the wrong place.) Apply it; Docker recreates only the API:

```bash
docker compose up -d api
```

Repeat run 2 and compare. For reference, what we measured in a 2-core Codespace (1,000 users, 30 seconds):

| API | Requests served | Failures | Average | Slowest *Month* chart |
|---|---|---|---|---|
| No limit | 5,000 | 0 | 0.09 s | 0.3 s |
| ¼ CPU | 3,830 | 0 | 3.0 s | 7.9 s |

Your numbers will differ a little: Locust and the twin share the same small machine. What matters is **which** request suffers first, and **why**.

**Questions:**

1. Nothing *failed*, but would a resident wait 8 seconds for a chart during a flood? Where is your limit?
2. Name three ways to make run 3 fast again. (Think: do the work once instead of on every request; more copies of the API; a bigger machine; send static files from somewhere else.) Which is cheapest?
3. Remove the `cpus:` line again and run `docker compose up -d api`. Stop Locust with `docker compose stop loadtest`.

---

## 4 · From one machine to many (10 min, discussion)

Your twin now runs anywhere Docker runs, from one file. Discuss in your group:

- **Reproducible and reusable:** a colleague in Dresden wants to run exactly your version. What do you send them? (Hint: an image **registry**, and a version tag instead of `1.0` forever.)
- **One machine is enough until…** The Resilient Hydro Twin runs as Docker Compose on **one** virtual machine. When would that stop being enough: more users, more cities, no downtime allowed?
- **Kubernetes** runs containers across many machines, restarts them, and adds copies under load. What would it cost a small research team to run it? When is a bigger single machine plus a CDN the better answer?

---

## 5 · Clean up (1 min)

```bash
docker compose down
```

This stops and removes the containers and their network. The images stay, so the next `docker compose up` is fast.

---

## Done early?

- **Replay another event:** `REPLAY_START=2026-11-06T00:00 docker compose up -d`. Follow `REPLAY_START` from the command line through `docker-compose.yml` into `api/main.py`.
- **Watch the cache:** change one line in `api/main.py` and run `docker compose up --build`. Which build steps say `CACHED`, and why does the order of the lines in `api/Dockerfile` matter?
- **Another engine in Docker:** `git checkout extra-deck` (or `extra-cesium`), then `docker compose up --build` and open the new page. What did the extra have to change in the Docker files? (`git diff step-9 extra-cesium -- app/Dockerfile`)

---

## If something doesn't work

| Problem | Try |
|---|---|
| `docker: command not found` | Are you in the Codespace? Docker is part of its setup |
| The build stops with a network error | Run `docker compose up --build` again: downloads sometimes fail once |
| Port 8080 or 8089 doesn't open | **Ports** tab → right-click → *Open in Browser* |
| A flood layer stays empty after a rebuild | Reload the page once |
| `port is already allocated` | Something else uses the port: `docker compose down`, then try again |

// Step 5: ONE sensor feed for the whole app.
//
// Until step 4 the page did the polling itself. Now there are several pages (the map, the
// sensor table, and more to come), and they must all show the same data without each asking
// the API on its own. So the feed lives here, in a shared store, and the layout starts it once.
//
// The file name ends in .svelte.js so that $state and $derived work outside a component.

import { toGeoJSON, classify } from '#lib/sensors.js';

const POLL_MS = 10_000; // ask the API every 10 s (= 10 minutes of replayed data)
const TIMEOUT_MS = 5_000; // give up on a request that takes longer than this
const FEED_LOST_AFTER_MS = 30_000; // no good answer for this long: the feed is lost

class Feed {
	sites = $state([]); // from /api/sites: where each sensor is
	live = $state(null); // from /api/live: the latest reading of each sensor

	levels = $state({}); // step 3: the level of each sensor
	changes = $state({}); // step 3: how often each level changed since the app opened

	polling = $state(true); // step 4: Pause / Resume
	lastOk = $state(null); // when (browser clock) we last got a good answer
	lastError = $state(null); // what went wrong last time, if anything
	now = $state(Date.now()); // ticks every second, so "… s ago" stays up to date

	// 'connecting', 'live', 'delayed' or 'lost'
	status = $derived(
		this.lastOk == null
			? this.lastError ? 'lost' : 'connecting'
			: !this.lastError ? 'live'
			: this.now - this.lastOk < FEED_LOST_AFTER_MS ? 'delayed'
			: 'lost'
	);

	geojson = $derived(toGeoJSON(this.sites, this.live, this.levels));

	alerts = $derived(
		this.sites
			.filter((s) => this.levels[s.id] === 'danger' || this.levels[s.id] === 'warning')
			.sort((a, b) => (this.levels[b.id] === 'danger') - (this.levels[a.id] === 'danger'))
	);

	untrusted = $derived(
		this.sites.filter((s) => this.levels[s.id] === 'stale' || this.levels[s.id] === 'suspect').length
	);

	readingFor = (id) => this.live?.readings.find((r) => r.site === id);

	secondsAgo = (t) => Math.round((this.now - t) / 1000);

	// Arrow functions, so they can be used directly as onclick={feed.poll}.
	poll = async () => {
		try {
			if (this.sites.length === 0) this.sites = (await getJSON('/api/sites')).sites; // only once
			this.live = await getJSON('/api/live');
			this.#updateLevels();
			this.lastOk = Date.now();
			this.lastError = null;
		} catch (e) {
			// Keep the last good data on screen, but remember that this attempt failed.
			this.lastError = e.name === 'TimeoutError' ? 'the API did not answer in time' : e.message;
		}
	};

	togglePolling = () => {
		this.polling = !this.polling;
	};

	#updateLevels() {
		const next = {};
		for (const site of this.sites) {
			const level = classify(site, this.readingFor(site.id), this.levels[site.id]);
			const before = this.levels[site.id];
			if (before && before !== level) this.changes[site.id] = (this.changes[site.id] ?? 0) + 1;
			next[site.id] = level;
		}
		this.levels = next;
	}

	// Start polling. Returns a function that stops it again.
	start() {
		let timer;
		let stopped = false;
		const tick = async () => {
			if (this.polling) await this.poll();
			if (!stopped) timer = setTimeout(tick, POLL_MS); // wait for the answer, then schedule
		};
		tick();
		const clock = setInterval(() => (this.now = Date.now()), 1000);
		return () => {
			stopped = true;
			clearTimeout(timer);
			clearInterval(clock);
		};
	}
}

// Fetch JSON, but never wait forever: a hanging server must count as a failure too.
async function getJSON(url) {
	const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (!res.ok) throw new Error(`${url} answered ${res.status}`);
	return res.json();
}

// The one and only feed. Every page imports this same object.
export const feed = new Feed();

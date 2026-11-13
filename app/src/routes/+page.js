import { redirect } from '@sveltejs/kit';

// Step 5: the home address has no page of its own; it sends you to the map.
export function load() {
	redirect(307, '/maplibre');
}

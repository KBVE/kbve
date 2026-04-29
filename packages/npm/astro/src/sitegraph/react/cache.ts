import { atom } from 'nanostores';
import type { SiteGraphData } from '../types';

interface CacheState {
	data: SiteGraphData | null;
	error: string | null;
	promise: Promise<SiteGraphData> | null;
}

const $cache = atom<CacheState>({ data: null, error: null, promise: null });

/**
 * Single-flight fetch for the site graph endpoint.
 *
 * SiteGraph + Backlinks both consume `/api/sitegraph.json`; without this
 * cache they each kick off their own `fetch` on every page open. The atom
 * dedupes in-flight requests and persists the parsed payload across
 * navigations within a SPA-style session.
 *
 * Pass a custom `endpoint` if a consumer site mounts the API at a
 * different path. The cache is keyed by endpoint internally.
 */
export function fetchSiteGraph(
	endpoint = '/api/sitegraph.json',
): Promise<SiteGraphData> {
	const state = $cache.get();
	if (state.data) return Promise.resolve(state.data);
	if (state.promise) return state.promise;

	const promise = fetch(endpoint)
		.then((res) => {
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return res.json() as Promise<SiteGraphData>;
		})
		.then((data) => {
			$cache.set({ data, error: null, promise: null });
			return data;
		})
		.catch((err) => {
			const message = err instanceof Error ? err.message : String(err);
			$cache.set({ data: null, error: message, promise: null });
			throw err;
		});

	$cache.set({ ...state, promise });
	return promise;
}

/** Reset the cache. Useful for tests; rarely needed in app code. */
export function resetSiteGraphCache(): void {
	$cache.set({ data: null, error: null, promise: null });
}

export const $siteGraphCache = $cache;

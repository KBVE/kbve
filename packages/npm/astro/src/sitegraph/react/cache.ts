import { atom } from 'nanostores';
import type { SiteGraphData } from '../types';
import { fetchViaWorker } from './worker-client';

interface CacheState {
	data: SiteGraphData | null;
	error: string | null;
	promise: Promise<SiteGraphData> | null;
}

const $cache = atom<CacheState>({ data: null, error: null, promise: null });

function directFetch(endpoint: string): Promise<SiteGraphData> {
	return fetch(endpoint).then((res) => {
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json() as Promise<SiteGraphData>;
	});
}

/**
 * Single-flight fetch for the site graph endpoint.
 *
 * SiteGraph + Backlinks both consume `/api/sitegraph.json`; without this
 * cache they each kick off their own `fetch` on every page open. The atom
 * dedupes in-flight requests and persists the parsed payload across
 * navigations within a SPA-style session.
 *
 * If a SharedWorker has been wired via `createSiteGraphWorker` /
 * `setSiteGraphWorker`, the request is delegated to the worker so all
 * tabs share the same cached payload. If the worker rejects (CSP, blob
 * URL revoked, structured-clone surprise, anything) the cache falls
 * back to a direct `fetch` so the graph renders rather than dying with
 * "Graph unavailable".
 */
export function fetchSiteGraph(
	endpoint = '/api/sitegraph.json',
): Promise<SiteGraphData> {
	const state = $cache.get();
	if (state.data) return Promise.resolve(state.data);
	if (state.promise) return state.promise;

	const workerPromise = fetchViaWorker(endpoint);
	const base = workerPromise
		? workerPromise.catch((err) => {
				if (typeof console !== 'undefined') {
					console.warn(
						'[sitegraph] worker fetch failed, falling back to direct fetch:',
						err,
					);
				}
				return directFetch(endpoint);
			})
		: directFetch(endpoint);

	const promise = base
		.then((data) => {
			$cache.set({ data, error: null, promise: null });
			return data;
		})
		.catch((err) => {
			const message = err instanceof Error ? err.message : String(err);
			if (typeof console !== 'undefined') {
				console.error('[sitegraph] fetch failed:', err);
			}
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

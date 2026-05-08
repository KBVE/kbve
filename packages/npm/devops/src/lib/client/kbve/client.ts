/**
 * Typed openapi-fetch client for the KBVE API.
 *
 * Uses the spec-derived `paths` types from `./openapi-types` so call sites
 * get full autocomplete on URL templates, path params, query strings, and
 * response bodies.
 *
 * `createKbveClient` is the factory most consumers want — pass a baseUrl
 * (or rely on the same-origin default `/`) and you get back a typed
 * `Client<paths>`. Auth + error normalization land via separate middleware
 * in `./auth.ts` and `./errors.ts`.
 *
 * For one-off scripts that don't need a custom client, the convenience
 * `kbveApi` export is a singleton client pointed at the same-origin root,
 * which is what the astro-kbve frontend wants by default (kbve.com →
 * kbve.com/api/v1/...).
 */

import createClient, { type Client, type ClientOptions } from 'openapi-fetch';
import type { paths } from './openapi-types';

/** Strongly-typed alias for the KBVE openapi-fetch client. Re-exported so
 * callers can annotate their own helpers without re-deriving the generic. */
export type KbveClient = Client<paths>;

/** Base URL the same-origin singleton points at. Same-origin is correct
 * for both prod (kbve.com fronts both static + API) and local dev (the
 * dev server proxies /api to axum-kbve). Override via `createKbveClient`
 * for cross-origin tools / scripts. */
const DEFAULT_BASE_URL = '/';

/** Factory — build a typed client with custom options. Pass `baseUrl` for
 * tools / scripts hitting `https://kbve.com` from outside the browser, or
 * `headers` to seed a static API key for server-to-server callers. */
export function createKbveClient(options: ClientOptions = {}): KbveClient {
	return createClient<paths>({
		baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
		...options,
	});
}

/** Same-origin singleton. The right default for browser code in
 * astro-kbve. Server-side / cross-origin callers should use
 * `createKbveClient({ baseUrl: '...' })` instead so they don't share auth
 * middleware with the browser instance. */
export const kbveApi: KbveClient = createKbveClient();

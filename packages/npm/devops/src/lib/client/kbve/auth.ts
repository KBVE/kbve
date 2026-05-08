/**
 * Bearer token middleware for the KBVE API client.
 *
 * Pluggable design — the consumer provides a token resolver (sync or
 * async). The middleware calls it on every request, attaches the
 * `Authorization: Bearer <token>` header when a token is available, and
 * leaves the request unmodified otherwise so anonymous endpoints (health,
 * public profile lookup, OSRS / MC data) keep working.
 *
 * Usage:
 *
 *     import { kbveApi, withBearerAuth } from '@kbve/devops';
 *     import { getSupabaseToken } from '@/lib/auth';
 *
 *     kbveApi.use(withBearerAuth(getSupabaseToken));
 *
 * The resolver is called for every request, so it should be cheap. If
 * fetching the token is expensive, cache it inside the resolver itself.
 */

import type { Middleware } from 'openapi-fetch';

/** Returns a string for "have a token", `null`/`undefined` for "anonymous
 * request". Throwing aborts the request (the underlying openapi-fetch
 * `onRequest` propagates the error). */
export type BearerTokenResolver = () =>
	| string
	| null
	| undefined
	| Promise<string | null | undefined>;

/** Build a middleware that injects `Authorization: Bearer <token>` from
 * the resolver. Skip injection when the resolver returns a falsy value so
 * anonymous endpoints aren't accidentally tagged with an empty bearer. */
export function withBearerAuth(resolver: BearerTokenResolver): Middleware {
	return {
		async onRequest({ request }) {
			// Don't clobber an explicit Authorization header set by the
			// caller (e.g. an admin token override). The resolver only
			// fills in the gap.
			if (request.headers.has('authorization')) return request;

			const token = await resolver();
			if (!token) return request;

			request.headers.set('authorization', `Bearer ${token}`);
			return request;
		},
	};
}

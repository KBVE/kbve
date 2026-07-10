import {
	apiFetch as droidApiFetch,
	ApiError,
	type ApiFetchOptions,
} from '@kbve/droid';
import { getAccessToken } from '@kbve/astro';
import { DASH_PROXY_BASE } from '@/components/rnweb/dashProxyBase';

export { ApiError };
export type { ApiFetchOptions };

/**
 * App-level API fetch. Supplies the KBVE `apiBase` (dev proxy prefix in local
 * dev, same-origin in prod) so every caller shares one base-URL + auth path.
 * See `@kbve/droid`'s `apiFetch` for the underlying contract.
 */
export function apiFetch<T>(
	path: string,
	opts: ApiFetchOptions = {},
): Promise<T> {
	return droidApiFetch<T>(path, { apiBase: DASH_PROXY_BASE, ...opts });
}

/**
 * Authenticated variant — resolves the current Supabase access token and
 * attaches it. Throws {@link ApiError} 401 when signed out.
 */
export async function authedApiFetch<T>(
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const token = await getAccessToken();
	if (!token) {
		throw new ApiError('not authenticated', 401, 'not_authenticated');
	}
	return droidApiFetch<T>(path, {
		apiBase: DASH_PROXY_BASE,
		token,
		...init,
	});
}

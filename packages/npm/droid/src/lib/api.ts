/**
 * Unified API fetch for the KBVE web + mobile clients.
 *
 * One place for base-URL join, bearer auth, JSON headers, error parsing, and
 * 204 handling — so callers stop reimplementing `authedFetch`/`publicGet` per
 * component (which drifted and caused base-URL/CORS bugs). The `apiBase` is
 * injected by the app (web dev = same-origin dev proxy, web prod = '', mobile
 * = absolute origin) so this module stays platform-agnostic.
 */

export class ApiError extends Error {
	status: number;
	code?: string;
	constructor(message: string, status: number, code?: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
	}
}

async function parseApiError(res: Response): Promise<ApiError> {
	let detail = '';
	let code: string | undefined;
	try {
		const txt = await res.text();
		try {
			const parsed = JSON.parse(txt) as {
				message?: string;
				error?: string;
				detail?: string;
			};
			detail = parsed.message || parsed.error || parsed.detail || txt;
			code = parsed.error;
		} catch {
			detail = txt;
		}
	} catch {
		/* body already consumed or unavailable */
	}
	return new ApiError(detail || res.statusText, res.status, code);
}

export interface ApiFetchOptions extends RequestInit {
	/** Bearer token; sets `Authorization` when present. */
	token?: string | null;
	/** Origin/prefix joined before `path`. '' = same-origin. */
	apiBase?: string;
}

/**
 * Fetch `${apiBase}${path}`, attaching the bearer token + JSON headers,
 * throwing {@link ApiError} on non-2xx, and returning parsed JSON (or
 * `undefined` for 204).
 */
export async function apiFetch<T>(
	path: string,
	opts: ApiFetchOptions = {},
): Promise<T> {
	const { token, apiBase = '', ...init } = opts;
	const headers = new Headers(init.headers);
	if (token) headers.set('Authorization', `Bearer ${token}`);
	if (!headers.has('Accept')) headers.set('Accept', 'application/json');
	if (init.body && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}
	const res = await fetch(`${apiBase}${path}`, { ...init, headers });
	if (!res.ok) throw await parseApiError(res);
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

/**
 * Error normalization helpers for the KBVE API client.
 *
 * openapi-fetch already returns a `{ data, error, response }` discriminated
 * union, so consumers can branch on `error` cleanly. The helpers here build
 * on top of that:
 *
 *   - `KbveApiError` — exception-throwing wrapper for code paths that prefer
 *     try/catch over result-style branching (e.g. inside react-query
 *     `queryFn` callbacks)
 *   - `unwrap(...)` — consumes the `{ data, error }` tuple, returns `data`,
 *     throws `KbveApiError` on error / non-2xx
 *   - `extractErrorMessage(error)` — best-effort string for logging / UI
 *     toasts when the upstream RPC returned a structured `{error: "..."}`
 *     body
 *
 * The Rust handlers consistently shape errors as
 * `Json(json!({ "error": "<message>" }))`, so the extractor checks that
 * shape first and falls back to the HTTP status text for cases without a
 * JSON body (timeout, 502 from the load balancer, etc).
 */

/** Thrown by `unwrap()` when the API call fails or the response is non-2xx. */
export class KbveApiError extends Error {
	/** HTTP status code from the upstream response, or `0` if the request
	 * never reached a server (network error / abort). */
	readonly status: number;
	/** Raw error body returned by openapi-fetch — the spec-derived error
	 * schema if one exists, otherwise the parsed JSON / text body. Useful
	 * for narrowing when the consumer knows the endpoint's error shape. */
	readonly body: unknown;

	constructor(message: string, status: number, body: unknown) {
		super(message);
		this.name = 'KbveApiError';
		this.status = status;
		this.body = body;
	}
}

/** Best-effort error message extraction. Handles:
 *   - The Rust `{ "error": "<message>" }` shape used across axum-kbve
 *   - openapi-fetch's `Response` instance (uses `statusText`)
 *   - Plain `Error` / string / unknown — falls back to `String(value)`
 */
export function extractErrorMessage(value: unknown): string {
	if (value == null) return 'Unknown error';

	if (typeof value === 'string') return value;

	if (value instanceof Error) return value.message;

	if (typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		if (typeof obj.error === 'string') return obj.error;
		if (typeof obj.message === 'string') return obj.message;
		if (typeof obj.statusText === 'string' && obj.statusText)
			return obj.statusText;
	}

	return String(value);
}

/** Result shape returned by every openapi-fetch call. Re-typed locally so
 * the helpers below don't need a generic openapi-fetch import. */
interface ApiResult<TData, TError> {
	data?: TData;
	error?: TError;
	response: Response;
}

/** Consume an openapi-fetch result tuple, return `data` on success, throw
 * `KbveApiError` on failure. Useful inside react-query `queryFn` callbacks
 * or any place that prefers throw-on-error to result-style branching.
 *
 * Usage:
 *
 *     import { kbveApi, unwrap } from '@kbve/devops';
 *
 *     const profile = await unwrap(
 *       kbveApi.GET('/api/v1/profile/{username}', {
 *         params: { path: { username } },
 *       }),
 *     );
 *     // profile is the typed UserProfile, no manual error check needed
 */
export async function unwrap<TData, TError>(
	resultPromise: Promise<ApiResult<TData, TError>>,
): Promise<TData> {
	const result = await resultPromise;
	if (result.error !== undefined || !result.response.ok) {
		const message = extractErrorMessage(result.error ?? result.response);
		throw new KbveApiError(
			message,
			result.response?.status ?? 0,
			result.error,
		);
	}
	return result.data as TData;
}

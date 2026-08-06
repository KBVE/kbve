export interface DashFetchOpts extends RequestInit {
	label?: string;
}

function describe(e: unknown): string {
	if (e instanceof Error) {
		return e.name && e.name !== 'Error'
			? `${e.name}: ${e.message}`
			: e.message;
	}
	return String(e);
}

function shortUrl(url: string): string {
	try {
		const u = url.replace(/^https?:\/\/[^/]+/, '');
		return u.length > 120 ? `${u.slice(0, 117)}…` : u;
	} catch {
		return url;
	}
}

export async function dashFetch(
	url: string,
	opts: DashFetchOpts = {},
): Promise<Response> {
	const { label, ...init } = opts;
	const method = init.method ?? 'GET';
	const tag = label ? `${label} (${method} ${shortUrl(url)})` : `${method} ${shortUrl(url)}`;
	try {
		return await fetch(url, init);
	} catch (e: unknown) {
		if (e instanceof Error && e.name === 'AbortError') throw e;
		console.error(`[dash] ${tag} failed`, e);
		throw new Error(`${tag} failed: ${describe(e)}`);
	}
}

export async function dashJson<T>(res: Response, label?: string): Promise<T> {
	const tag = label ?? shortUrl(res.url || '');
	try {
		return (await res.json()) as T;
	} catch (e: unknown) {
		console.error(`[dash] ${tag} returned invalid JSON`, e);
		throw new Error(`${tag} returned invalid JSON: ${describe(e)}`);
	}
}

export function dashHttpError(
	res: Response,
	label?: string,
	hint?: string,
): Error {
	const tag = label ?? shortUrl(res.url || '');
	const suffix = hint ? ` — ${hint}` : '';
	return new Error(
		`${tag} → HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}${suffix}`,
	);
}

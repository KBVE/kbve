// Thin client for Cube's REST `/v1/load`, reached through the staff-gated
// axum-kbve proxy at `/dashboard/cube/proxy`. The proxy injects the upstream
// Cube JWT server-side; the browser only carries its supabase session token.

const PROXY = '/dashboard/cube/proxy/load';

export interface CubeTimeDimension {
	dimension: string;
	granularity?: 'day' | 'week' | 'month' | 'hour';
	dateRange?: string | [string, string];
}

export interface CubeQuery {
	measures?: string[];
	dimensions?: string[];
	timeDimensions?: CubeTimeDimension[];
	order?: Record<string, 'asc' | 'desc'>;
	limit?: number;
}

export type CubeRow = Record<string, unknown>;

export async function cubeLoad(
	baseUrl: string,
	token: string | null,
	query: CubeQuery,
	signal?: AbortSignal,
): Promise<CubeRow[]> {
	const res = await fetch(`${baseUrl}${PROXY}`, {
		method: 'POST',
		headers: {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ query }),
		signal,
	});
	if (res.status === 403) throw new Error('Access restricted');
	if (!res.ok) throw new Error(`Cube API error: ${res.status}`);
	const json = (await res.json()) as { data?: CubeRow[] };
	return json?.data ?? [];
}

export function fmtInt(v: number): string {
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
	if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
	return String(Math.round(v));
}

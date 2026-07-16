import { createStreamSource } from '../createStreamSource';
import type {
	StreamControl,
	SavedView,
	StreamParams,
	StreamStore,
} from '../types';
import { normalize } from '../adapters/clickhouse';
import type { LogItem, RawLogRow } from '../adapters/clickhouse';

export interface ClickHouseStreamOptions {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	pollMs?: number;
}

const PROXY = '/dashboard/clickhouse/proxy';

function buildBody(
	command: string,
	params: StreamParams,
): Record<string, unknown> {
	const body: Record<string, unknown> = { command };
	for (const k of [
		'minutes',
		'limit',
		'pod_namespace',
		'service',
		'level',
		'search',
	]) {
		if (params[k] !== undefined && params[k] !== '') body[k] = params[k];
	}
	return body;
}

async function post(
	baseUrl: string,
	token: string | null,
	body: unknown,
	signal: AbortSignal,
) {
	const res = await fetch(`${baseUrl}${PROXY}`, {
		method: 'POST',
		headers: {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
		signal,
	});
	if (res.status === 403) throw new Error('Access restricted');
	if (!res.ok) throw new Error(`ClickHouse API error: ${res.status}`);
	return res.json();
}

export interface StatsTotals {
	total: number;
	errors: number;
	warnings: number;
}

export function buildStatsTotals(meta: unknown): StatsTotals {
	const rows =
		(meta as { rows?: { level?: string; cnt?: number }[] })?.rows ?? [];
	let total = 0,
		errors = 0,
		warnings = 0;
	for (const r of rows) {
		const cnt = Number(r.cnt ?? 0);
		total += cnt;
		const lvl = (r.level ?? '').toLowerCase();
		if (lvl === 'error') errors += cnt;
		else if (lvl === 'warn' || lvl === 'warning') warnings += cnt;
	}
	return { total, errors, warnings };
}

export const CH_CONTROLS: readonly StreamControl[] = [
	{
		kind: 'segmented',
		param: 'minutes',
		options: [
			{ label: '6h', value: 360 },
			{ label: '12h', value: 720 },
			{ label: '24h', value: 1440 },
			{ label: '72h', value: 4320 },
			{ label: 'ALL', value: 0 },
		],
	},
	{
		kind: 'select',
		param: 'pod_namespace',
		placeholder: 'namespace',
		optionsFromMeta: (m) => {
			const rows =
				(m as { rows?: { pod_namespace?: string }[] })?.rows ?? [];
			const set = [
				...new Set(
					rows
						.map((r) => r.pod_namespace)
						.filter(Boolean) as string[],
				),
			].sort();
			return [
				{ label: 'all namespaces', value: '' },
				...set.map((v) => ({ label: v, value: v })),
			];
		},
	},
	{ kind: 'search', param: 'search', placeholder: 'filter message…' },
];

export const CH_DEFAULT_VIEWS: SavedView[] = [
	{
		id: 'errors-24h',
		name: 'Errors · 24h',
		params: { minutes: 1440, level: 'error', limit: 500 },
		seeded: true,
	},
	{
		id: 'all-6h',
		name: 'All · 6h',
		params: { minutes: 360, limit: 500 },
		seeded: true,
	},
	{
		id: 'warnings-24h',
		name: 'Warnings · 24h',
		params: { minutes: 1440, level: 'warn', limit: 500 },
		seeded: true,
	},
];

export function createClickHouseStream(
	opts: ClickHouseStreamOptions,
): StreamStore<LogItem> {
	const { getToken, baseUrl = '', pollMs = 30_000 } = opts;
	return createStreamSource<RawLogRow, LogItem>({
		key: 'clickhouse:logs',
		pollMs,
		cacheTtlMs: 60_000,
		initialParams: { minutes: 360, limit: 500 },
		defaultViews: CH_DEFAULT_VIEWS,
		id: (it) => it.id,
		signature: (it) => `${it.timestamp}|${it.level}|${it.message}`,
		normalize,
		fetch: async ({ signal }, params: StreamParams) => {
			const token = await getToken();
			const json = (await post(
				baseUrl,
				token,
				buildBody('query', params),
				signal,
			)) as { rows?: RawLogRow[] };
			return (json?.rows ?? []).sort(
				(a, b) =>
					new Date(b.timestamp.replace(' ', 'T') + 'Z').getTime() -
					new Date(a.timestamp.replace(' ', 'T') + 'Z').getTime(),
			);
		},
		fetchMeta: async ({ signal }, params: StreamParams) => {
			const token = await getToken();
			return post(
				baseUrl,
				token,
				buildBody('stats', { minutes: params['minutes'] }),
				signal,
			);
		},
	});
}

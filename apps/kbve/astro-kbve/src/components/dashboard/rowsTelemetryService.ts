import { atom } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';

// ---------------------------------------------------------------------------
// Types — match the axum-kbve /dashboard/clickhouse/proxy rows_* commands
// ---------------------------------------------------------------------------

export type FetchStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface RequestRatePoint {
	bucket: string;
	reqs: number;
}

export interface StatusBucket {
	status: number;
	n: number;
}

export interface EndpointStat {
	path: string;
	n: number;
	p50: number;
	p95: number;
	p99: number;
}

export interface ErrorRow {
	timestamp: string;
	method: string;
	path: string;
	status: number;
	latency_ms: number;
	customer: string;
	request_id: string;
}

export type TelemetryRange = '15m' | '1h' | '6h' | '24h';

export interface TelemetryRangeConfig {
	minutes: number;
	bucket_seconds: number;
	label: string;
}

export const TELEMETRY_RANGES: Record<TelemetryRange, TelemetryRangeConfig> = {
	'15m': { minutes: 15, bucket_seconds: 15, label: '15m' },
	'1h': { minutes: 60, bucket_seconds: 60, label: '1h' },
	'6h': { minutes: 360, bucket_seconds: 300, label: '6h' },
	'24h': { minutes: 1440, bucket_seconds: 900, label: '24h' },
};

export const TELEMETRY_RANGE_KEYS = Object.keys(
	TELEMETRY_RANGES,
) as TelemetryRange[];

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export const $telemetryRange = atom<TelemetryRange>('1h');

export const $requestRate = atom<RequestRatePoint[] | null>(null);
export const $requestRateStatus = atom<FetchStatus>('idle');

export const $statusHistogram = atom<StatusBucket[] | null>(null);
export const $statusHistogramStatus = atom<FetchStatus>('idle');

export const $topEndpoints = atom<EndpointStat[] | null>(null);
export const $topEndpointsStatus = atom<FetchStatus>('idle');

export const $errorRows = atom<ErrorRow[] | null>(null);
export const $errorRowsStatus = atom<FetchStatus>('idle');

// ---------------------------------------------------------------------------
// Proxy + auth
// ---------------------------------------------------------------------------

const PROXY_URL = '/dashboard/clickhouse/proxy';

async function getAuthHeaders(): Promise<Record<string, string>> {
	const supa = getSupa() ?? initSupa();
	if (!supa) return {};
	const { session } = await supa.getSession();
	if (!session?.access_token) return {};
	return {
		Authorization: `Bearer ${session.access_token}`,
		'Content-Type': 'application/json',
	};
}

// ---------------------------------------------------------------------------
// TTL cache — keyed by (command, range)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30_000;

type CacheEntry<T> = { at: number; data: T };
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
	const e = cache.get(key) as CacheEntry<T> | undefined;
	if (!e) return null;
	if (Date.now() - e.at > CACHE_TTL_MS) {
		cache.delete(key);
		return null;
	}
	return e.data;
}

function setCached<T>(key: string, data: T): void {
	cache.set(key, { at: Date.now(), data });
}

// ---------------------------------------------------------------------------
// Core POST helper
// ---------------------------------------------------------------------------

interface ProxyResponse<T> {
	rows: T[];
	count: number;
}

async function proxyCommand<T>(
	body: Record<string, unknown>,
): Promise<T[] | null> {
	const headers = await getAuthHeaders();
	if (!headers.Authorization) return null;
	try {
		const resp = await fetch(PROXY_URL, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(15000),
		});
		if (!resp.ok) {
			console.warn(
				`[rows-telemetry] ${body.command} → HTTP ${resp.status}`,
			);
			return null;
		}
		const data = (await resp.json()) as ProxyResponse<T>;
		return data.rows ?? [];
	} catch (e) {
		console.error(`[rows-telemetry] ${body.command} failed:`, e);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Public fetchers — each writes its atom + caches
// ---------------------------------------------------------------------------

export async function fetchRequestRate(range: TelemetryRange): Promise<void> {
	const config = TELEMETRY_RANGES[range];
	const key = `request_rate:${range}`;
	const cached = getCached<RequestRatePoint[]>(key);
	if (cached) {
		$requestRate.set(cached);
		$requestRateStatus.set('ok');
		return;
	}
	$requestRateStatus.set('loading');
	const rows = await proxyCommand<RequestRatePoint>({
		command: 'rows_request_rate',
		minutes: config.minutes,
		bucket_seconds: config.bucket_seconds,
	});
	if (rows === null) {
		$requestRateStatus.set('error');
		return;
	}
	setCached(key, rows);
	$requestRate.set(rows);
	$requestRateStatus.set('ok');
}

export async function fetchStatusHistogram(
	range: TelemetryRange,
): Promise<void> {
	const config = TELEMETRY_RANGES[range];
	const key = `status_histogram:${range}`;
	const cached = getCached<StatusBucket[]>(key);
	if (cached) {
		$statusHistogram.set(cached);
		$statusHistogramStatus.set('ok');
		return;
	}
	$statusHistogramStatus.set('loading');
	const rows = await proxyCommand<StatusBucket>({
		command: 'rows_status_histogram',
		minutes: config.minutes,
	});
	if (rows === null) {
		$statusHistogramStatus.set('error');
		return;
	}
	setCached(key, rows);
	$statusHistogram.set(rows);
	$statusHistogramStatus.set('ok');
}

export async function fetchTopEndpoints(range: TelemetryRange): Promise<void> {
	const config = TELEMETRY_RANGES[range];
	const key = `top_endpoints:${range}`;
	const cached = getCached<EndpointStat[]>(key);
	if (cached) {
		$topEndpoints.set(cached);
		$topEndpointsStatus.set('ok');
		return;
	}
	$topEndpointsStatus.set('loading');
	const rows = await proxyCommand<EndpointStat>({
		command: 'rows_top_endpoints',
		minutes: config.minutes,
		limit: 20,
	});
	if (rows === null) {
		$topEndpointsStatus.set('error');
		return;
	}
	setCached(key, rows);
	$topEndpoints.set(rows);
	$topEndpointsStatus.set('ok');
}

export async function fetchErrors(range: TelemetryRange): Promise<void> {
	const config = TELEMETRY_RANGES[range];
	const key = `errors:${range}`;
	const cached = getCached<ErrorRow[]>(key);
	if (cached) {
		$errorRows.set(cached);
		$errorRowsStatus.set('ok');
		return;
	}
	$errorRowsStatus.set('loading');
	const rows = await proxyCommand<ErrorRow>({
		command: 'rows_errors',
		minutes: config.minutes,
		limit: 50,
	});
	if (rows === null) {
		$errorRowsStatus.set('error');
		return;
	}
	setCached(key, rows);
	$errorRows.set(rows);
	$errorRowsStatus.set('ok');
}

export async function fetchAllTelemetry(range: TelemetryRange): Promise<void> {
	await Promise.all([
		fetchRequestRate(range),
		fetchStatusHistogram(range),
		fetchTopEndpoints(range),
		fetchErrors(range),
	]);
}

export function invalidateTelemetryCache(): void {
	cache.clear();
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function statusColorClass(status: number): string {
	if (status >= 500) return 'text-red-500';
	if (status >= 400) return 'text-amber-500';
	if (status >= 300) return 'text-blue-400';
	if (status >= 200) return 'text-emerald-500';
	return 'text-gray-400';
}

export function formatBucketTick(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

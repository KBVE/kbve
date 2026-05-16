import { atom } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';

export type FetchStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface AlertFiringRow {
	timestamp: string;
	status: string;
	alertname: string;
	severity: string;
	namespace: string;
	pod: string;
	service: string;
	summary: string;
	starts_at: string;
	fingerprint: string;
}

export interface AlertRecentRow {
	timestamp: string;
	status: string;
	alertname: string;
	severity: string;
	namespace: string;
	pod: string;
	service: string;
	summary: string;
	description: string;
	fingerprint: string;
	starts_at: string;
	ends_at: string | null;
	source: string;
}

export interface AlertSeverityRow {
	severity: string;
	distinct_alerts: number;
	total_events: number;
	firing_events: number;
	resolved_events: number;
}

export interface AlertTopRow {
	alertname: string;
	distinct_instances: number;
	total_events: number;
	firing_events: number;
}

export type AlertsRange = '15m' | '1h' | '6h' | '24h' | '7d';

export interface AlertsRangeConfig {
	minutes: number;
	label: string;
}

export const ALERTS_RANGES: Record<AlertsRange, AlertsRangeConfig> = {
	'15m': { minutes: 15, label: '15m' },
	'1h': { minutes: 60, label: '1h' },
	'6h': { minutes: 360, label: '6h' },
	'24h': { minutes: 1440, label: '24h' },
	'7d': { minutes: 10080, label: '7d' },
};

export const ALERTS_RANGE_KEYS = Object.keys(ALERTS_RANGES) as AlertsRange[];

export const $alertsRange = atom<AlertsRange>('1h');

export const $alertsFiring = atom<AlertFiringRow[] | null>(null);
export const $alertsFiringStatus = atom<FetchStatus>('idle');

export const $alertsRecent = atom<AlertRecentRow[] | null>(null);
export const $alertsRecentStatus = atom<FetchStatus>('idle');

export const $alertsSeverity = atom<AlertSeverityRow[] | null>(null);
export const $alertsSeverityStatus = atom<FetchStatus>('idle');

export const $alertsTop = atom<AlertTopRow[] | null>(null);
export const $alertsTopStatus = atom<FetchStatus>('idle');

const PROXY_URL = '/dashboard/clickhouse/proxy';
const CACHE_TTL_MS = 30_000;

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
			console.warn(`[alerts] ${body.command} → HTTP ${resp.status}`);
			return null;
		}
		const data = (await resp.json()) as ProxyResponse<T>;
		return data.rows ?? [];
	} catch (e) {
		console.error(`[alerts] ${body.command} failed:`, e);
		return null;
	}
}

export async function fetchAlertsFiring(range: AlertsRange): Promise<void> {
	const config = ALERTS_RANGES[range];
	const key = `firing:${range}`;
	const cached = getCached<AlertFiringRow[]>(key);
	if (cached) {
		$alertsFiring.set(cached);
		$alertsFiringStatus.set('ok');
		return;
	}
	$alertsFiringStatus.set('loading');
	const rows = await proxyCommand<AlertFiringRow>({
		command: 'alerts_firing',
		minutes: config.minutes,
	});
	if (rows === null) {
		$alertsFiringStatus.set('error');
		return;
	}
	setCached(key, rows);
	$alertsFiring.set(rows);
	$alertsFiringStatus.set('ok');
}

export async function fetchAlertsRecent(range: AlertsRange): Promise<void> {
	const config = ALERTS_RANGES[range];
	const key = `recent:${range}`;
	const cached = getCached<AlertRecentRow[]>(key);
	if (cached) {
		$alertsRecent.set(cached);
		$alertsRecentStatus.set('ok');
		return;
	}
	$alertsRecentStatus.set('loading');
	const rows = await proxyCommand<AlertRecentRow>({
		command: 'alerts_recent',
		minutes: config.minutes,
		limit: 100,
	});
	if (rows === null) {
		$alertsRecentStatus.set('error');
		return;
	}
	setCached(key, rows);
	$alertsRecent.set(rows);
	$alertsRecentStatus.set('ok');
}

export async function fetchAlertsSeverity(range: AlertsRange): Promise<void> {
	const config = ALERTS_RANGES[range];
	const key = `severity:${range}`;
	const cached = getCached<AlertSeverityRow[]>(key);
	if (cached) {
		$alertsSeverity.set(cached);
		$alertsSeverityStatus.set('ok');
		return;
	}
	$alertsSeverityStatus.set('loading');
	const rows = await proxyCommand<AlertSeverityRow>({
		command: 'alerts_by_severity',
		minutes: config.minutes,
	});
	if (rows === null) {
		$alertsSeverityStatus.set('error');
		return;
	}
	setCached(key, rows);
	$alertsSeverity.set(rows);
	$alertsSeverityStatus.set('ok');
}

export async function fetchAlertsTop(range: AlertsRange): Promise<void> {
	const config = ALERTS_RANGES[range];
	const key = `top:${range}`;
	const cached = getCached<AlertTopRow[]>(key);
	if (cached) {
		$alertsTop.set(cached);
		$alertsTopStatus.set('ok');
		return;
	}
	$alertsTopStatus.set('loading');
	const rows = await proxyCommand<AlertTopRow>({
		command: 'alerts_top',
		minutes: config.minutes,
		limit: 20,
	});
	if (rows === null) {
		$alertsTopStatus.set('error');
		return;
	}
	setCached(key, rows);
	$alertsTop.set(rows);
	$alertsTopStatus.set('ok');
}

export async function fetchAllAlerts(range: AlertsRange): Promise<void> {
	await Promise.all([
		fetchAlertsFiring(range),
		fetchAlertsRecent(range),
		fetchAlertsSeverity(range),
		fetchAlertsTop(range),
	]);
}

export function invalidateAlertsCache(): void {
	cache.clear();
}

export function severityColor(sev: string): string {
	const s = sev.toLowerCase();
	if (s === 'critical') return '#ef4444';
	if (s === 'warning') return '#f59e0b';
	if (s === 'info') return '#3b82f6';
	return '#6b7280';
}

export function severityTextClass(sev: string): string {
	const s = sev.toLowerCase();
	if (s === 'critical') return 'text-red-500';
	if (s === 'warning') return 'text-amber-500';
	if (s === 'info') return 'text-blue-400';
	return 'text-gray-400';
}

export function formatRelative(ts: string): string {
	const t = new Date(ts).getTime();
	if (!Number.isFinite(t)) return ts;
	const diff = Date.now() - t;
	const m = Math.floor(diff / 60_000);
	if (m < 1) return 'just now';
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	return `${d}d ago`;
}

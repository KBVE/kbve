import { createStreamSource } from '../createStreamSource';
import { dashFetch, dashJson, dashHttpError } from '../dashFetch';
import type { StreamControl, StreamParams, StreamStore } from '../types';
import {
	normalizeTelemetryEvent,
	normalizeTelemetryGroup,
	type RawTelemetryEvent,
	type RawTelemetryGroup,
	normalizePerfSummary,
	normalizeProductEvent,
	type PerfSummaryItem,
	type ProductEventItem,
	type RawEventCount,
	type RawPerfSummary,
	type TelemetryEventItem,
	type TelemetryGroupItem,
} from './telemetryTypes';

export const METRICS_BASE = 'https://metrics.kbve.com';

export interface TelemetryStreamOptions {
	/** Called per request, not once at construction. The astro dashboard this
	 *  replaces captured the access token at init and never refreshed it, so an
	 *  expired JWT rendered "groups request failed (401)" until reload. */
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	pollMs?: number;
}

async function authHeaders(
	getToken: () => Promise<string | null>,
): Promise<Record<string, string>> {
	const token = await getToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 401 and 403 mean different things here and the difference is worth showing:
 *  one is a session that lapsed, the other an account that was never allowed. */
function gateError(res: Response, label: string): Error {
	if (res.status === 401)
		return dashHttpError(res, label, 'Session expired — sign in again');
	if (res.status === 403)
		return dashHttpError(res, label, 'Staff access required');
	return dashHttpError(res, label);
}

/** 0 means "no window", and it has to be sent as an absent parameter rather
 *  than as `since_hours=0`: the service clamps the window to a minimum of one
 *  hour, so a literal 0 would ask for the last hour and render an empty
 *  dashboard that looks like an outage. */
const ALL_TIME = 0;

export const TELEMETRY_CONTROLS: readonly StreamControl[] = [
	{
		kind: 'search',
		param: 'project',
		placeholder: 'filter by project',
	},
	{
		kind: 'segmented',
		param: 'limit',
		label: 'Rows',
		options: [
			{ label: '25', value: 25 },
			{ label: '100', value: 100 },
			{ label: '250', value: 250 },
		],
	},
	{
		kind: 'segmented',
		param: 'since_hours',
		label: 'Window',
		options: [
			{ label: '24h', value: 24 },
			{ label: '7d', value: 24 * 7 },
			{ label: '30d', value: 24 * 30 },
			{ label: 'All', value: ALL_TIME },
		],
	},
];

/** Append the window when one is selected. Kept in one place so the three
 *  rollup reads cannot disagree about what "all time" means on the wire. */
function appendWindow(qs: URLSearchParams, params: StreamParams): void {
	const since = params['since_hours'];
	const hours = typeof since === 'string' ? Number(since) : since;
	if (typeof hours === 'number' && Number.isFinite(hours) && hours > ALL_TIME)
		qs.set('since_hours', String(hours));
}

export function createTelemetryGroupsStream(
	opts: TelemetryStreamOptions,
): StreamStore<TelemetryGroupItem> {
	const { getToken, baseUrl = METRICS_BASE, pollMs = 30_000 } = opts;
	return createStreamSource<RawTelemetryGroup, TelemetryGroupItem>({
		key: 'telemetry:groups',
		pollMs,
		cacheTtlMs: 60_000,
		initialParams: { limit: 100 },
		id: (it) => it.id,
		// Only the moving parts: a group whose count and last-seen are unchanged
		// keeps its object identity, so the list does not re-render on every poll.
		signature: (it) => `${it.events}|${it.sessions}|${it.lastSeen}`,
		normalize: normalizeTelemetryGroup,
		fetch: async ({ signal }, params: StreamParams) => {
			const qs = new URLSearchParams();
			const limit = params['limit'];
			qs.set('limit', String(limit ?? 100));
			const project = params['project'];
			if (typeof project === 'string' && project.trim())
				qs.set('project', project.trim());
			appendWindow(qs, params);

			const res = await dashFetch(`${baseUrl}/api/v1/groups?${qs}`, {
				headers: await authHeaders(getToken),
				signal,
				label: 'telemetry:groups',
			});
			if (!res.ok) throw gateError(res, 'telemetry:groups');
			const json = await dashJson<{ groups?: RawTelemetryGroup[] }>(
				res,
				'telemetry:groups',
			);
			return json?.groups ?? [];
		},
	});
}

export function createTelemetryEventsStream(
	opts: TelemetryStreamOptions,
): StreamStore<TelemetryEventItem> {
	const { getToken, baseUrl = METRICS_BASE, pollMs = 0 } = opts;
	return createStreamSource<RawTelemetryEvent, TelemetryEventItem>({
		key: 'telemetry:events',
		pollMs,
		cacheTtlMs: 30_000,
		initialParams: { limit: 50 },
		id: (it) => it.id,
		signature: (it) => it.id,
		normalize: normalizeTelemetryEvent,
		fetch: async ({ signal }, params: StreamParams) => {
			const fingerprint = params['fingerprint'];
			// No selection yet is not an error. The service rejects a non-hex
			// fingerprint with a 400, so asking before one is chosen would put a
			// spurious failure on screen every time the drawer closes.
			if (typeof fingerprint !== 'string' || !fingerprint) return [];

			const qs = new URLSearchParams({ fingerprint });
			qs.set('limit', String(params['limit'] ?? 50));
			const project = params['project'];
			if (typeof project === 'string' && project.trim())
				qs.set('project', project.trim());

			const res = await dashFetch(`${baseUrl}/api/v1/events?${qs}`, {
				headers: await authHeaders(getToken),
				signal,
				label: 'telemetry:events',
			});
			if (!res.ok) throw gateError(res, 'telemetry:events');
			const json = await dashJson<{ events?: RawTelemetryEvent[] }>(
				res,
				'telemetry:events',
			);
			return json?.events ?? [];
		},
	});
}

/** Shared by the two rollup streams: both take the same optional project filter
 *  and row cap, and both read a view that is already aggregated, so there is
 *  nothing lens-specific in building the query. */
function rollupQuery(params: StreamParams, fallbackLimit: number): string {
	const qs = new URLSearchParams();
	qs.set('limit', String(params['limit'] ?? fallbackLimit));
	const project = params['project'];
	if (typeof project === 'string' && project.trim())
		qs.set('project', project.trim());
	appendWindow(qs, params);
	return qs.toString();
}

export function createTelemetryPerfStream(
	opts: TelemetryStreamOptions,
): StreamStore<PerfSummaryItem> {
	const { getToken, baseUrl = METRICS_BASE, pollMs = 60_000 } = opts;
	return createStreamSource<RawPerfSummary, PerfSummaryItem>({
		key: 'telemetry:perf',
		// Slower than the errors poll: these are quantiles over a 30-day window,
		// so a fresher number is not a more useful one.
		pollMs,
		cacheTtlMs: 60_000,
		initialParams: { limit: 100 },
		id: (it) => it.id,
		// p75 is the headline the row leads with, so a change in it has to
		// invalidate the row even when the sample count has not moved.
		signature: (it) => `${it.samples}|${it.p75}|${it.lastSeen}`,
		normalize: normalizePerfSummary,
		fetch: async ({ signal }, params: StreamParams) => {
			const res = await dashFetch(
				`${baseUrl}/api/v1/perf?${rollupQuery(params, 100)}`,
				{
					headers: await authHeaders(getToken),
					signal,
					label: 'telemetry:perf',
				},
			);
			if (!res.ok) throw gateError(res, 'telemetry:perf');
			const json = await dashJson<{ perf?: RawPerfSummary[] }>(
				res,
				'telemetry:perf',
			);
			return json?.perf ?? [];
		},
	});
}

export function createTelemetryProductStream(
	opts: TelemetryStreamOptions,
): StreamStore<ProductEventItem> {
	const { getToken, baseUrl = METRICS_BASE, pollMs = 60_000 } = opts;
	return createStreamSource<RawEventCount, ProductEventItem>({
		key: 'telemetry:product',
		pollMs,
		cacheTtlMs: 60_000,
		initialParams: { limit: 100 },
		id: (it) => it.id,
		signature: (it) => `${it.events}|${it.sessions}|${it.lastSeen}`,
		normalize: normalizeProductEvent,
		fetch: async ({ signal }, params: StreamParams) => {
			const res = await dashFetch(
				`${baseUrl}/api/v1/product?${rollupQuery(params, 100)}`,
				{
					headers: await authHeaders(getToken),
					signal,
					label: 'telemetry:product',
				},
			);
			if (!res.ok) throw gateError(res, 'telemetry:product');
			const json = await dashJson<{ product?: RawEventCount[] }>(
				res,
				'telemetry:product',
			);
			return json?.product ?? [];
		},
	});
}

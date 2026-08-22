import { createStreamSource } from '../createStreamSource';
import { dashFetch, dashJson, dashHttpError } from '../dashFetch';
import type { StreamControl, StreamParams, StreamStore } from '../types';
import {
	normalizeTelemetryEvent,
	normalizeTelemetryGroup,
	type RawTelemetryEvent,
	type RawTelemetryGroup,
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
];

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

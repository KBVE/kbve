import type { BadgeTone } from '../_ui';
import { findDatasourceId, promQuery, promRange } from '../clusterHealth';
import type { SeriesPoint } from '../clusterHealth';
import { createStreamSource } from '../createStreamSource';
import type { StreamStore } from '../types';
import { nodeRoleFromPod, nodeRoleRank } from './labels';
import type { WowNodeRole } from './labels';

// Prometheus is only reachable through the staff-gated Grafana datasource
// proxy — there is no direct ingress — so every query here rides the same
// `/dashboard/grafana/proxy/...` path the cluster health tiles use.
//
// The worldserver's `delay_*` gauges are documented in milliseconds; an idle
// fleet member sits around p95 21ms / p99 36ms, which is what puts the warn
// band at 50ms rather than lower.

export interface WowNodeItem {
	id: string;
	role: WowNodeRole;
	connections: number | null;
	tickMean: number | null;
	tickMedian: number | null;
	tickP95: number | null;
	tickP99: number | null;
	tickMax: number | null;
	up: boolean;
}

export const TICK_WARN_MS = 50;
export const TICK_CRIT_MS = 150;

/**
 * Tick delay is the health signal Agones cannot see: a worldserver that still
 * accepts sockets but has fallen behind its tick passes every liveness probe.
 */
export function tickTone(p95: number | null): BadgeTone {
	if (p95 == null) return 'neutral';
	if (p95 < TICK_WARN_MS) return 'success';
	if (p95 < TICK_CRIT_MS) return 'warning';
	return 'danger';
}

export function tickLabel(p95: number | null): string {
	if (p95 == null) return 'no tick data';
	if (p95 < TICK_WARN_MS) return 'healthy';
	if (p95 < TICK_CRIT_MS) return 'lagging';
	return 'critical';
}

const NS = 'tocloud9';

export const WOW_METRIC_QUERIES = {
	connections: `active_connections{namespace="${NS}"}`,
	mean: `delay_mean{namespace="${NS}"}`,
	median: `delay_median{namespace="${NS}"}`,
	p95: `delay_95_percentile{namespace="${NS}"}`,
	p99: `delay_99_percentile{namespace="${NS}"}`,
	max: `delay_max{namespace="${NS}"}`,
	up: `up{namespace="${NS}"}`,
} as const;

type PromRow = { metric: Record<string, string>; value: number };

function byPod(rows: PromRow[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const r of rows) {
		const pod = r.metric['pod'];
		if (pod && !Number.isNaN(r.value)) out.set(pod, r.value);
	}
	return out;
}

export function mapWowNodes(vectors: {
	connections: PromRow[];
	mean?: PromRow[];
	median?: PromRow[];
	p95: PromRow[];
	p99: PromRow[];
	max: PromRow[];
	up: PromRow[];
}): WowNodeItem[] {
	const conn = byPod(vectors.connections);
	const mean = byPod(vectors.mean ?? []);
	const median = byPod(vectors.median ?? []);
	const p95 = byPod(vectors.p95);
	const p99 = byPod(vectors.p99);
	const max = byPod(vectors.max);
	const up = byPod(vectors.up);

	const pods = new Set<string>([
		...conn.keys(),
		...mean.keys(),
		...median.keys(),
		...p95.keys(),
		...p99.keys(),
		...max.keys(),
		...up.keys(),
	]);

	const get = (m: Map<string, number>, pod: string) =>
		m.has(pod) ? (m.get(pod) as number) : null;

	return [...pods]
		.map((pod) => ({
			id: pod,
			role: nodeRoleFromPod(pod),
			connections: get(conn, pod),
			tickMean: get(mean, pod),
			tickMedian: get(median, pod),
			tickP95: get(p95, pod),
			tickP99: get(p99, pod),
			tickMax: get(max, pod),
			up: (up.get(pod) ?? 0) === 1,
		}))
		.sort(
			(a, b) =>
				nodeRoleRank(a.role) - nodeRoleRank(b.role) ||
				a.id.localeCompare(b.id),
		);
}

export interface WowMetricsOptions {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	pollMs?: number;
}

export function createWowMetricsStream(
	opts: WowMetricsOptions,
): StreamStore<WowNodeItem> {
	const { getToken, baseUrl = '', pollMs = 15_000 } = opts;
	return createStreamSource<WowNodeItem, WowNodeItem>({
		key: 'wow:nodes',
		pollMs,
		cacheTtlMs: 60_000,
		id: (it) => it.id,
		signature: (it) =>
			`${it.role}|${it.up}|${it.connections}|${it.tickMean}|${it.tickMedian}|${it.tickP95}|${it.tickP99}|${it.tickMax}`,
		normalize: (x) => x,
		fetch: async ({ signal }) => {
			const token = await getToken().catch(() => null);
			if (!token) throw new Error('Not signed in');
			const dsId = await findDatasourceId(baseUrl, token, signal);
			if (dsId == null) {
				throw new Error('Prometheus datasource unavailable');
			}
			const q = (expr: string) =>
				promQuery(baseUrl, token, dsId, expr, signal);
			const [connections, mean, median, p95, p99, max, up] =
				await Promise.all([
					q(WOW_METRIC_QUERIES.connections),
					q(WOW_METRIC_QUERIES.mean),
					q(WOW_METRIC_QUERIES.median),
					q(WOW_METRIC_QUERIES.p95),
					q(WOW_METRIC_QUERIES.p99),
					q(WOW_METRIC_QUERIES.max),
					q(WOW_METRIC_QUERIES.up),
				]);
			return mapWowNodes({
				connections,
				mean,
				median,
				p95,
				p99,
				max,
				up,
			});
		},
	});
}

/** Tick-delay trend for one pod, for a sparkline under its node card. */
export async function fetchTickSeries(
	baseUrl: string,
	token: string | null,
	pod: string,
	signal: AbortSignal,
	windowSec = 3600,
	stepSec = 60,
): Promise<SeriesPoint[]> {
	if (!token) return [];
	const dsId = await findDatasourceId(baseUrl, token, signal);
	if (dsId == null) return [];
	const end = Math.floor(Date.now() / 1000);
	return promRange(
		baseUrl,
		token,
		dsId,
		`delay_95_percentile{namespace="${NS}",pod="${pod}"}`,
		end - windowSec,
		end,
		stepSec,
		signal,
	);
}

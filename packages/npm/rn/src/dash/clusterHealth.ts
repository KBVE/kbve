import type { BadgeTone } from './_ui';
import type { StatModel } from './types';

// ---------------------------------------------------------------------------
// Shared cluster health (Prometheus via the Grafana datasource proxy). Both the
// Grafana and Argo streams fetch this as their `meta` side-channel so the
// StatGrid shows node/CPU/mem/pod/namespace basics — cached + hydrated, so the
// last-known values paint instantly with no layout shift.
// ---------------------------------------------------------------------------

export interface NamespaceStat {
	namespace: string;
	pods: number;
	running: number;
	pending: number;
	failed: number;
	restarts: number;
}

export interface ClusterHealth {
	nodes: number | null;
	namespaces: number | null;
	cpuPercent: number | null;
	memPercent: number | null;
	diskPercent: number | null;
	podsTotal: number | null;
	podsRunning: number | null;
	podsPending: number | null;
	podsFailed: number | null;
	restarts: number | null;
	deployments: number | null;
	containers: number | null;
	byNamespace: NamespaceStat[];
}

let cachedDatasourceId: number | null = null;

async function findDatasourceId(
	base: string,
	token: string,
	signal: AbortSignal,
): Promise<number | null> {
	if (cachedDatasourceId != null) return cachedDatasourceId;
	try {
		const res = await fetch(
			`${base}/dashboard/grafana/proxy/api/datasources`,
			{ headers: { Authorization: `Bearer ${token}` }, signal },
		);
		if (!res.ok) return null;
		const sources = (await res.json()) as Array<{
			id: number;
			type: string;
			name: string;
		}>;
		const prom = sources.find(
			(s) => s.type === 'prometheus' || s.name === 'Prometheus',
		);
		cachedDatasourceId = prom?.id ?? null;
		return cachedDatasourceId;
	} catch {
		return null;
	}
}

async function promQuery(
	base: string,
	token: string,
	dsId: number,
	expr: string,
	signal: AbortSignal,
): Promise<Array<{ metric: Record<string, string>; value: number }>> {
	try {
		const res = await fetch(
			`${base}/dashboard/grafana/proxy/api/datasources/proxy/${dsId}/api/v1/query`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: `query=${encodeURIComponent(expr)}`,
				signal,
			},
		);
		if (!res.ok) return [];
		const data = (await res.json()) as {
			data?: {
				result?: Array<{
					metric?: Record<string, string>;
					value?: [number, string];
				}>;
			};
		};
		const rows = data?.data?.result ?? [];
		return rows.map((r) => ({
			metric: r.metric ?? {},
			value: r.value?.[1] != null ? parseFloat(r.value[1]) : NaN,
		}));
	} catch {
		return [];
	}
}

const SCALAR_QUERIES = {
	nodes: 'count(kube_node_info)',
	namespaces: 'count(count by (namespace) (kube_pod_info))',
	cpu: 'avg(100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))',
	mem: '(1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))) * 100',
	disk: 'avg((1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"})) * 100)',
	podsTotal:
		'sum(kube_pod_status_phase{phase=~"Running|Pending|Failed|Unknown"})',
	podsRunning: 'sum(kube_pod_status_phase{phase="Running"})',
	podsPending: 'sum(kube_pod_status_phase{phase="Pending"})',
	podsFailed: 'sum(kube_pod_status_phase{phase="Failed"})',
	restarts: 'sum(increase(kube_pod_container_status_restarts_total[1h]))',
	deployments: 'count(kube_deployment_created)',
	containers: 'sum(kube_pod_container_status_running)',
} as const;

const NS_QUERIES = {
	pods: 'count by (namespace) (kube_pod_info)',
	running: 'sum by (namespace) (kube_pod_status_phase{phase="Running"})',
	pending: 'sum by (namespace) (kube_pod_status_phase{phase="Pending"})',
	failed: 'sum by (namespace) (kube_pod_status_phase{phase="Failed"})',
	restarts:
		'sum by (namespace) (increase(kube_pod_container_status_restarts_total[1h]))',
} as const;

function byNs(
	rows: Array<{ metric: Record<string, string>; value: number }>,
): Map<string, number> {
	const out = new Map<string, number>();
	for (const r of rows) {
		const ns = r.metric['namespace'];
		if (ns && !Number.isNaN(r.value)) out.set(ns, r.value);
	}
	return out;
}

export async function fetchClusterHealth(
	base: string,
	token: string | null,
	signal: AbortSignal,
): Promise<ClusterHealth | null> {
	if (!token) return null;
	const dsId = await findDatasourceId(base, token, signal);
	if (dsId == null) return null;
	const scalar = (expr: string) =>
		promQuery(base, token, dsId, expr, signal).then((r) =>
			r[0]?.value != null && !Number.isNaN(r[0].value)
				? r[0].value
				: null,
		);
	const vector = (expr: string) => promQuery(base, token, dsId, expr, signal);

	const [
		nodes,
		namespaces,
		cpu,
		mem,
		disk,
		podsTotal,
		podsRunning,
		podsPending,
		podsFailed,
		restarts,
		deployments,
		containers,
		nsPods,
		nsRunning,
		nsPending,
		nsFailed,
		nsRestarts,
	] = await Promise.all([
		scalar(SCALAR_QUERIES.nodes),
		scalar(SCALAR_QUERIES.namespaces),
		scalar(SCALAR_QUERIES.cpu),
		scalar(SCALAR_QUERIES.mem),
		scalar(SCALAR_QUERIES.disk),
		scalar(SCALAR_QUERIES.podsTotal),
		scalar(SCALAR_QUERIES.podsRunning),
		scalar(SCALAR_QUERIES.podsPending),
		scalar(SCALAR_QUERIES.podsFailed),
		scalar(SCALAR_QUERIES.restarts),
		scalar(SCALAR_QUERIES.deployments),
		scalar(SCALAR_QUERIES.containers),
		vector(NS_QUERIES.pods),
		vector(NS_QUERIES.running),
		vector(NS_QUERIES.pending),
		vector(NS_QUERIES.failed),
		vector(NS_QUERIES.restarts),
	]);

	const podsMap = byNs(nsPods);
	const runMap = byNs(nsRunning);
	const pendMap = byNs(nsPending);
	const failMap = byNs(nsFailed);
	const restartMap = byNs(nsRestarts);
	const int = (v: number | null | undefined) =>
		v != null ? Math.round(v) : 0;
	const byNamespace: NamespaceStat[] = [...podsMap.entries()]
		.map(([namespace, pods]) => ({
			namespace,
			pods: int(pods),
			running: int(runMap.get(namespace)),
			pending: int(pendMap.get(namespace)),
			failed: int(failMap.get(namespace)),
			restarts: int(restartMap.get(namespace)),
		}))
		.sort((a, b) => b.pods - a.pods);

	const anySet =
		[nodes, cpu, mem, disk, podsRunning, deployments, containers].some(
			(v) => v != null,
		) || byNamespace.length > 0;
	if (!anySet) return null;

	const round = (v: number | null) => (v != null ? Math.round(v) : null);
	const pct1 = (v: number | null) =>
		v != null ? Math.round(v * 10) / 10 : null;
	return {
		nodes: round(nodes),
		namespaces: round(namespaces),
		cpuPercent: pct1(cpu),
		memPercent: pct1(mem),
		diskPercent: pct1(disk),
		podsTotal: round(podsTotal),
		podsRunning: round(podsRunning),
		podsPending: round(podsPending),
		podsFailed: round(podsFailed),
		restarts: round(restarts),
		deployments: round(deployments),
		containers: round(containers),
		byNamespace,
	};
}

// ---------------------------------------------------------------------------
// Shared stat-tile builder so Grafana and Argo render identical health tiles.
// ---------------------------------------------------------------------------

const loadTone = (v: number | null): BadgeTone =>
	v == null
		? 'neutral'
		: v >= 85
			? 'danger'
			: v >= 65
				? 'warning'
				: 'success';

const num = (v: number | null) => v ?? '—';
const pct = (v: number | null) => (v != null ? `${v}%` : '—');

/** Cluster-wide health tiles (nodes/cpu/mem/disk/pods/namespaces/restarts). */
export function clusterHealthStats(h: ClusterHealth | null): StatModel[] {
	if (!h) return [];
	return [
		{ id: 'nodes', label: 'Nodes', tone: 'primary', value: num(h.nodes) },
		{
			id: 'namespaces',
			label: 'Namespaces',
			tone: 'primary',
			value: num(h.namespaces),
		},
		{
			id: 'cpu',
			label: 'CPU',
			tone: loadTone(h.cpuPercent),
			value: pct(h.cpuPercent),
		},
		{
			id: 'mem',
			label: 'Memory',
			tone: loadTone(h.memPercent),
			value: pct(h.memPercent),
		},
		{
			id: 'disk',
			label: 'Disk',
			tone: loadTone(h.diskPercent),
			value: pct(h.diskPercent),
		},
		{
			id: 'pods-running',
			label: 'Pods',
			tone: 'success',
			value: num(h.podsRunning),
		},
		{
			id: 'pods-pending',
			label: 'Pending',
			tone: h.podsPending ? 'warning' : 'neutral',
			value: num(h.podsPending),
		},
		{
			id: 'pods-failed',
			label: 'Failed',
			tone: h.podsFailed ? 'danger' : 'neutral',
			value: num(h.podsFailed),
		},
		{
			id: 'restarts',
			label: 'Restarts 1h',
			tone: h.restarts && h.restarts >= 5 ? 'warning' : 'neutral',
			value: num(h.restarts),
		},
		{
			id: 'deployments',
			label: 'Deploys',
			tone: 'primary',
			value: num(h.deployments),
		},
		{ id: 'containers', label: 'Containers', value: num(h.containers) },
	];
}

/** Top-N busiest namespaces as tiles (value = pod count, tone by failed/pending). */
export function namespaceStats(
	h: ClusterHealth | null,
	limit = 6,
): StatModel[] {
	if (!h) return [];
	return h.byNamespace.slice(0, limit).map((ns) => ({
		id: `ns:${ns.namespace}`,
		label: ns.namespace,
		tone: ns.failed
			? ('danger' as BadgeTone)
			: ns.pending
				? ('warning' as BadgeTone)
				: ('neutral' as BadgeTone),
		value: ns.running ? `${ns.running}/${ns.pods}` : ns.pods,
	}));
}

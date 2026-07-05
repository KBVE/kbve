import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { BadgeTone } from '../_ui';
import { createStreamSource } from '../createStreamSource';
import type { StatModel, StreamLens, StreamStore } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawAlert {
	labels: Record<string, string>;
	annotations: Record<string, string>;
	state: 'firing' | 'pending' | 'inactive' | string;
	activeAt: string | null;
	value: string | null;
}

export interface AlertItem {
	id: string; // alertname + instance
	alertname: string;
	severity: string;
	state: 'firing' | 'pending' | 'inactive' | string;
	summary: string;
	description: string;
	namespace: string;
	pod: string;
	service: string;
	instance: string;
	activeAt: string | null;
	value: string | null;
	allLabels: Record<string, string>;
	allAnnotations: Record<string, string>;
}

export interface GrafanaStreamOptions {
	/** Returns a fresh bearer token (Supabase access token). */
	getToken: () => Promise<string | null>;
	/** Origin for the proxy. '' (relative) on web, absolute URL on mobile. */
	baseUrl?: string;
	pollMs?: number;
}

// ---------------------------------------------------------------------------
// Cluster health (Prometheus via the Grafana datasource proxy). Held at module
// scope so the stream's fetch can refresh it each poll and the lens's `stats`
// can read it — the StatGrid then shows node/CPU/mem/pod basics beside alerts.
// ---------------------------------------------------------------------------

export interface ClusterHealth {
	nodes: number | null;
	cpuPercent: number | null;
	memPercent: number | null;
	diskPercent: number | null;
	podsRunning: number | null;
	podsPending: number | null;
	podsFailed: number | null;
	deployments: number | null;
	containers: number | null;
}

let clusterHealth: ClusterHealth | null = null;
let cachedDatasourceId: number | null = null;
// The live store, captured so stat tiles can toggle the matching filter
// (one grafana stream is mounted at a time on a page).
let activeStore: StreamStore<AlertItem> | null = null;

function toggleFilter(id: string): void {
	const cur = activeStore?.get().filterId ?? null;
	activeStore?.setFilter(cur === id ? null : id);
}

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

async function queryInstant(
	base: string,
	token: string,
	dsId: number,
	expr: string,
	signal: AbortSignal,
): Promise<number | null> {
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
		if (!res.ok) return null;
		const data = (await res.json()) as {
			data?: { result?: Array<{ value?: [number, string] }> };
		};
		const val = data?.data?.result?.[0]?.value?.[1];
		return val != null ? parseFloat(val) : null;
	} catch {
		return null;
	}
}

const HEALTH_QUERIES = {
	nodes: 'count(kube_node_info)',
	cpu: 'avg(100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))',
	mem: '(1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))) * 100',
	disk: 'avg((1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"})) * 100)',
	podsRunning: 'sum(kube_pod_status_phase{phase="Running"})',
	podsPending: 'sum(kube_pod_status_phase{phase="Pending"})',
	podsFailed: 'sum(kube_pod_status_phase{phase="Failed"})',
	deployments: 'count(kube_deployment_created)',
	containers: 'sum(kube_pod_container_status_running)',
} as const;

async function fetchClusterHealth(
	base: string,
	token: string | null,
	signal: AbortSignal,
): Promise<ClusterHealth | null> {
	if (!token) return null;
	const dsId = await findDatasourceId(base, token, signal);
	if (dsId == null) return null;
	const q = (expr: string) => queryInstant(base, token, dsId, expr, signal);
	const [
		nodes,
		cpu,
		mem,
		disk,
		podsRunning,
		podsPending,
		podsFailed,
		deployments,
		containers,
	] = await Promise.all([
		q(HEALTH_QUERIES.nodes),
		q(HEALTH_QUERIES.cpu),
		q(HEALTH_QUERIES.mem),
		q(HEALTH_QUERIES.disk),
		q(HEALTH_QUERIES.podsRunning),
		q(HEALTH_QUERIES.podsPending),
		q(HEALTH_QUERIES.podsFailed),
		q(HEALTH_QUERIES.deployments),
		q(HEALTH_QUERIES.containers),
	]);
	const anySet = [
		nodes,
		cpu,
		mem,
		disk,
		podsRunning,
		podsPending,
		podsFailed,
		deployments,
		containers,
	].some((v) => v != null);
	if (!anySet) return null;
	const int = (v: number | null) => (v != null ? Math.round(v) : null);
	const pct1 = (v: number | null) =>
		v != null ? Math.round(v * 10) / 10 : null;
	return {
		nodes: int(nodes),
		cpuPercent: pct1(cpu),
		memPercent: pct1(mem),
		diskPercent: pct1(disk),
		podsRunning: int(podsRunning),
		podsPending: int(podsPending),
		podsFailed: int(podsFailed),
		deployments: int(deployments),
		containers: int(containers),
	};
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalize(raw: RawAlert): AlertItem {
	const alertname = raw.labels['alertname'] ?? '(unnamed alert)';
	const severity = (raw.labels['severity'] ?? 'unknown').toLowerCase();
	const namespace =
		raw.labels['namespace'] ?? raw.labels['kubernetes_namespace'] ?? '';
	const pod = raw.labels['pod'] ?? raw.labels['kubernetes_pod_name'] ?? '';
	const service = raw.labels['service'] ?? raw.labels['job'] ?? '';
	const instance = raw.labels['instance'] ?? '';

	const summary =
		raw.annotations['summary'] ?? raw.annotations['description'] ?? '';
	const description = raw.annotations['description'] ?? summary;

	// Create unique ID from alertname + instance
	const id = instance ? `${alertname}:${instance}` : alertname;

	return {
		id,
		alertname,
		severity,
		state: raw.state,
		summary,
		description,
		namespace,
		pod,
		service,
		instance,
		activeAt: raw.activeAt,
		value: raw.value,
		allLabels: raw.labels,
		allAnnotations: raw.annotations,
	};
}

function rankAlert(severity: string): number {
	const sev = severity.toLowerCase();
	if (sev === 'critical') return 0;
	if (sev === 'high') return 1;
	if (sev === 'warning' || sev === 'medium') return 2;
	if (sev === 'info' || sev === 'low') return 3;
	return 4;
}

// ---------------------------------------------------------------------------
// Stream Source
// ---------------------------------------------------------------------------

export function createGrafanaStream(
	opts: GrafanaStreamOptions,
): StreamStore<AlertItem> {
	const { getToken, baseUrl = '', pollMs = 30_000 } = opts;

	const store = createStreamSource<RawAlert, AlertItem>({
		key: 'grafana:alerts',
		pollMs,
		cacheTtlMs: 60_000,
		id: (it) => it.id,
		signature: (it) => `${it.state}|${it.activeAt}|${it.value}`,
		normalize,
		fetch: async ({ signal }) => {
			const token = await getToken();
			const [res, health] = await Promise.all([
				fetch(
					`${baseUrl}/dashboard/grafana/proxy/api/prometheus/grafana/api/v1/alerts`,
					{
						headers: token
							? { Authorization: `Bearer ${token}` }
							: undefined,
						signal,
					},
				),
				fetchClusterHealth(baseUrl, token, signal),
			]);
			clusterHealth = health;
			if (res.status === 403) throw new Error('Access restricted');
			if (!res.ok) throw new Error(`Grafana alerts API ${res.status}`);

			const json = (await res.json()) as {
				data?: { alerts?: RawAlert[] };
			};
			const raw = json?.data?.alerts ?? [];

			// Sort by severity first, then by alertname
			return raw.sort((a, b) => {
				const sevA = (a.labels['severity'] ?? 'unknown').toLowerCase();
				const sevB = (b.labels['severity'] ?? 'unknown').toLowerCase();
				const sevDiff = rankAlert(sevA) - rankAlert(sevB);
				if (sevDiff !== 0) return sevDiff;
				return (a.labels['alertname'] ?? '').localeCompare(
					b.labels['alertname'] ?? '',
				);
			});
		},
	});
	activeStore = store;
	return store;
}

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

function severityTone(sev: string): BadgeTone {
	const s = sev.toLowerCase();
	if (s === 'critical' || s === 'high') return 'danger';
	if (s === 'warning' || s === 'medium') return 'warning';
	if (s === 'info' || s === 'low') return 'neutral';
	return 'neutral';
}

function stateTone(state: string): BadgeTone {
	if (state === 'firing') return 'danger';
	if (state === 'pending') return 'warning';
	return 'neutral';
}

function severityColor(sev: string): string {
	const s = sev.toLowerCase();
	if (s === 'critical' || s === 'high') return tokens.color.danger;
	if (s === 'warning' || s === 'medium') return tokens.color.warning;
	if (s === 'info' || s === 'low') return tokens.color.textMuted;
	return tokens.color.textFaint;
}

export const grafanaLens: StreamLens<AlertItem> = {
	searchText: (it) =>
		`${it.alertname} ${it.namespace} ${it.pod} ${it.summary} ${it.description}`,
	group: (it) => it.namespace || '(cluster)',
	filters: [
		{
			id: 'firing',
			label: 'Firing',
			tone: 'danger',
			predicate: (it) => it.state === 'firing',
		},
		{
			id: 'pending',
			label: 'Pending',
			tone: 'warning',
			predicate: (it) => it.state === 'pending',
		},
		{
			id: 'critical',
			label: 'Critical',
			tone: 'danger',
			predicate: (it) =>
				it.severity === 'critical' || it.severity === 'high',
		},
	],
	stats: (items) => {
		const h = clusterHealth;
		const pct = (v: number | null) => (v != null ? `${v}%` : '—');
		const num = (v: number | null) => v ?? '—';
		const loadTone = (v: number | null): BadgeTone =>
			v == null
				? 'neutral'
				: v >= 85
					? 'danger'
					: v >= 65
						? 'warning'
						: 'success';
		const countTone = (v: number | null, warn = true): BadgeTone =>
			v == null || v === 0 ? 'neutral' : warn ? 'warning' : 'danger';
		const healthStats: StatModel[] = h
			? [
					{
						id: 'nodes',
						label: 'Nodes',
						tone: 'primary',
						value: num(h.nodes),
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
						tone: countTone(h.podsPending, true),
						value: num(h.podsPending),
					},
					{
						id: 'pods-failed',
						label: 'Failed',
						tone: countTone(h.podsFailed, false),
						value: num(h.podsFailed),
					},
					{
						id: 'deployments',
						label: 'Deploys',
						tone: 'primary',
						value: num(h.deployments),
					},
					{
						id: 'containers',
						label: 'Containers',
						value: num(h.containers),
					},
				]
			: [];
		return [
			...healthStats,
			{ id: 'total', label: 'Total Alerts', value: items.length },
			{
				id: 'firing',
				label: 'Firing',
				tone: 'danger',
				value: items.filter((i) => i.state === 'firing').length,
				onPress: () => toggleFilter('firing'),
			},
			{
				id: 'pending',
				label: 'Pending',
				tone: 'warning',
				value: items.filter((i) => i.state === 'pending').length,
				onPress: () => toggleFilter('pending'),
			},
			{
				id: 'critical',
				label: 'Critical',
				tone: 'danger',
				value: items.filter(
					(i) => i.severity === 'critical' || i.severity === 'high',
				).length,
				onPress: () => toggleFilter('critical'),
			},
		];
	},
	row: (it) => (
		<Surface padded={false} style={styles.row}>
			<View
				style={[
					styles.severityDot,
					{ backgroundColor: severityColor(it.severity) },
				]}
			/>
			<Stack gap="xs" style={styles.rowContent}>
				<Stack direction="row" align="center" gap="xs" wrap>
					<Text
						variant="label"
						numberOfLines={1}
						style={styles.alertname}>
						{it.alertname}
					</Text>
					<Badge label={it.state} tone={stateTone(it.state)} />
					<Badge
						label={it.severity}
						tone={severityTone(it.severity)}
					/>
				</Stack>
				{it.summary && (
					<Text variant="caption" tone="muted" numberOfLines={2}>
						{it.summary}
					</Text>
				)}
				{it.namespace && (
					<Text variant="caption" tone="faint">
						{it.namespace}
						{it.pod ? ` / ${it.pod}` : ''}
					</Text>
				)}
			</Stack>
		</Surface>
	),
	card: (it) => (
		<Surface style={styles.card}>
			<Stack gap="sm">
				<Stack direction="row" align="center" gap="xs">
					<View
						style={[
							styles.severityDot,
							{ backgroundColor: severityColor(it.severity) },
						]}
					/>
					<Text
						variant="label"
						numberOfLines={1}
						style={styles.alertname}>
						{it.alertname}
					</Text>
				</Stack>
				{it.summary && (
					<Text variant="caption" tone="muted">
						{it.summary}
					</Text>
				)}
				<Stack direction="row" gap="sm" wrap>
					<Badge label={it.state} tone={stateTone(it.state)} />
					<Badge
						label={it.severity}
						tone={severityTone(it.severity)}
					/>
				</Stack>
				{it.namespace && (
					<Text variant="caption" tone="faint">
						{it.namespace}
						{it.pod ? ` / ${it.pod}` : ''}
					</Text>
				)}
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Alert Name" value={it.alertname} />
			<Fact label="Severity" value={it.severity.toUpperCase()} />
			<Fact label="State" value={it.state.toUpperCase()} />
			{it.namespace && <Fact label="Namespace" value={it.namespace} />}
			{it.pod && <Fact label="Pod" value={it.pod} />}
			{it.service && <Fact label="Service" value={it.service} />}
			{it.instance && <Fact label="Instance" value={it.instance} />}
			{it.value && <Fact label="Value" value={it.value} />}
			{it.activeAt && (
				<Fact
					label="Active Since"
					value={new Date(it.activeAt).toLocaleString()}
				/>
			)}
			{it.description && (
				<Stack gap="xs">
					<Text variant="caption" weight="medium" tone="muted">
						Description:
					</Text>
					<Text variant="caption" tone="faint">
						{it.description}
					</Text>
				</Stack>
			)}
		</Stack>
	),
};

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<Stack direction="row" gap="sm" justify="space-between">
			<Text variant="caption" tone="muted">
				{label}
			</Text>
			<Text variant="caption" numberOfLines={1} style={styles.factValue}>
				{value}
			</Text>
		</Stack>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.md,
		paddingVertical: tokens.space.sm,
	},
	rowContent: {
		flexShrink: 1,
		flexGrow: 1,
	},
	card: {
		padding: tokens.space.md,
	},
	severityDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		flexShrink: 0,
	},
	alertname: {
		flexShrink: 1,
	},
	factValue: {
		flexShrink: 1,
		textAlign: 'right',
	},
});

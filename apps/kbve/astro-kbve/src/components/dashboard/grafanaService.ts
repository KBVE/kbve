import { atom } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardState =
	| 'loading'
	| 'authenticated'
	| 'unauthenticated'
	| 'forbidden';

export type TimeRangeKey = '1h' | '6h' | '24h' | '7d';
export type ExpandedCard = 'cpu' | 'memory' | 'disk' | 'pods' | null;

export interface TimeRangeConfig {
	label: string;
	seconds: number;
	step: number;
	restartWindow: string;
}

export interface MetricSnapshot {
	cpu: number | null;
	memory: number | null;
	disk: number | null;
	networkRx: number | null;
	networkTx: number | null;
	pvcUsage: number | null;
	pods: number | null;
	nodes: number | null;
	containers: number | null;
	podRestarts: number | null;
	failedPods: number | null;
	pendingPods: number | null;
	deployments: number | null;
}

export interface TimeSeriesPoint {
	timestamp: number;
	cpu: number | null;
	memory: number | null;
}

export interface K8sTimeSeriesPoint {
	timestamp: number;
	pods: number | null;
}

export interface NetworkTimeSeriesPoint {
	timestamp: number;
	rx: number | null;
	tx: number | null;
}

export interface DiskTimeSeriesPoint {
	timestamp: number;
	disk: number | null;
}

export interface TrendInfo {
	direction: 'up' | 'down' | 'flat';
	percentChange: number | null;
}

export interface SparklinePoint {
	t: number;
	v: number;
}

export interface InstantResult {
	metric: Record<string, string>;
	value: number | null;
}

export interface PerNodeMetric {
	instance: string;
	cpu: number | null;
	memory: number | null;
	disk: number | null;
}

export interface NamespacePodCount {
	namespace: string;
	count: number;
}

interface CachedDashboard {
	snapshot: MetricSnapshot;
	timeSeries: TimeSeriesPoint[];
	k8sTimeSeries: K8sTimeSeriesPoint[];
	networkTimeSeries: NetworkTimeSeriesPoint[];
	diskTimeSeries: DiskTimeSeriesPoint[];
	trends: Record<string, TrendInfo>;
	sparklines: Record<string, SparklinePoint[]>;
	timeRange: TimeRangeKey;
	cached_at: number;
	user_id: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_PREFIX = 'cache:grafana:cluster';
const DS_CACHE_KEY = 'cache:grafana:ds-id';
const TR_STORAGE_KEY = 'grafana:timeRange';
const CACHE_TTL_MS = 5 * 60 * 1000;
const PROXY_BASE = '/dashboard/grafana/proxy';

export const TIME_RANGES: Record<TimeRangeKey, TimeRangeConfig> = {
	'1h': { label: '1h', seconds: 3600, step: 60, restartWindow: '1h' },
	'6h': { label: '6h', seconds: 21600, step: 300, restartWindow: '6h' },
	'24h': { label: '24h', seconds: 86400, step: 900, restartWindow: '24h' },
	'7d': { label: '7d', seconds: 604800, step: 3600, restartWindow: '7d' },
};

export const TIME_RANGE_KEYS = Object.keys(TIME_RANGES) as TimeRangeKey[];

const QUERIES = {
	cpu: 'avg(100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))',
	memory: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
	disk: '(1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"})) * 100',
	networkRx:
		'sum(rate(node_network_receive_bytes_total{device!~"lo|veth.*|docker.*|flannel.*|cali.*|cbr.*"}[5m]))',
	networkTx:
		'sum(rate(node_network_transmit_bytes_total{device!~"lo|veth.*|docker.*|flannel.*|cali.*|cbr.*"}[5m]))',
	pvcUsage:
		'sum(kubelet_volume_stats_used_bytes) / sum(kubelet_volume_stats_capacity_bytes) * 100',
	pods: 'sum(kube_pod_status_phase{phase="Running"})',
	nodes: 'count(kube_node_info)',
	containers: 'sum(kube_pod_container_status_running)',
	failedPods: 'sum(kube_pod_status_phase{phase="Failed"})',
	pendingPods: 'sum(kube_pod_status_phase{phase="Pending"})',
	deployments: 'count(kube_deployment_created)',
	perNodeCpu:
		'avg by (instance) (100 - (irate(node_cpu_seconds_total{mode="idle"}[5m]) * 100))',
	perNodeMemory:
		'(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
	perNodeDisk:
		'(1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"})) * 100',
	namespacePods:
		'topk(8, sum by (namespace) (kube_pod_status_phase{phase="Running"}))',
} as const;

function podRestartsQuery(window: string): string {
	return `sum(increase(kube_pod_container_status_restarts_total[${window}]))`;
}

export const EMPTY_SNAPSHOT: MetricSnapshot = {
	cpu: null,
	memory: null,
	disk: null,
	networkRx: null,
	networkTx: null,
	pvcUsage: null,
	pods: null,
	nodes: null,
	containers: null,
	podRestarts: null,
	failedPods: null,
	pendingPods: null,
	deployments: null,
};

export const RESOURCE_THRESHOLDS = { warn: 70, crit: 85 };

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class AccessRestrictedError extends Error {
	constructor() {
		super('Access restricted');
		this.name = 'AccessRestrictedError';
	}
}

// ---------------------------------------------------------------------------
// Helpers (exported for islands)
// ---------------------------------------------------------------------------

export function formatBytes(bytesPerSec: number | null): string {
	if (bytesPerSec == null) return '--';
	if (bytesPerSec >= 1_000_000_000)
		return `${(bytesPerSec / 1_000_000_000).toFixed(1)} GB/s`;
	if (bytesPerSec >= 1_000_000)
		return `${(bytesPerSec / 1_000_000).toFixed(1)} MB/s`;
	if (bytesPerSec >= 1_000) return `${(bytesPerSec / 1_000).toFixed(1)} KB/s`;
	return `${bytesPerSec.toFixed(0)} B/s`;
}

export function getThresholdColor(
	value: number,
	thresholds: { warn: number; crit: number },
): string {
	if (value >= thresholds.crit) return '#ef4444';
	if (value >= thresholds.warn) return '#eab308';
	return '#22c55e';
}

function computeTrend(
	current: number | null,
	previous: number | null,
): TrendInfo {
	if (current == null || previous == null || previous === 0) {
		return { direction: 'flat', percentChange: null };
	}
	const change = ((current - previous) / Math.abs(previous)) * 100;
	return {
		direction: change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'flat',
		percentChange: change,
	};
}

function computeSparkline(
	rangeData: Array<[number, string]>,
	targetPoints = 12,
): SparklinePoint[] {
	if (rangeData.length === 0) return [];
	if (rangeData.length <= targetPoints) {
		return rangeData.map(([t, v]) => ({ t, v: parseFloat(v) }));
	}
	const step = Math.floor(rangeData.length / targetPoints);
	const result: SparklinePoint[] = [];
	for (let i = 0; i < rangeData.length; i += step) {
		const [t, v] = rangeData[i];
		result.push({ t, v: parseFloat(v) });
	}
	return result;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function cacheKey(tr: TimeRangeKey): string {
	return `${CACHE_KEY_PREFIX}:${tr}`;
}

function getCachedDashboard(
	userId: string,
	tr: TimeRangeKey,
): CachedDashboard | null {
	try {
		const raw = localStorage.getItem(cacheKey(tr));
		if (!raw) return null;
		const cached: CachedDashboard = JSON.parse(raw);
		if (cached.user_id !== userId) {
			localStorage.removeItem(cacheKey(tr));
			return null;
		}
		if (Date.now() - cached.cached_at > CACHE_TTL_MS) return null;
		return cached;
	} catch {
		return null;
	}
}

function setCachedDashboard(data: CachedDashboard): void {
	try {
		for (const k of TIME_RANGE_KEYS) {
			if (k !== data.timeRange) {
				localStorage.removeItem(cacheKey(k));
			}
		}
		localStorage.setItem(cacheKey(data.timeRange), JSON.stringify(data));
	} catch {
		/* quota exceeded */
	}
}

// ---------------------------------------------------------------------------
// Grafana API helpers
// ---------------------------------------------------------------------------

async function findPrometheusDatasourceId(
	token: string,
): Promise<number | null> {
	try {
		const cached = localStorage.getItem(DS_CACHE_KEY);
		if (cached) return parseInt(cached, 10);
	} catch {
		/* ignore */
	}

	try {
		const resp = await fetch(`${PROXY_BASE}/api/datasources`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (resp.status === 403) throw new AccessRestrictedError();
		if (!resp.ok) return null;
		const sources: Array<{ id: number; type: string; name: string }> =
			await resp.json();
		const prom = sources.find(
			(s) => s.type === 'prometheus' || s.name === 'Prometheus',
		);
		if (!prom) return null;
		try {
			localStorage.setItem(DS_CACHE_KEY, String(prom.id));
		} catch {
			/* ignore */
		}
		return prom.id;
	} catch (e) {
		if (e instanceof AccessRestrictedError) throw e;
		return null;
	}
}

async function queryInstant(
	token: string,
	dsId: number,
	expr: string,
): Promise<number | null> {
	try {
		const resp = await fetch(
			`${PROXY_BASE}/api/datasources/proxy/${dsId}/api/v1/query`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: `query=${encodeURIComponent(expr)}`,
			},
		);
		if (!resp.ok) return null;
		const data = await resp.json();
		const val = data?.data?.result?.[0]?.value?.[1];
		return val != null ? parseFloat(val) : null;
	} catch {
		return null;
	}
}

async function queryInstantAt(
	token: string,
	dsId: number,
	expr: string,
	time: number,
): Promise<number | null> {
	try {
		const resp = await fetch(
			`${PROXY_BASE}/api/datasources/proxy/${dsId}/api/v1/query`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: `query=${encodeURIComponent(expr)}&time=${time}`,
			},
		);
		if (!resp.ok) return null;
		const data = await resp.json();
		const val = data?.data?.result?.[0]?.value?.[1];
		return val != null ? parseFloat(val) : null;
	} catch {
		return null;
	}
}

async function queryInstantMulti(
	token: string,
	dsId: number,
	expr: string,
): Promise<InstantResult[]> {
	try {
		const resp = await fetch(
			`${PROXY_BASE}/api/datasources/proxy/${dsId}/api/v1/query`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: `query=${encodeURIComponent(expr)}`,
			},
		);
		if (!resp.ok) return [];
		const data = await resp.json();
		return (data?.data?.result ?? []).map(
			(r: {
				metric: Record<string, string>;
				value: [number, string];
			}) => ({
				metric: r.metric,
				value: r.value?.[1] != null ? parseFloat(r.value[1]) : null,
			}),
		);
	} catch {
		return [];
	}
}

async function queryRange(
	token: string,
	dsId: number,
	expr: string,
	start: number,
	end: number,
	step: number,
): Promise<Array<[number, string]>> {
	try {
		const resp = await fetch(
			`${PROXY_BASE}/api/datasources/proxy/${dsId}/api/v1/query_range`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: `query=${encodeURIComponent(expr)}&start=${start}&end=${end}&step=${step}`,
			},
		);
		if (!resp.ok) return [];
		const data = await resp.json();
		return data?.data?.result?.[0]?.values ?? [];
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class GrafanaService {
	// Auth
	public readonly $state = atom<DashboardState>('loading');
	public readonly $accessToken = atom<string | null>(null);
	public readonly $userId = atom<string | null>(null);

	// Data
	public readonly $snapshot = atom<MetricSnapshot>(EMPTY_SNAPSHOT);
	public readonly $timeSeries = atom<TimeSeriesPoint[]>([]);
	public readonly $k8sTimeSeries = atom<K8sTimeSeriesPoint[]>([]);
	public readonly $networkTimeSeries = atom<NetworkTimeSeriesPoint[]>([]);
	public readonly $diskTimeSeries = atom<DiskTimeSeriesPoint[]>([]);
	public readonly $trends = atom<Record<string, TrendInfo>>({});
	public readonly $sparklines = atom<Record<string, SparklinePoint[]>>({});

	// UI state
	public readonly $fromCache = atom<boolean>(false);
	public readonly $refreshing = atom<boolean>(false);
	public readonly $error = atom<string | null>(null);
	public readonly $timeRange = atom<TimeRangeKey>(this._loadTimeRange());

	// Drill-down
	public readonly $expandedCard = atom<ExpandedCard>(null);
	public readonly $perNodeMetrics = atom<PerNodeMetric[]>([]);
	public readonly $namespacePods = atom<NamespacePodCount[]>([]);
	public readonly $drillDownLoading = atom<boolean>(false);

	// Alerts (populated by ReactGrafanaAlerts island; exposed here so the
	// header island can subscribe to firing-count + state without a second
	// fetch).
	public readonly $alerts = atom<Alert[]>([]);
	public readonly $alertsFiring = atom<number>(0);
	public readonly $alertsPending = atom<number>(0);
	public readonly $alertsLoaded = atom<boolean>(false);
	public readonly $alertsError = atom<string | null>(null);

	// --- Init ---

	private _loadTimeRange(): TimeRangeKey {
		try {
			const saved = localStorage.getItem(TR_STORAGE_KEY);
			if (saved && saved in TIME_RANGES) return saved as TimeRangeKey;
		} catch {
			/* ignore */
		}
		return '6h';
	}

	public async initAuth(): Promise<void> {
		try {
			await initSupa();
			const supa = getSupa();
			const sessionResult = await supa.getSession().catch(() => null);
			const session = sessionResult?.session ?? null;

			if (!session?.access_token) {
				this.$state.set('unauthenticated');
				return;
			}

			const token = session.access_token as string;
			const uid = String(session.user?.id ?? '');

			this.$accessToken.set(token);
			this.$userId.set(uid || null);
			this.$state.set('authenticated');

			if (uid) {
				this.fetchMetrics(token, uid, this.$timeRange.get());
			}
		} catch {
			this.$state.set('unauthenticated');
		}
	}

	// --- Metric fetching ---

	public async fetchMetrics(
		token: string,
		uid: string,
		tr: TimeRangeKey,
		skipCache = false,
	): Promise<void> {
		if (!skipCache) {
			const cached = getCachedDashboard(uid, tr);
			if (cached) {
				this.$snapshot.set(cached.snapshot);
				this.$timeSeries.set(cached.timeSeries);
				this.$k8sTimeSeries.set(cached.k8sTimeSeries ?? []);
				this.$networkTimeSeries.set(cached.networkTimeSeries ?? []);
				this.$diskTimeSeries.set(cached.diskTimeSeries ?? []);
				this.$trends.set(cached.trends ?? {});
				this.$sparklines.set(cached.sparklines ?? {});
				this.$fromCache.set(true);
				return;
			}
		}

		this.$refreshing.set(true);
		this.$error.set(null);

		try {
			const dsId = await findPrometheusDatasourceId(token);
			if (dsId == null) {
				this.$error.set(
					'Could not find Prometheus datasource in Grafana',
				);
				this.$refreshing.set(false);
				return;
			}

			const config = TIME_RANGES[tr];
			const now = Math.floor(Date.now() / 1000);
			const rangeStart = now - config.seconds;

			// Phase 1: All instant metrics in parallel
			const [
				cpu,
				memory,
				disk,
				networkRx,
				networkTx,
				pvcUsage,
				pods,
				nodes,
				containers,
				podRestarts,
				failedPods,
				pendingPods,
				deployments,
			] = await Promise.all([
				queryInstant(token, dsId, QUERIES.cpu),
				queryInstant(token, dsId, QUERIES.memory),
				queryInstant(token, dsId, QUERIES.disk),
				queryInstant(token, dsId, QUERIES.networkRx),
				queryInstant(token, dsId, QUERIES.networkTx),
				queryInstant(token, dsId, QUERIES.pvcUsage),
				queryInstant(token, dsId, QUERIES.pods),
				queryInstant(token, dsId, QUERIES.nodes),
				queryInstant(token, dsId, QUERIES.containers),
				queryInstant(
					token,
					dsId,
					podRestartsQuery(config.restartWindow),
				),
				queryInstant(token, dsId, QUERIES.failedPods),
				queryInstant(token, dsId, QUERIES.pendingPods),
				queryInstant(token, dsId, QUERIES.deployments),
			]);

			const snap: MetricSnapshot = {
				cpu,
				memory,
				disk,
				networkRx,
				networkTx,
				pvcUsage,
				pods,
				nodes,
				containers,
				podRestarts:
					podRestarts != null ? Math.round(podRestarts) : null,
				failedPods,
				pendingPods,
				deployments,
			};
			this.$snapshot.set(snap);

			// Phase 2 (range) + Phase 3 (trends) in parallel
			const [rangeResults, trendResults] = await Promise.all([
				Promise.all([
					queryRange(
						token,
						dsId,
						QUERIES.cpu,
						rangeStart,
						now,
						config.step,
					),
					queryRange(
						token,
						dsId,
						QUERIES.memory,
						rangeStart,
						now,
						config.step,
					),
					queryRange(
						token,
						dsId,
						QUERIES.pods,
						rangeStart,
						now,
						config.step,
					),
					queryRange(
						token,
						dsId,
						QUERIES.networkRx,
						rangeStart,
						now,
						config.step,
					),
					queryRange(
						token,
						dsId,
						QUERIES.networkTx,
						rangeStart,
						now,
						config.step,
					),
					queryRange(
						token,
						dsId,
						QUERIES.disk,
						rangeStart,
						now,
						config.step,
					),
				]),
				Promise.all([
					queryInstantAt(token, dsId, QUERIES.cpu, rangeStart),
					queryInstantAt(token, dsId, QUERIES.memory, rangeStart),
					queryInstantAt(token, dsId, QUERIES.disk, rangeStart),
					queryInstantAt(token, dsId, QUERIES.pods, rangeStart),
					queryInstantAt(token, dsId, QUERIES.containers, rangeStart),
					queryInstantAt(
						token,
						dsId,
						QUERIES.deployments,
						rangeStart,
					),
				]),
			]);

			const [cpuRange, memRange, podRange, rxRange, txRange, diskRange] =
				rangeResults;
			const [
				prevCpu,
				prevMem,
				prevDisk,
				prevPods,
				prevContainers,
				prevDeploys,
			] = trendResults;

			// Build CPU + Memory time series
			const tsMap = new Map<number, TimeSeriesPoint>();
			for (const [ts, val] of cpuRange) {
				tsMap.set(ts, {
					timestamp: ts,
					cpu: parseFloat(val),
					memory: null,
				});
			}
			for (const [ts, val] of memRange) {
				const existing = tsMap.get(ts);
				if (existing) {
					existing.memory = parseFloat(val);
				} else {
					tsMap.set(ts, {
						timestamp: ts,
						cpu: null,
						memory: parseFloat(val),
					});
				}
			}
			const ts = Array.from(tsMap.values()).sort(
				(a, b) => a.timestamp - b.timestamp,
			);
			this.$timeSeries.set(ts);

			// Build K8s pod time series
			const k8sTs: K8sTimeSeriesPoint[] = podRange.map(([t, val]) => ({
				timestamp: t,
				pods: parseFloat(val),
			}));
			this.$k8sTimeSeries.set(k8sTs);

			// Build Network time series
			const netMap = new Map<number, NetworkTimeSeriesPoint>();
			for (const [t, val] of rxRange) {
				netMap.set(t, { timestamp: t, rx: parseFloat(val), tx: null });
			}
			for (const [t, val] of txRange) {
				const existing = netMap.get(t);
				if (existing) {
					existing.tx = parseFloat(val);
				} else {
					netMap.set(t, {
						timestamp: t,
						rx: null,
						tx: parseFloat(val),
					});
				}
			}
			const netTs = Array.from(netMap.values()).sort(
				(a, b) => a.timestamp - b.timestamp,
			);
			this.$networkTimeSeries.set(netTs);

			// Build Disk time series
			const diskTs: DiskTimeSeriesPoint[] = diskRange.map(([t, val]) => ({
				timestamp: t,
				disk: parseFloat(val),
			}));
			this.$diskTimeSeries.set(diskTs);

			// Compute trends
			const newTrends: Record<string, TrendInfo> = {
				cpu: computeTrend(cpu, prevCpu),
				memory: computeTrend(memory, prevMem),
				disk: computeTrend(disk, prevDisk),
				pods: computeTrend(pods, prevPods),
				containers: computeTrend(containers, prevContainers),
				deployments: computeTrend(deployments, prevDeploys),
			};
			this.$trends.set(newTrends);

			// Compute sparklines
			const newSparklines: Record<string, SparklinePoint[]> = {
				cpu: computeSparkline(cpuRange),
				memory: computeSparkline(memRange),
				disk: computeSparkline(diskRange),
				pods: computeSparkline(podRange),
			};
			this.$sparklines.set(newSparklines);

			// Cache
			setCachedDashboard({
				snapshot: snap,
				timeSeries: ts,
				k8sTimeSeries: k8sTs,
				networkTimeSeries: netTs,
				diskTimeSeries: diskTs,
				trends: newTrends,
				sparklines: newSparklines,
				timeRange: tr,
				cached_at: Date.now(),
				user_id: uid,
			});
			this.$fromCache.set(false);
		} catch (e: unknown) {
			if (e instanceof AccessRestrictedError) {
				this.$state.set('forbidden');
				return;
			}
			this.$error.set(
				e instanceof Error ? e.message : 'Failed to fetch metrics',
			);
		} finally {
			this.$refreshing.set(false);
		}
	}

	// --- Drill-down ---

	public async fetchDrillDown(card: ExpandedCard): Promise<void> {
		if (!card) return;
		const token = this.$accessToken.get();
		if (!token) return;

		this.$drillDownLoading.set(true);
		try {
			const dsId = await findPrometheusDatasourceId(token);
			if (!dsId) return;

			if (card === 'cpu' || card === 'memory' || card === 'disk') {
				const [cpuResults, memResults, diskResults] = await Promise.all(
					[
						queryInstantMulti(token, dsId, QUERIES.perNodeCpu),
						queryInstantMulti(token, dsId, QUERIES.perNodeMemory),
						queryInstantMulti(token, dsId, QUERIES.perNodeDisk),
					],
				);

				const nodeMap = new Map<string, PerNodeMetric>();
				for (const r of cpuResults) {
					const inst = r.metric.instance ?? 'unknown';
					const existing = nodeMap.get(inst) ?? {
						instance: inst,
						cpu: null,
						memory: null,
						disk: null,
					};
					existing.cpu = r.value;
					nodeMap.set(inst, existing);
				}
				for (const r of memResults) {
					const inst = r.metric.instance ?? 'unknown';
					const existing = nodeMap.get(inst) ?? {
						instance: inst,
						cpu: null,
						memory: null,
						disk: null,
					};
					existing.memory = r.value;
					nodeMap.set(inst, existing);
				}
				for (const r of diskResults) {
					const inst = r.metric.instance ?? 'unknown';
					const existing = nodeMap.get(inst) ?? {
						instance: inst,
						cpu: null,
						memory: null,
						disk: null,
					};
					existing.disk = r.value;
					nodeMap.set(inst, existing);
				}
				this.$perNodeMetrics.set(Array.from(nodeMap.values()));
			}

			if (card === 'pods') {
				const results = await queryInstantMulti(
					token,
					dsId,
					QUERIES.namespacePods,
				);
				const nsPods: NamespacePodCount[] = results
					.map((r) => ({
						namespace: r.metric.namespace ?? 'unknown',
						count: r.value != null ? Math.round(r.value) : 0,
					}))
					.sort((a, b) => b.count - a.count);
				this.$namespacePods.set(nsPods);
			}
		} catch {
			/* drill-down errors are non-fatal */
		} finally {
			this.$drillDownLoading.set(false);
		}
	}

	// --- Actions ---

	public setTimeRange(tr: TimeRangeKey): void {
		this.$timeRange.set(tr);
		this.$expandedCard.set(null);
		try {
			localStorage.setItem(TR_STORAGE_KEY, tr);
		} catch {
			/* ignore */
		}
		const token = this.$accessToken.get();
		const uid = this.$userId.get();
		if (token && uid) {
			this.fetchMetrics(token, uid, tr, true);
		}
	}

	public refresh(): void {
		const token = this.$accessToken.get();
		const uid = this.$userId.get();
		const tr = this.$timeRange.get();
		if (token && uid && !this.$refreshing.get()) {
			this.fetchMetrics(token, uid, tr, true);
		}
	}

	public toggleCard(card: ExpandedCard): void {
		if (this.$expandedCard.get() === card) {
			this.$expandedCard.set(null);
			return;
		}
		this.$expandedCard.set(card);
		this.fetchDrillDown(card);
	}
}

export const grafanaService = new GrafanaService();

// ---------------------------------------------------------------------------
// Pod-scoped metrics — used by ReactArgoGrafanaPanel inside the Argo
// resource-detail drawer. Reuses the same Grafana proxy + datasource cache,
// just with namespace+pod-scoped Prometheus expressions.
// ---------------------------------------------------------------------------

export interface PodMetricsSnapshot {
	cpuCores: number | null;
	memoryBytes: number | null;
	memoryLimitBytes: number | null;
	netRxBytesPerSec: number | null;
	netTxBytesPerSec: number | null;
	fsBytes: number | null;
	restarts: number | null;
	running: boolean | null;
}

export interface PodTimeSeriesPoint {
	timestamp: number;
	cpu: number | null;
	memory: number | null;
}

export interface PodNetTimeSeriesPoint {
	timestamp: number;
	rx: number | null;
	tx: number | null;
}

export interface PodMetrics {
	snapshot: PodMetricsSnapshot;
	cpuMemSeries: PodTimeSeriesPoint[];
	netSeries: PodNetTimeSeriesPoint[];
	fromCache: boolean;
}

interface CachedPodMetrics {
	metrics: PodMetrics;
	cached_at: number;
	user_id: string;
}

const POD_CACHE_KEY_PREFIX = 'cache:grafana:pod';
const POD_CACHE_TTL_MS = 5 * 60 * 1000;

function podCacheKey(
	uid: string,
	ns: string,
	pod: string,
	tr: TimeRangeKey,
): string {
	return `${POD_CACHE_KEY_PREFIX}:${uid}:${ns}:${pod}:${tr}`;
}

function getCachedPodMetrics(
	uid: string,
	ns: string,
	pod: string,
	tr: TimeRangeKey,
): PodMetrics | null {
	try {
		const raw = localStorage.getItem(podCacheKey(uid, ns, pod, tr));
		if (!raw) return null;
		const cached: CachedPodMetrics = JSON.parse(raw);
		if (cached.user_id !== uid) {
			localStorage.removeItem(podCacheKey(uid, ns, pod, tr));
			return null;
		}
		if (Date.now() - cached.cached_at > POD_CACHE_TTL_MS) return null;
		return { ...cached.metrics, fromCache: true };
	} catch {
		return null;
	}
}

function setCachedPodMetrics(
	uid: string,
	ns: string,
	pod: string,
	tr: TimeRangeKey,
	metrics: PodMetrics,
): void {
	try {
		const payload: CachedPodMetrics = {
			metrics: { ...metrics, fromCache: false },
			cached_at: Date.now(),
			user_id: uid,
		};
		localStorage.setItem(
			podCacheKey(uid, ns, pod, tr),
			JSON.stringify(payload),
		);
	} catch {
		/* quota exceeded */
	}
}

function escapeLabel(v: string): string {
	return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function podQueries(
	ns: string,
	pod: string,
): {
	cpu: string;
	memory: string;
	memoryLimit: string;
	netRx: string;
	netTx: string;
	fs: string;
	restarts: string;
	running: string;
} {
	const sel = `namespace="${escapeLabel(ns)}",pod="${escapeLabel(pod)}"`;
	const containerSel = `${sel},container!="POD",container!=""`;
	return {
		cpu: `sum(rate(container_cpu_usage_seconds_total{${containerSel}}[5m]))`,
		memory: `sum(container_memory_working_set_bytes{${containerSel}})`,
		memoryLimit: `sum(kube_pod_container_resource_limits{${sel},resource="memory"})`,
		netRx: `sum(rate(container_network_receive_bytes_total{${sel}}[5m]))`,
		netTx: `sum(rate(container_network_transmit_bytes_total{${sel}}[5m]))`,
		fs: `sum(container_fs_usage_bytes{${containerSel}})`,
		restarts: `sum(kube_pod_container_status_restarts_total{${sel}})`,
		running: `kube_pod_status_phase{${sel},phase="Running"}`,
	};
}

export async function fetchPodMetrics(
	token: string,
	uid: string,
	ns: string,
	pod: string,
	tr: TimeRangeKey,
	skipCache = false,
): Promise<PodMetrics | null> {
	if (!skipCache) {
		const cached = getCachedPodMetrics(uid, ns, pod, tr);
		if (cached) return cached;
	}

	const dsId = await findPrometheusDatasourceId(token);
	if (dsId == null) return null;

	const config = TIME_RANGES[tr];
	const now = Math.floor(Date.now() / 1000);
	const rangeStart = now - config.seconds;
	const q = podQueries(ns, pod);

	const [
		cpuCores,
		memoryBytes,
		memoryLimitBytes,
		netRx,
		netTx,
		fsBytes,
		restarts,
		runningRaw,
	] = await Promise.all([
		queryInstant(token, dsId, q.cpu),
		queryInstant(token, dsId, q.memory),
		queryInstant(token, dsId, q.memoryLimit),
		queryInstant(token, dsId, q.netRx),
		queryInstant(token, dsId, q.netTx),
		queryInstant(token, dsId, q.fs),
		queryInstant(token, dsId, q.restarts),
		queryInstant(token, dsId, q.running),
	]);

	const [cpuRange, memRange, rxRange, txRange] = await Promise.all([
		queryRange(token, dsId, q.cpu, rangeStart, now, config.step),
		queryRange(token, dsId, q.memory, rangeStart, now, config.step),
		queryRange(token, dsId, q.netRx, rangeStart, now, config.step),
		queryRange(token, dsId, q.netTx, rangeStart, now, config.step),
	]);

	const cpuMemMap = new Map<number, PodTimeSeriesPoint>();
	for (const [ts, val] of cpuRange) {
		cpuMemMap.set(ts, {
			timestamp: ts,
			cpu: parseFloat(val),
			memory: null,
		});
	}
	for (const [ts, val] of memRange) {
		const existing = cpuMemMap.get(ts);
		if (existing) {
			existing.memory = parseFloat(val);
		} else {
			cpuMemMap.set(ts, {
				timestamp: ts,
				cpu: null,
				memory: parseFloat(val),
			});
		}
	}
	const cpuMemSeries = Array.from(cpuMemMap.values()).sort(
		(a, b) => a.timestamp - b.timestamp,
	);

	const netMap = new Map<number, PodNetTimeSeriesPoint>();
	for (const [ts, val] of rxRange) {
		netMap.set(ts, { timestamp: ts, rx: parseFloat(val), tx: null });
	}
	for (const [ts, val] of txRange) {
		const existing = netMap.get(ts);
		if (existing) {
			existing.tx = parseFloat(val);
		} else {
			netMap.set(ts, {
				timestamp: ts,
				rx: null,
				tx: parseFloat(val),
			});
		}
	}
	const netSeries = Array.from(netMap.values()).sort(
		(a, b) => a.timestamp - b.timestamp,
	);

	const metrics: PodMetrics = {
		snapshot: {
			cpuCores,
			memoryBytes,
			memoryLimitBytes,
			netRxBytesPerSec: netRx,
			netTxBytesPerSec: netTx,
			fsBytes,
			restarts: restarts != null ? Math.round(restarts) : null,
			running: runningRaw != null ? runningRaw >= 1 : null,
		},
		cpuMemSeries,
		netSeries,
		fromCache: false,
	};

	setCachedPodMetrics(uid, ns, pod, tr, metrics);
	return metrics;
}

// ---------------------------------------------------------------------------
// Alerts — surfaces firing PrometheusRules through Grafana's unified
// alerting Prometheus-compatible API. One endpoint, no datasource lookup,
// matches the same proxy auth path the rest of the dashboard uses.
//
// Endpoint: GET /api/prometheus/grafana/api/v1/alerts (proxied)
// Response: { status: "success", data: { alerts: Alert[] } }
//
// Cached per-user (no time-range key — alert state is "now") with a 60s
// TTL so the alerts panel stays close to live without hammering Grafana.
// ---------------------------------------------------------------------------

export interface Alert {
	labels: Record<string, string>;
	annotations: Record<string, string>;
	state: 'firing' | 'pending' | 'inactive' | string;
	activeAt: string | null;
	value: string | null;
}

export interface AlertsSnapshot {
	alerts: Alert[];
	firingCount: number;
	pendingCount: number;
	fetchedAt: number;
	fromCache: boolean;
}

interface CachedAlerts {
	snapshot: AlertsSnapshot;
	user_id: string;
}

const ALERTS_CACHE_KEY = 'cache:grafana:alerts';
const ALERTS_CACHE_TTL_MS = 60 * 1000;

function getCachedAlerts(uid: string): AlertsSnapshot | null {
	try {
		const raw = localStorage.getItem(ALERTS_CACHE_KEY);
		if (!raw) return null;
		const cached: CachedAlerts = JSON.parse(raw);
		if (cached.user_id !== uid) {
			localStorage.removeItem(ALERTS_CACHE_KEY);
			return null;
		}
		if (Date.now() - cached.snapshot.fetchedAt > ALERTS_CACHE_TTL_MS) {
			return null;
		}
		return { ...cached.snapshot, fromCache: true };
	} catch {
		return null;
	}
}

function setCachedAlerts(uid: string, snapshot: AlertsSnapshot): void {
	try {
		const payload: CachedAlerts = {
			snapshot: { ...snapshot, fromCache: false },
			user_id: uid,
		};
		localStorage.setItem(ALERTS_CACHE_KEY, JSON.stringify(payload));
	} catch {
		/* quota exceeded */
	}
}

function rankAlert(a: Alert): number {
	const sev = (a.labels.severity ?? '').toLowerCase();
	if (sev === 'critical') return 0;
	if (sev === 'high') return 1;
	if (sev === 'warning' || sev === 'medium') return 2;
	if (sev === 'info' || sev === 'low') return 3;
	return 4;
}

export async function fetchAlerts(
	token: string,
	uid: string,
	skipCache = false,
): Promise<AlertsSnapshot | null> {
	if (!skipCache) {
		const cached = getCachedAlerts(uid);
		if (cached) return cached;
	}

	const resp = await fetch(
		`${PROXY_BASE}/api/prometheus/grafana/api/v1/alerts`,
		{ headers: { Authorization: `Bearer ${token}` } },
	);

	if (resp.status === 403) {
		throw new AccessRestrictedError();
	}
	if (!resp.ok) return null;

	const body: { data?: { alerts?: Alert[] } } = await resp.json();
	const raw = body?.data?.alerts ?? [];

	const sorted = [...raw].sort((a, b) => {
		const sevDiff = rankAlert(a) - rankAlert(b);
		if (sevDiff !== 0) return sevDiff;
		return (a.labels.alertname ?? '').localeCompare(
			b.labels.alertname ?? '',
		);
	});

	const snapshot: AlertsSnapshot = {
		alerts: sorted,
		firingCount: sorted.filter((a) => a.state === 'firing').length,
		pendingCount: sorted.filter((a) => a.state === 'pending').length,
		fetchedAt: Date.now(),
		fromCache: false,
	};

	setCachedAlerts(uid, snapshot);
	return snapshot;
}

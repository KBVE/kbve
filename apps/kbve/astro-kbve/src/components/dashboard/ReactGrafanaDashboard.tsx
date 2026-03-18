/**
 * @deprecated — SLATED FOR REMOVAL
 *
 * This monolithic component has been replaced by the nanostore island architecture:
 *   - grafanaService.ts         → Nanostore singleton (state + API logic)
 *   - ReactGrafanaAuth.tsx      → Auth gate with OAuth buttons island
 *   - ReactGrafanaHeader.tsx    → Header island (title, time range, refresh)
 *   - ReactGrafanaNodes.tsx     → Node metrics, drill-downs, charts island
 *   - ReactGrafanaK8s.tsx       → K8s metrics, drill-downs, pods chart island
 *   - AstroGrafanaDashboard.astro → Static Astro shell mounting all islands
 *
 * Remove this file once all references are confirmed migrated.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { initSupa, getSupa } from '@/lib/supa';
import { useAuthBridge } from '@/components/auth';
import {
	Activity,
	Server,
	Cpu,
	HardDrive,
	RefreshCw,
	Loader2,
	LogIn,
	AlertCircle,
	ShieldOff,
	Network,
	Box,
	RotateCcw,
	AlertTriangle,
	Clock,
	Layers,
	TrendingUp,
	TrendingDown,
	Database,
	X,
} from 'lucide-react';
import {
	AreaChart,
	Area,
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_PREFIX = 'cache:grafana:cluster';
const DS_CACHE_KEY = 'cache:grafana:ds-id';
const TR_STORAGE_KEY = 'grafana:timeRange';
const CACHE_TTL_MS = 5 * 60 * 1000;
const PROXY_BASE = '/dashboard/grafana/proxy';

// ---------------------------------------------------------------------------
// Time Range Configuration
// ---------------------------------------------------------------------------

type TimeRangeKey = '1h' | '6h' | '24h' | '7d';

interface TimeRangeConfig {
	label: string;
	seconds: number;
	step: number;
	restartWindow: string;
}

const TIME_RANGES: Record<TimeRangeKey, TimeRangeConfig> = {
	'1h': { label: '1h', seconds: 3600, step: 60, restartWindow: '1h' },
	'6h': { label: '6h', seconds: 21600, step: 300, restartWindow: '6h' },
	'24h': { label: '24h', seconds: 86400, step: 900, restartWindow: '24h' },
	'7d': { label: '7d', seconds: 604800, step: 3600, restartWindow: '7d' },
};

const TIME_RANGE_KEYS = Object.keys(TIME_RANGES) as TimeRangeKey[];

// ---------------------------------------------------------------------------
// Prometheus Queries
// ---------------------------------------------------------------------------

const QUERIES = {
	// Node Resources
	cpu: 'avg(100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))',
	memory: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
	disk: '(1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"})) * 100',
	networkRx:
		'sum(rate(node_network_receive_bytes_total{device!~"lo|veth.*|docker.*|flannel.*|cali.*|cbr.*"}[5m]))',
	networkTx:
		'sum(rate(node_network_transmit_bytes_total{device!~"lo|veth.*|docker.*|flannel.*|cali.*|cbr.*"}[5m]))',
	pvcUsage:
		'sum(kubelet_volume_stats_used_bytes) / sum(kubelet_volume_stats_capacity_bytes) * 100',
	// Kubernetes
	pods: 'sum(kube_pod_status_phase{phase="Running"})',
	nodes: 'count(kube_node_info)',
	containers: 'sum(kube_pod_container_status_running)',
	failedPods: 'sum(kube_pod_status_phase{phase="Failed"})',
	pendingPods: 'sum(kube_pod_status_phase{phase="Pending"})',
	deployments: 'count(kube_deployment_created)',
	// Drill-down
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DashboardState =
	| 'loading'
	| 'authenticated'
	| 'unauthenticated'
	| 'forbidden';

interface MetricSnapshot {
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

interface TimeSeriesPoint {
	timestamp: number;
	cpu: number | null;
	memory: number | null;
}

interface K8sTimeSeriesPoint {
	timestamp: number;
	pods: number | null;
}

interface NetworkTimeSeriesPoint {
	timestamp: number;
	rx: number | null;
	tx: number | null;
}

interface DiskTimeSeriesPoint {
	timestamp: number;
	disk: number | null;
}

interface TrendInfo {
	direction: 'up' | 'down' | 'flat';
	percentChange: number | null;
}

interface SparklinePoint {
	t: number;
	v: number;
}

interface InstantResult {
	metric: Record<string, string>;
	value: number | null;
}

interface PerNodeMetric {
	instance: string;
	cpu: number | null;
	memory: number | null;
	disk: number | null;
}

interface NamespacePodCount {
	namespace: string;
	count: number;
}

type ExpandedCard = 'cpu' | 'memory' | 'disk' | 'pods' | null;

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
// Errors
// ---------------------------------------------------------------------------

class AccessRestrictedError extends Error {
	constructor() {
		super('Access restricted');
		this.name = 'AccessRestrictedError';
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytesPerSec: number | null): string {
	if (bytesPerSec == null) return '--';
	if (bytesPerSec >= 1_000_000_000)
		return `${(bytesPerSec / 1_000_000_000).toFixed(1)} GB/s`;
	if (bytesPerSec >= 1_000_000)
		return `${(bytesPerSec / 1_000_000).toFixed(1)} MB/s`;
	if (bytesPerSec >= 1_000) return `${(bytesPerSec / 1_000).toFixed(1)} KB/s`;
	return `${bytesPerSec.toFixed(0)} B/s`;
}

function getThresholdColor(
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

const RESOURCE_THRESHOLDS = { warn: 70, crit: 85 };

const EMPTY_SNAPSHOT: MetricSnapshot = {
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
		// Clear other ranges to avoid localStorage bloat
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
		if (resp.status === 403) {
			throw new AccessRestrictedError();
		}
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
// Sub-components
// ---------------------------------------------------------------------------

function TimeRangePicker({
	value,
	onChange,
}: {
	value: TimeRangeKey;
	onChange: (v: TimeRangeKey) => void;
}) {
	return (
		<div style={styles.timeRangePicker}>
			{TIME_RANGE_KEYS.map((key) => (
				<button
					key={key}
					onClick={() => onChange(key)}
					style={
						key === value
							? styles.timeRangeActive
							: styles.timeRangeButton
					}>
					{key}
				</button>
			))}
		</div>
	);
}

function TrendIndicator({
	trend,
	invertColors,
}: {
	trend: TrendInfo;
	invertColors?: boolean;
}) {
	if (trend.percentChange == null) return null;

	const isUp = trend.direction === 'up';
	const isDown = trend.direction === 'down';

	let color: string;
	if (invertColors) {
		color = isUp ? '#ef4444' : isDown ? '#22c55e' : '#8b949e';
	} else {
		color = isUp ? '#22c55e' : isDown ? '#ef4444' : '#8b949e';
	}

	const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Activity;
	const sign = isUp ? '+' : '';

	return (
		<div style={styles.trendRow}>
			<Icon size={12} style={{ color }} />
			<span
				style={{
					color,
					fontSize: '0.75rem',
					fontWeight: 500,
				}}>
				{sign}
				{trend.percentChange.toFixed(1)}%
			</span>
		</div>
	);
}

function SparklineChart({
	data,
	color,
}: {
	data: SparklinePoint[];
	color: string;
}) {
	if (data.length < 2) return null;
	return (
		<div style={{ width: '100%', height: 36, marginTop: 'auto' }}>
			<ResponsiveContainer width="100%" height={36}>
				<LineChart data={data}>
					<Line
						type="monotone"
						dataKey="v"
						stroke={color}
						strokeWidth={1.5}
						dot={false}
						isAnimationActive={false}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}

function EnhancedStatCard({
	icon,
	label,
	value,
	unit,
	displayValue,
	trend,
	sparkline,
	thresholds,
	invertTrend,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	value: number | null;
	unit?: string;
	displayValue?: string;
	trend?: TrendInfo;
	sparkline?: SparklinePoint[];
	thresholds?: { warn: number; crit: number };
	invertTrend?: boolean;
	onClick?: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	const hasThreshold = thresholds && value != null;
	const thresholdColor = hasThreshold
		? getThresholdColor(value, thresholds)
		: undefined;
	const valueColor = thresholdColor ?? 'var(--sl-color-text, #e6edf3)';
	const sparkColor = thresholdColor ?? '#06b6d4';
	const accentColor = thresholdColor ?? 'var(--sl-color-accent, #06b6d4)';

	return (
		<div
			style={{
				...styles.statCard,
				cursor: onClick ? 'pointer' : 'default',
				borderTop: `2px solid ${accentColor}`,
				borderColor:
					hovered && onClick
						? 'var(--sl-color-gray-4, #6b7280)'
						: undefined,
				transform: hovered && onClick ? 'translateY(-2px)' : undefined,
				boxShadow:
					hovered && onClick
						? '0 4px 12px rgba(0,0,0,0.3)'
						: undefined,
			}}
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}>
			<div style={styles.statHeader}>
				<span style={{ color: accentColor }}>{icon}</span>
				<span style={styles.statLabel}>{label}</span>
			</div>
			<div style={{ ...styles.statValue, color: valueColor }}>
				{displayValue
					? displayValue
					: value != null
						? `${Number.isInteger(value) ? value : value.toFixed(1)}${unit || ''}`
						: '--'}
			</div>
			{trend && (
				<TrendIndicator trend={trend} invertColors={invertTrend} />
			)}
			{sparkline && (
				<SparklineChart data={sparkline} color={sparkColor} />
			)}
		</div>
	);
}

function SectionHeader({ children }: { children: React.ReactNode }) {
	return <h2 style={styles.sectionTitle}>{children}</h2>;
}

function DashboardChart({
	title,
	height = 250,
	children,
}: {
	title: string;
	height?: number;
	children: React.ReactElement;
}) {
	return (
		<div style={{ ...styles.chartSection, marginTop: '1rem' }}>
			<h3 style={styles.chartTitle}>{title}</h3>
			<ResponsiveContainer width="100%" height={height}>
				{children}
			</ResponsiveContainer>
		</div>
	);
}

function PerNodeTable({
	data,
	metric,
}: {
	data: PerNodeMetric[];
	metric: 'cpu' | 'memory' | 'disk';
}) {
	const sorted = [...data].sort(
		(a, b) => (b[metric] ?? 0) - (a[metric] ?? 0),
	);

	return (
		<div style={styles.drillDownContent}>
			{sorted.map((node) => {
				const val = node[metric];
				const pct = val ?? 0;
				const color = getThresholdColor(pct, RESOURCE_THRESHOLDS);
				return (
					<div key={node.instance} style={styles.nodeRow}>
						<span style={styles.nodeLabel}>
							{node.instance.replace(/:.*$/, '')}
						</span>
						<div style={styles.barContainer}>
							<div
								style={{
									...styles.barFill,
									width: `${Math.min(pct, 100)}%`,
									background: color,
								}}
							/>
						</div>
						<span style={{ ...styles.nodeValue, color }}>
							{val != null ? `${val.toFixed(1)}%` : '--'}
						</span>
					</div>
				);
			})}
			{sorted.length === 0 && (
				<span style={styles.mutedText}>No data available</span>
			)}
		</div>
	);
}

function NamespaceBreakdown({ data }: { data: NamespacePodCount[] }) {
	const maxCount = Math.max(...data.map((d) => d.count), 1);

	return (
		<div style={styles.drillDownContent}>
			{data.map((ns) => (
				<div key={ns.namespace} style={styles.nodeRow}>
					<span style={styles.nodeLabel}>{ns.namespace}</span>
					<div style={styles.barContainer}>
						<div
							style={{
								...styles.barFill,
								width: `${(ns.count / maxCount) * 100}%`,
								background: '#06b6d4',
							}}
						/>
					</div>
					<span style={styles.nodeValue}>{ns.count}</span>
				</div>
			))}
			{data.length === 0 && (
				<span style={styles.mutedText}>No data available</span>
			)}
		</div>
	);
}

function DrillDownPanel({
	card,
	perNodeMetrics,
	namespacePods,
	loading,
	onClose,
}: {
	card: ExpandedCard;
	perNodeMetrics: PerNodeMetric[];
	namespacePods: NamespacePodCount[];
	loading: boolean;
	onClose: () => void;
}) {
	if (!card) return null;

	const title =
		card === 'pods'
			? 'Pods by Namespace'
			: `Per-Node ${card.charAt(0).toUpperCase() + card.slice(1)} Breakdown`;

	return (
		<div style={styles.drillDownPanel}>
			<div style={styles.drillDownHeader}>
				<h3 style={styles.drillDownTitle}>{title}</h3>
				<button onClick={onClose} style={styles.closeButton}>
					<X size={16} />
				</button>
			</div>
			{loading ? (
				<div
					style={{
						display: 'flex',
						justifyContent: 'center',
						padding: '1rem',
					}}>
					<Loader2
						size={20}
						style={{ animation: 'spin 1s linear infinite' }}
					/>
				</div>
			) : card === 'pods' ? (
				<NamespaceBreakdown data={namespacePods} />
			) : (
				<PerNodeTable data={perNodeMetrics} metric={card} />
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Chart helpers
// ---------------------------------------------------------------------------

const tickFormatter = (t: number) =>
	new Date(t * 1000).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
	});

const tooltipLabelFormatter = (t: number) =>
	new Date(t * 1000).toLocaleString();

const tooltipStyle = {
	background: 'var(--sl-color-bg-nav, #111)',
	border: '1px solid var(--sl-color-gray-5, #262626)',
	borderRadius: '8px',
	color: 'var(--sl-color-text, #e6edf3)',
};

const axisStroke = 'var(--sl-color-gray-3, #8b949e)';
const gridStroke = 'var(--sl-color-gray-5, #262626)';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ReactGrafanaDashboard() {
	const [state, setState] = useState<DashboardState>('loading');
	const [snapshot, setSnapshot] = useState<MetricSnapshot>(EMPTY_SNAPSHOT);
	const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
	const [k8sTimeSeries, setK8sTimeSeries] = useState<K8sTimeSeriesPoint[]>(
		[],
	);
	const [networkTimeSeries, setNetworkTimeSeries] = useState<
		NetworkTimeSeriesPoint[]
	>([]);
	const [diskTimeSeries, setDiskTimeSeries] = useState<DiskTimeSeriesPoint[]>(
		[],
	);
	const [trends, setTrends] = useState<Record<string, TrendInfo>>({});
	const [sparklines, setSparklines] = useState<
		Record<string, SparklinePoint[]>
	>({});
	const [fromCache, setFromCache] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [accessToken, setAccessToken] = useState<string | null>(null);
	const [userId, setUserId] = useState<string | null>(null);
	const [timeRange, setTimeRange] = useState<TimeRangeKey>(() => {
		try {
			const saved = localStorage.getItem(TR_STORAGE_KEY);
			if (saved && saved in TIME_RANGES) return saved as TimeRangeKey;
		} catch {
			/* ignore */
		}
		return '6h';
	});

	// Drill-down state
	const [expandedCard, setExpandedCard] = useState<ExpandedCard>(null);
	const [perNodeMetrics, setPerNodeMetrics] = useState<PerNodeMetric[]>([]);
	const [namespacePods, setNamespacePods] = useState<NamespacePodCount[]>([]);
	const [drillDownLoading, setDrillDownLoading] = useState(false);

	const { signInWithOAuth, loading: authLoading } = useAuthBridge();

	// ── Fetch Metrics ──────────────────────────────────────────────────

	const fetchMetrics = useCallback(
		async (
			token: string,
			uid: string,
			tr: TimeRangeKey,
			skipCache = false,
		) => {
			// Cache check
			if (!skipCache) {
				const cached = getCachedDashboard(uid, tr);
				if (cached) {
					setSnapshot(cached.snapshot);
					setTimeSeries(cached.timeSeries);
					setK8sTimeSeries(cached.k8sTimeSeries ?? []);
					setNetworkTimeSeries(cached.networkTimeSeries ?? []);
					setDiskTimeSeries(cached.diskTimeSeries ?? []);
					setTrends(cached.trends ?? {});
					setSparklines(cached.sparklines ?? {});
					setFromCache(true);
					return;
				}
			}

			setRefreshing(true);
			setError(null);

			try {
				const dsId = await findPrometheusDatasourceId(token);
				if (dsId == null) {
					setError('Could not find Prometheus datasource in Grafana');
					setRefreshing(false);
					return;
				}

				const config = TIME_RANGES[tr];
				const now = Math.floor(Date.now() / 1000);
				const rangeStart = now - config.seconds;

				// Phase 1: All 13 instant metrics in parallel
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
				setSnapshot(snap);

				// Phase 2 (range) + Phase 3 (trends) in parallel
				const [rangeResults, trendResults] = await Promise.all([
					// Phase 2: 6 range queries
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
					// Phase 3: 6 trend queries at start of window
					Promise.all([
						queryInstantAt(token, dsId, QUERIES.cpu, rangeStart),
						queryInstantAt(token, dsId, QUERIES.memory, rangeStart),
						queryInstantAt(token, dsId, QUERIES.disk, rangeStart),
						queryInstantAt(token, dsId, QUERIES.pods, rangeStart),
						queryInstantAt(
							token,
							dsId,
							QUERIES.containers,
							rangeStart,
						),
						queryInstantAt(
							token,
							dsId,
							QUERIES.deployments,
							rangeStart,
						),
					]),
				]);

				const [
					cpuRange,
					memRange,
					podRange,
					rxRange,
					txRange,
					diskRange,
				] = rangeResults;
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
				setTimeSeries(ts);

				// Build K8s pod time series
				const k8sTs: K8sTimeSeriesPoint[] = podRange.map(
					([t, val]) => ({
						timestamp: t,
						pods: parseFloat(val),
					}),
				);
				setK8sTimeSeries(k8sTs);

				// Build Network time series
				const netMap = new Map<number, NetworkTimeSeriesPoint>();
				for (const [t, val] of rxRange) {
					netMap.set(t, {
						timestamp: t,
						rx: parseFloat(val),
						tx: null,
					});
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
				setNetworkTimeSeries(netTs);

				// Build Disk time series
				const diskTs: DiskTimeSeriesPoint[] = diskRange.map(
					([t, val]) => ({
						timestamp: t,
						disk: parseFloat(val),
					}),
				);
				setDiskTimeSeries(diskTs);

				// Compute trends
				const newTrends: Record<string, TrendInfo> = {
					cpu: computeTrend(cpu, prevCpu),
					memory: computeTrend(memory, prevMem),
					disk: computeTrend(disk, prevDisk),
					pods: computeTrend(pods, prevPods),
					containers: computeTrend(containers, prevContainers),
					deployments: computeTrend(deployments, prevDeploys),
				};
				setTrends(newTrends);

				// Compute sparklines from range data
				const newSparklines: Record<string, SparklinePoint[]> = {
					cpu: computeSparkline(cpuRange),
					memory: computeSparkline(memRange),
					disk: computeSparkline(diskRange),
					pods: computeSparkline(podRange),
				};
				setSparklines(newSparklines);

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
				setFromCache(false);
			} catch (e: unknown) {
				if (e instanceof AccessRestrictedError) {
					setState('forbidden');
					return;
				}
				setError(
					e instanceof Error ? e.message : 'Failed to fetch metrics',
				);
			} finally {
				setRefreshing(false);
			}
		},
		[],
	);

	// ── Drill-Down Fetch ───────────────────────────────────────────────

	const fetchDrillDown = useCallback(
		async (card: ExpandedCard, token: string) => {
			if (!card) return;
			setDrillDownLoading(true);
			try {
				const dsId = await findPrometheusDatasourceId(token);
				if (!dsId) return;

				if (card === 'cpu' || card === 'memory' || card === 'disk') {
					const [cpuResults, memResults, diskResults] =
						await Promise.all([
							queryInstantMulti(token, dsId, QUERIES.perNodeCpu),
							queryInstantMulti(
								token,
								dsId,
								QUERIES.perNodeMemory,
							),
							queryInstantMulti(token, dsId, QUERIES.perNodeDisk),
						]);

					// Merge per-node metrics by instance
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
					setPerNodeMetrics(Array.from(nodeMap.values()));
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
					setNamespacePods(nsPods);
				}
			} catch {
				/* drill-down errors are non-fatal */
			} finally {
				setDrillDownLoading(false);
			}
		},
		[],
	);

	// ── Auth Init ──────────────────────────────────────────────────────

	useEffect(() => {
		let cancelled = false;

		(async () => {
			try {
				await initSupa();
				const supa = getSupa();
				const sessionResult = await supa.getSession().catch(() => null);
				const session = sessionResult?.session ?? null;

				if (cancelled) return;

				if (!session?.access_token) {
					setState('unauthenticated');
					return;
				}

				const token = session.access_token as string;
				const uid = String(session.user?.id ?? '');

				setAccessToken(token);
				setUserId(uid || null);
				setState('authenticated');

				if (uid) {
					fetchMetrics(token, uid, timeRange);
				}

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const off = supa.on('auth', async (msg: any) => {
					if (cancelled) return;
					const newSession = msg?.session;
					if (newSession?.access_token) {
						setAccessToken(String(newSession.access_token));
						setUserId(
							newSession.user?.id
								? String(newSession.user.id)
								: null,
						);
						setState('authenticated');
					} else {
						setState('unauthenticated');
						setAccessToken(null);
						setUserId(null);
					}
				});

				return () => {
					cancelled = true;
					if (typeof off === 'function') off();
				};
			} catch {
				if (!cancelled) setState('unauthenticated');
			}
		})();

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [fetchMetrics]);

	// ── Time Range Change ──────────────────────────────────────────────

	const handleTimeRangeChange = useCallback(
		(tr: TimeRangeKey) => {
			setTimeRange(tr);
			setExpandedCard(null);
			try {
				localStorage.setItem(TR_STORAGE_KEY, tr);
			} catch {
				/* ignore */
			}
			if (accessToken && userId) {
				fetchMetrics(accessToken, userId, tr, true);
			}
		},
		[accessToken, userId, fetchMetrics],
	);

	const handleRefresh = () => {
		if (accessToken && userId && !refreshing) {
			fetchMetrics(accessToken, userId, timeRange, true);
		}
	};

	const handleCardClick = useCallback(
		(card: ExpandedCard) => {
			if (expandedCard === card) {
				setExpandedCard(null);
				return;
			}
			setExpandedCard(card);
			if (accessToken) {
				fetchDrillDown(card, accessToken);
			}
		},
		[expandedCard, accessToken, fetchDrillDown],
	);

	// --- Loading ---
	if (state === 'loading') {
		return (
			<div className="not-content" style={styles.centered}>
				<Loader2
					size={32}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
				<p style={styles.mutedText}>Loading dashboard...</p>
				<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
			</div>
		);
	}

	// --- Unauthenticated ---
	if (state === 'unauthenticated') {
		return (
			<div className="not-content" style={styles.centered}>
				<LogIn size={48} style={{ color: 'var(--sl-color-gray-3)' }} />
				<h2 style={styles.authTitle}>Sign in to view dashboard</h2>
				<p style={styles.mutedText}>
					Authentication is required to access cluster metrics.
				</p>
				<div style={styles.oauthButtons}>
					{(['github', 'discord', 'twitch'] as const).map(
						(provider) => (
							<button
								key={provider}
								onClick={() => signInWithOAuth(provider)}
								disabled={authLoading}
								style={styles.oauthButton}>
								{provider.charAt(0).toUpperCase() +
									provider.slice(1)}
							</button>
						),
					)}
				</div>
			</div>
		);
	}

	// --- Forbidden (not staff) ---
	if (state === 'forbidden') {
		return (
			<div className="not-content" style={styles.centered}>
				<ShieldOff
					size={48}
					style={{ color: 'var(--sl-color-gray-3)' }}
				/>
				<h2 style={styles.authTitle}>Access Restricted</h2>
				<p style={styles.mutedText}>
					Your account does not have permission to view the monitoring
					dashboard. Contact an administrator if you believe this is
					an error.
				</p>
			</div>
		);
	}

	// --- Authenticated + Staff ---
	return (
		<div className="not-content" style={styles.dashboard}>
			{/* Header */}
			<header style={styles.header}>
				<div>
					<h1 style={styles.title}>Cluster Overview</h1>
					{fromCache && <span style={styles.cacheBadge}>cached</span>}
				</div>
				<div style={styles.headerControls}>
					<TimeRangePicker
						value={timeRange}
						onChange={handleTimeRangeChange}
					/>
					<button
						onClick={handleRefresh}
						disabled={refreshing}
						style={styles.refreshButton}
						title="Refresh metrics">
						<RefreshCw
							size={18}
							style={
								refreshing
									? { animation: 'spin 1s linear infinite' }
									: undefined
							}
						/>
					</button>
				</div>
			</header>

			{/* Error banner */}
			{error && (
				<div style={styles.errorBanner}>
					<AlertCircle size={16} />
					<span>{error}</span>
				</div>
			)}

			{/* ── Nodes Section ── */}
			<section>
				<SectionHeader>Nodes</SectionHeader>
				<div style={styles.statsGrid}>
					<EnhancedStatCard
						icon={<Cpu size={20} />}
						label="CPU Usage"
						value={snapshot.cpu}
						unit="%"
						thresholds={RESOURCE_THRESHOLDS}
						trend={trends.cpu}
						invertTrend
						sparkline={sparklines.cpu}
						onClick={() => handleCardClick('cpu')}
					/>
					<EnhancedStatCard
						icon={<HardDrive size={20} />}
						label="Memory"
						value={snapshot.memory}
						unit="%"
						thresholds={RESOURCE_THRESHOLDS}
						trend={trends.memory}
						invertTrend
						sparkline={sparklines.memory}
						onClick={() => handleCardClick('memory')}
					/>
					<EnhancedStatCard
						icon={<HardDrive size={20} />}
						label="Disk"
						value={snapshot.disk}
						unit="%"
						thresholds={RESOURCE_THRESHOLDS}
						trend={trends.disk}
						invertTrend
						sparkline={sparklines.disk}
						onClick={() => handleCardClick('disk')}
					/>
					<EnhancedStatCard
						icon={<Network size={20} />}
						label="Net RX"
						value={snapshot.networkRx}
						displayValue={formatBytes(snapshot.networkRx)}
					/>
					<EnhancedStatCard
						icon={<Network size={20} />}
						label="Net TX"
						value={snapshot.networkTx}
						displayValue={formatBytes(snapshot.networkTx)}
					/>
					<EnhancedStatCard
						icon={<Server size={20} />}
						label="Nodes"
						value={snapshot.nodes}
					/>
					<EnhancedStatCard
						icon={<Database size={20} />}
						label="PVC Usage"
						value={snapshot.pvcUsage}
						unit="%"
						thresholds={RESOURCE_THRESHOLDS}
					/>
				</div>

				{/* Drill-down panel for node metrics */}
				{(expandedCard === 'cpu' ||
					expandedCard === 'memory' ||
					expandedCard === 'disk') && (
					<DrillDownPanel
						card={expandedCard}
						perNodeMetrics={perNodeMetrics}
						namespacePods={[]}
						loading={drillDownLoading}
						onClose={() => setExpandedCard(null)}
					/>
				)}

				{/* CPU & Memory chart */}
				{timeSeries.length > 0 && (
					<DashboardChart
						title={`CPU & Memory (${timeRange})`}
						height={300}>
						<AreaChart data={timeSeries}>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke={gridStroke}
							/>
							<XAxis
								dataKey="timestamp"
								tickFormatter={tickFormatter}
								stroke={axisStroke}
								fontSize={12}
							/>
							<YAxis
								unit="%"
								domain={[0, 100]}
								stroke={axisStroke}
								fontSize={12}
							/>
							<Tooltip
								contentStyle={tooltipStyle}
								labelFormatter={tooltipLabelFormatter}
							/>
							<Area
								type="monotone"
								dataKey="cpu"
								stroke="#06b6d4"
								fill="rgba(6,182,212,0.15)"
								name="CPU %"
								strokeWidth={2}
							/>
							<Area
								type="monotone"
								dataKey="memory"
								stroke="#8b5cf6"
								fill="rgba(139,92,246,0.15)"
								name="Memory %"
								strokeWidth={2}
							/>
						</AreaChart>
					</DashboardChart>
				)}

				{/* Network Traffic chart */}
				{networkTimeSeries.length > 0 && (
					<DashboardChart
						title={`Network Traffic (${timeRange})`}
						height={250}>
						<AreaChart data={networkTimeSeries}>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke={gridStroke}
							/>
							<XAxis
								dataKey="timestamp"
								tickFormatter={tickFormatter}
								stroke={axisStroke}
								fontSize={12}
							/>
							<YAxis
								tickFormatter={(v: number) =>
									formatBytes(v).replace('/s', '')
								}
								stroke={axisStroke}
								fontSize={12}
							/>
							<Tooltip
								contentStyle={tooltipStyle}
								labelFormatter={tooltipLabelFormatter}
								formatter={(v: number) => formatBytes(v)}
							/>
							<Area
								type="monotone"
								dataKey="rx"
								stroke="#06b6d4"
								fill="rgba(6,182,212,0.15)"
								name="RX"
								strokeWidth={2}
							/>
							<Area
								type="monotone"
								dataKey="tx"
								stroke="#8b5cf6"
								fill="rgba(139,92,246,0.15)"
								name="TX"
								strokeWidth={2}
							/>
						</AreaChart>
					</DashboardChart>
				)}

				{/* Disk Usage chart */}
				{diskTimeSeries.length > 0 && (
					<DashboardChart
						title={`Disk Usage (${timeRange})`}
						height={250}>
						<AreaChart data={diskTimeSeries}>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke={gridStroke}
							/>
							<XAxis
								dataKey="timestamp"
								tickFormatter={tickFormatter}
								stroke={axisStroke}
								fontSize={12}
							/>
							<YAxis
								unit="%"
								domain={[0, 100]}
								stroke={axisStroke}
								fontSize={12}
							/>
							<Tooltip
								contentStyle={tooltipStyle}
								labelFormatter={tooltipLabelFormatter}
							/>
							<Area
								type="monotone"
								dataKey="disk"
								stroke="#f59e0b"
								fill="rgba(245,158,11,0.15)"
								name="Disk %"
								strokeWidth={2}
							/>
						</AreaChart>
					</DashboardChart>
				)}
			</section>

			{/* ── Kubernetes Section ── */}
			<section>
				<SectionHeader>Kubernetes</SectionHeader>
				<div style={styles.statsGrid}>
					<EnhancedStatCard
						icon={<Activity size={20} />}
						label="Running Pods"
						value={snapshot.pods}
						trend={trends.pods}
						sparkline={sparklines.pods}
						onClick={() => handleCardClick('pods')}
					/>
					<EnhancedStatCard
						icon={<Clock size={20} />}
						label="Pending Pods"
						value={snapshot.pendingPods}
					/>
					<EnhancedStatCard
						icon={<AlertTriangle size={20} />}
						label="Failed Pods"
						value={snapshot.failedPods}
					/>
					<EnhancedStatCard
						icon={<Box size={20} />}
						label="Containers"
						value={snapshot.containers}
						trend={trends.containers}
					/>
					<EnhancedStatCard
						icon={<RotateCcw size={20} />}
						label={`Restarts (${timeRange})`}
						value={snapshot.podRestarts}
					/>
					<EnhancedStatCard
						icon={<Layers size={20} />}
						label="Deployments"
						value={snapshot.deployments}
						trend={trends.deployments}
					/>
				</div>

				{/* Drill-down panel for pods */}
				{expandedCard === 'pods' && (
					<DrillDownPanel
						card={expandedCard}
						perNodeMetrics={[]}
						namespacePods={namespacePods}
						loading={drillDownLoading}
						onClose={() => setExpandedCard(null)}
					/>
				)}

				{/* Running Pods chart */}
				{k8sTimeSeries.length > 0 && (
					<DashboardChart
						title={`Running Pods (${timeRange})`}
						height={250}>
						<AreaChart data={k8sTimeSeries}>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke={gridStroke}
							/>
							<XAxis
								dataKey="timestamp"
								tickFormatter={tickFormatter}
								stroke={axisStroke}
								fontSize={12}
							/>
							<YAxis stroke={axisStroke} fontSize={12} />
							<Tooltip
								contentStyle={tooltipStyle}
								labelFormatter={tooltipLabelFormatter}
							/>
							<Area
								type="monotone"
								dataKey="pods"
								stroke="#10b981"
								fill="rgba(16,185,129,0.15)"
								name="Pods"
								strokeWidth={2}
							/>
						</AreaChart>
					</DashboardChart>
				)}
			</section>

			<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
	centered: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: '1rem',
		minHeight: '40vh',
		textAlign: 'center',
	},
	mutedText: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		margin: 0,
	},
	authTitle: {
		color: 'var(--sl-color-text, #e6edf3)',
		margin: 0,
		fontSize: '1.5rem',
	},
	oauthButtons: {
		display: 'flex',
		gap: '0.75rem',
		flexWrap: 'wrap',
		justifyContent: 'center',
		marginTop: '0.5rem',
	},
	oauthButton: {
		padding: '0.5rem 1.25rem',
		borderRadius: '8px',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'var(--sl-color-bg-nav, #111)',
		color: 'var(--sl-color-text, #e6edf3)',
		cursor: 'pointer',
		fontSize: '0.875rem',
		fontWeight: 500,
		transition: 'border-color 0.2s',
	},
	dashboard: {
		display: 'flex',
		flexDirection: 'column',
		gap: '1.5rem',
	},
	header: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		flexWrap: 'wrap',
		gap: '0.75rem',
	},
	headerControls: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.75rem',
	},
	title: {
		color: 'var(--sl-color-text, #e6edf3)',
		margin: 0,
		fontSize: '1.75rem',
		fontWeight: 700,
		display: 'inline',
	},
	cacheBadge: {
		marginLeft: '0.75rem',
		padding: '2px 8px',
		borderRadius: '4px',
		background: 'var(--sl-color-gray-6, #1c1c1c)',
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.7rem',
		fontWeight: 500,
		textTransform: 'uppercase' as const,
		letterSpacing: '0.05em',
	},
	refreshButton: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: '36px',
		height: '36px',
		borderRadius: '8px',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'var(--sl-color-bg-nav, #111)',
		color: 'var(--sl-color-text, #e6edf3)',
		cursor: 'pointer',
		transition: 'border-color 0.2s',
	},
	errorBanner: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '0.75rem 1rem',
		borderRadius: '8px',
		background: 'rgba(239,68,68,0.1)',
		border: '1px solid rgba(239,68,68,0.3)',
		color: '#fca5a5',
		fontSize: '0.875rem',
	},
	sectionTitle: {
		color: 'var(--sl-color-text, #e6edf3)',
		margin: '0 0 1rem 0',
		fontSize: '1.3rem',
		fontWeight: 600,
		paddingBottom: '0.5rem',
		borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
	},
	statsGrid: {
		display: 'grid',
		gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
		gap: '0.75rem',
	},
	statCard: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'flex-start',
		gap: '0.5rem',
		padding: '1rem 1.25rem',
		borderRadius: '10px',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'var(--sl-color-bg-nav, #111)',
		transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.15s',
		minHeight: 120,
	},
	statHeader: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		width: '100%',
	},
	statValue: {
		fontSize: '1.75rem',
		fontWeight: 700,
		color: 'var(--sl-color-text, #e6edf3)',
		fontVariantNumeric: 'tabular-nums',
		whiteSpace: 'nowrap' as const,
	},
	statLabel: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.75rem',
		fontWeight: 500,
		textTransform: 'uppercase' as const,
		letterSpacing: '0.06em',
	},
	trendRow: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.25rem',
	},
	chartSection: {
		padding: '1.5rem',
		borderRadius: '12px',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'var(--sl-color-bg-nav, #111)',
	},
	chartTitle: {
		color: 'var(--sl-color-text, #e6edf3)',
		margin: '0 0 1rem 0',
		fontSize: '1.1rem',
		fontWeight: 600,
	},
	// Time range picker
	timeRangePicker: {
		display: 'flex',
		gap: '2px',
		background: 'var(--sl-color-bg-nav, #111)',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		borderRadius: '8px',
		padding: '3px',
	},
	timeRangeButton: {
		padding: '4px 10px',
		borderRadius: '6px',
		border: 'none',
		background: 'transparent',
		color: 'var(--sl-color-gray-3, #8b949e)',
		cursor: 'pointer',
		fontSize: '0.8rem',
		fontWeight: 500,
		transition: 'all 0.15s',
	},
	timeRangeActive: {
		padding: '4px 10px',
		borderRadius: '6px',
		border: 'none',
		background: 'var(--sl-color-accent, #06b6d4)',
		color: '#fff',
		cursor: 'pointer',
		fontSize: '0.8rem',
		fontWeight: 600,
	},
	// Drill-down
	drillDownPanel: {
		padding: '1.25rem',
		borderRadius: '12px',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'var(--sl-color-bg-nav, #111)',
		marginTop: '1rem',
	},
	drillDownHeader: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: '1rem',
	},
	drillDownTitle: {
		color: 'var(--sl-color-text, #e6edf3)',
		margin: 0,
		fontSize: '1rem',
		fontWeight: 600,
	},
	closeButton: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: '28px',
		height: '28px',
		borderRadius: '6px',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'transparent',
		color: 'var(--sl-color-gray-3, #8b949e)',
		cursor: 'pointer',
	},
	drillDownContent: {
		display: 'flex',
		flexDirection: 'column',
		gap: '0.5rem',
	},
	nodeRow: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.75rem',
	},
	nodeLabel: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.8rem',
		minWidth: '120px',
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
	},
	barContainer: {
		flex: 1,
		height: '8px',
		borderRadius: '4px',
		background: 'var(--sl-color-gray-6, #1c1c1c)',
		overflow: 'hidden',
	},
	barFill: {
		height: '100%',
		borderRadius: '4px',
		transition: 'width 0.3s ease',
	},
	nodeValue: {
		fontSize: '0.8rem',
		fontWeight: 600,
		fontVariantNumeric: 'tabular-nums',
		minWidth: '48px',
		textAlign: 'right' as const,
		color: 'var(--sl-color-text, #e6edf3)',
	},
};

import React, { useEffect, useState, useCallback } from 'react';
import { initSupa, getSupa } from '@/lib/supa';
import {
	BarChart3,
	GitBranch,
	Zap,
	Database,
	Loader2,
	LogIn,
	ArrowRight,
	Activity,
	RefreshCw,
	CheckCircle2,
	XCircle,
	AlertCircle,
	Clock,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://supabase.kbve.com';
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const PROXY_BASE = '/dashboard/grafana/proxy';
const DS_CACHE_KEY = 'cache:grafana:ds-id';

interface CachedData<T> {
	data: T;
	cached_at: number;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function getCache<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const cached: CachedData<T> = JSON.parse(raw);
		if (Date.now() - cached.cached_at > CACHE_TTL_MS) return null;
		return cached.data;
	} catch {
		return null;
	}
}

function setCache<T>(key: string, data: T): void {
	try {
		localStorage.setItem(
			key,
			JSON.stringify({ data, cached_at: Date.now() }),
		);
	} catch {
		/* quota exceeded */
	}
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

type ServiceStatus = 'ok' | 'error' | 'loading' | 'unavailable';

interface GrafanaSummary {
	nodeCount: number;
	cpuPercent: number | null;
	memoryPercent: number | null;
	podCount: number | null;
}

interface ArgoSummary {
	totalApps: number;
	healthyCount: number;
	syncedCount: number;
	degradedCount: number;
}

interface EdgeSummary {
	operational: number;
	total: number;
	latencyMs: number;
}

interface ClickHouseSummary {
	totalLogs: number;
	errors: number;
	warns: number;
	namespaces: number;
}

// ---------------------------------------------------------------------------
// Grafana datasource discovery (same pattern as ReactGrafanaDashboard)
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
			signal: AbortSignal.timeout(8000),
		});
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
	} catch {
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
				signal: AbortSignal.timeout(8000),
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

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchGrafanaSummary(
	token: string,
): Promise<GrafanaSummary | null> {
	const cached = getCache<GrafanaSummary>('cache:dashboard:grafana-summary');
	if (cached) return cached;

	try {
		const dsId = await findPrometheusDatasourceId(token);
		if (!dsId) return null;

		const [nodeCount, cpuPercent, memoryPercent, podCount] =
			await Promise.all([
				queryInstant(token, dsId, 'count(up{job="node-exporter"})'),
				queryInstant(
					token,
					dsId,
					'avg(100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))',
				),
				queryInstant(
					token,
					dsId,
					'(1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))) * 100',
				),
				queryInstant(
					token,
					dsId,
					'sum(kube_pod_status_phase{phase="Running"})',
				),
			]);

		if (nodeCount == null) return null;

		const summary: GrafanaSummary = {
			nodeCount: Math.round(nodeCount),
			cpuPercent:
				cpuPercent != null ? Math.round(cpuPercent * 10) / 10 : null,
			memoryPercent:
				memoryPercent != null
					? Math.round(memoryPercent * 10) / 10
					: null,
			podCount: podCount != null ? Math.round(podCount) : null,
		};
		setCache('cache:dashboard:grafana-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

async function fetchArgoSummary(token: string): Promise<ArgoSummary | null> {
	const cached = getCache<ArgoSummary>('cache:dashboard:argo-summary');
	if (cached) return cached;

	try {
		const resp = await fetch('/dashboard/argo/proxy/api/v1/applications', {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(8000),
		});
		if (!resp.ok) return null;
		const json = await resp.json();
		const items = json?.items ?? [];
		const totalApps = items.length;
		const healthyCount = items.filter(
			(a: any) => a.status?.health?.status === 'Healthy',
		).length;
		const syncedCount = items.filter(
			(a: any) => a.status?.sync?.status === 'Synced',
		).length;
		const degradedCount = items.filter(
			(a: any) =>
				a.status?.health?.status === 'Degraded' ||
				a.status?.health?.status === 'Missing',
		).length;
		const summary = { totalApps, healthyCount, syncedCount, degradedCount };
		setCache('cache:dashboard:argo-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

async function fetchEdgeSummary(): Promise<EdgeSummary | null> {
	const cached = getCache<EdgeSummary>('cache:dashboard:edge-summary');
	if (cached) return cached;

	const functions = [
		'health',
		'meme',
		'mc',
		'discordsh',
		'user-vault',
		'guild-vault',
		'vault-reader',
	];
	const total = functions.length;
	let operational = 0;
	const start = performance.now();

	try {
		const results = await Promise.allSettled(
			functions.map(async (fn) => {
				const method = fn === 'health' ? 'GET' : 'OPTIONS';
				const resp = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
					method,
					signal: AbortSignal.timeout(8000),
				});
				return resp.ok;
			}),
		);
		operational = results.filter(
			(r) => r.status === 'fulfilled' && r.value,
		).length;
		const latencyMs = Math.round(performance.now() - start);
		const summary = { operational, total, latencyMs };
		setCache('cache:dashboard:edge-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

const CH_PROXY_BASE = '/dashboard/clickhouse/proxy';

async function fetchClickHouseSummary(
	token: string,
): Promise<ClickHouseSummary | null> {
	const cached = getCache<ClickHouseSummary>('cache:dashboard:ch-summary');
	if (cached) return cached;

	try {
		const resp = await fetch(CH_PROXY_BASE, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ command: 'stats', minutes: 60 }),
			signal: AbortSignal.timeout(10000),
		});
		if (!resp.ok) return null;
		const data = await resp.json();
		const rows: Array<{
			pod_namespace: string;
			level: string;
			cnt: string;
		}> = data.rows ?? [];

		let totalLogs = 0;
		let errors = 0;
		let warns = 0;
		const ns = new Set<string>();
		for (const r of rows) {
			const cnt = parseInt(r.cnt, 10);
			totalLogs += cnt;
			if (r.level === 'error') errors += cnt;
			if (r.level === 'warn') warns += cnt;
			ns.add(r.pod_namespace);
		}

		const summary = { totalLogs, errors, warns, namespaces: ns.size };
		setCache('cache:dashboard:ch-summary', summary);
		return summary;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusColor(status: ServiceStatus): string {
	switch (status) {
		case 'ok':
			return '#22c55e';
		case 'error':
			return '#ef4444';
		case 'loading':
			return '#94a3b8';
		case 'unavailable':
			return '#f59e0b';
	}
}

function statusLabel(status: ServiceStatus): string {
	switch (status) {
		case 'ok':
			return 'Operational';
		case 'error':
			return 'Down';
		case 'loading':
			return 'Checking...';
		case 'unavailable':
			return 'Unavailable';
	}
}

function getThresholdColor(value: number): string {
	if (value >= 85) return '#ef4444';
	if (value >= 70) return '#eab308';
	return '#22c55e';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: ServiceStatus }) {
	const color = statusColor(status);
	return (
		<span
			style={{
				display: 'inline-block',
				width: 8,
				height: 8,
				borderRadius: '50%',
				background: color,
				boxShadow: status === 'ok' ? `0 0 6px ${color}` : 'none',
				flexShrink: 0,
			}}
		/>
	);
}

function MetricValue({
	label,
	value,
	unit,
	color,
}: {
	label: string;
	value: string | number;
	unit?: string;
	color?: string;
}) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
			<div
				style={{
					fontSize: '1.5rem',
					fontWeight: 700,
					fontVariantNumeric: 'tabular-nums',
					color: color ?? 'var(--sl-color-text, #e6edf3)',
					lineHeight: 1.2,
				}}>
				{value}
				{unit && (
					<span
						style={{
							fontSize: '0.75rem',
							fontWeight: 500,
							color: 'var(--sl-color-gray-3, #8b949e)',
							marginLeft: 2,
						}}>
						{unit}
					</span>
				)}
			</div>
			<div
				style={{
					fontSize: '0.7rem',
					textTransform: 'uppercase' as const,
					letterSpacing: '0.05em',
					fontWeight: 500,
					color: 'var(--sl-color-gray-3, #8b949e)',
				}}>
				{label}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Service Card
// ---------------------------------------------------------------------------

interface ServiceCardProps {
	title: string;
	description: string;
	href: string;
	icon: React.ReactNode;
	accentColor: string;
	status: ServiceStatus;
	children: React.ReactNode;
}

function ServiceCard({
	title,
	description,
	href,
	icon,
	accentColor,
	status,
	children,
}: ServiceCardProps) {
	const [hovered, setHovered] = useState(false);

	return (
		<div
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				display: 'flex',
				flexDirection: 'column',
				borderRadius: 12,
				border: `1px solid ${hovered ? 'var(--sl-color-gray-4, #4b5563)' : 'var(--sl-color-gray-5, #262626)'}`,
				background: 'var(--sl-color-bg-nav, #111)',
				overflow: 'hidden',
				transition: 'border-color 0.2s, box-shadow 0.2s',
				boxShadow: hovered
					? '0 8px 24px rgba(0, 0, 0, 0.3)'
					: '0 2px 8px rgba(0, 0, 0, 0.15)',
			}}>
			{/* Accent strip */}
			<div
				style={{
					height: 3,
					background: accentColor,
					opacity: status === 'ok' ? 1 : 0.4,
				}}
			/>

			{/* Header */}
			<div
				style={{
					padding: '1.25rem 1.25rem 0',
					display: 'flex',
					alignItems: 'flex-start',
					gap: '0.75rem',
				}}>
				<div
					style={{
						width: 36,
						height: 36,
						borderRadius: 8,
						background: `${accentColor}18`,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0,
						color: accentColor,
					}}>
					{icon}
				</div>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 2,
						}}>
						<span
							style={{
								fontWeight: 600,
								fontSize: '1rem',
								color: 'var(--sl-color-text, #e6edf3)',
							}}>
							{title}
						</span>
						<StatusDot status={status} />
					</div>
					<div
						style={{
							fontSize: '0.8rem',
							color: 'var(--sl-color-gray-3, #8b949e)',
						}}>
						{description}
					</div>
				</div>
			</div>

			{/* Metrics */}
			<div
				style={{
					padding: '1rem 1.25rem',
					display: 'flex',
					gap: '1.25rem',
					flexWrap: 'wrap',
					minHeight: 64,
					alignItems: 'flex-end',
				}}>
				{children}
			</div>

			{/* Footer */}
			<div
				style={{
					padding: '0.75rem 1.25rem',
					borderTop: '1px solid var(--sl-color-gray-5, #262626)',
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}>
				<span
					style={{
						fontSize: '0.7rem',
						fontWeight: 500,
						color: statusColor(status),
						textTransform: 'uppercase' as const,
						letterSpacing: '0.05em',
						display: 'flex',
						alignItems: 'center',
						gap: 4,
					}}>
					{status === 'loading' ? (
						<Loader2
							size={10}
							style={{ animation: 'spin 1s linear infinite' }}
						/>
					) : status === 'ok' ? (
						<CheckCircle2 size={10} />
					) : status === 'error' ? (
						<XCircle size={10} />
					) : (
						<AlertCircle size={10} />
					)}
					{statusLabel(status)}
				</span>
				<a
					href={href}
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 4,
						color: 'var(--sl-color-accent, #06b6d4)',
						fontSize: '0.8rem',
						fontWeight: 600,
						textDecoration: 'none',
					}}>
					Details
					<ArrowRight size={12} />
				</a>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// System Status Banner
// ---------------------------------------------------------------------------

function SystemStatusBanner({
	grafanaStatus,
	argoStatus,
	edgeStatus,
	clickhouseStatus,
	lastUpdated,
	onRefresh,
	refreshing,
}: {
	grafanaStatus: ServiceStatus;
	argoStatus: ServiceStatus;
	edgeStatus: ServiceStatus;
	clickhouseStatus: ServiceStatus;
	lastUpdated: Date | null;
	onRefresh: () => void;
	refreshing: boolean;
}) {
	const allOk =
		grafanaStatus === 'ok' &&
		argoStatus === 'ok' &&
		edgeStatus === 'ok' &&
		clickhouseStatus === 'ok';
	const anyError =
		grafanaStatus === 'error' ||
		argoStatus === 'error' ||
		edgeStatus === 'error' ||
		clickhouseStatus === 'error';
	const anyLoading =
		grafanaStatus === 'loading' ||
		argoStatus === 'loading' ||
		edgeStatus === 'loading' ||
		clickhouseStatus === 'loading';

	const overallColor = anyLoading
		? '#94a3b8'
		: allOk
			? '#22c55e'
			: anyError
				? '#ef4444'
				: '#f59e0b';
	const overallLabel = anyLoading
		? 'Checking services...'
		: allOk
			? 'All Systems Operational'
			: anyError
				? 'Service Disruption Detected'
				: 'Partial Degradation';

	const services = [
		{ name: 'Monitoring', status: grafanaStatus },
		{ name: 'Deployments', status: argoStatus },
		{ name: 'Edge', status: edgeStatus },
		{ name: 'Logs', status: clickhouseStatus },
	];

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				padding: '0.75rem 1rem',
				borderRadius: 10,
				border: '1px solid var(--sl-color-gray-5, #262626)',
				background: 'var(--sl-color-bg-nav, #111)',
				gap: '1rem',
				flexWrap: 'wrap',
			}}>
			{/* Left: overall status */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
				}}>
				<span
					style={{
						display: 'inline-block',
						width: 10,
						height: 10,
						borderRadius: '50%',
						background: overallColor,
						boxShadow: allOk ? `0 0 8px ${overallColor}` : 'none',
					}}
				/>
				<span
					style={{
						fontWeight: 600,
						fontSize: '0.85rem',
						color: 'var(--sl-color-text, #e6edf3)',
					}}>
					{overallLabel}
				</span>
			</div>

			{/* Center: per-service dots */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '1rem',
				}}>
				{services.map((s) => (
					<div
						key={s.name}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 4,
							fontSize: '0.75rem',
							color: 'var(--sl-color-gray-3, #8b949e)',
						}}>
						<StatusDot status={s.status} />
						{s.name}
					</div>
				))}
			</div>

			{/* Right: timestamp + refresh */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.75rem',
				}}>
				{lastUpdated && (
					<span
						style={{
							fontSize: '0.7rem',
							color: 'var(--sl-color-gray-4, #6b7280)',
							display: 'flex',
							alignItems: 'center',
							gap: 4,
						}}>
						<Clock size={10} />
						{lastUpdated.toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
						})}
					</span>
				)}
				<button
					onClick={onRefresh}
					disabled={refreshing}
					title="Refresh all"
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 28,
						height: 28,
						borderRadius: 6,
						border: '1px solid var(--sl-color-gray-5, #262626)',
						background: 'transparent',
						color: 'var(--sl-color-gray-3, #8b949e)',
						cursor: refreshing ? 'not-allowed' : 'pointer',
						transition: 'border-color 0.2s',
					}}>
					<RefreshCw
						size={13}
						style={
							refreshing
								? { animation: 'spin 1s linear infinite' }
								: undefined
						}
					/>
				</button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ReactDashboardHome() {
	const [authState, setAuthState] = useState<
		'loading' | 'authenticated' | 'unauthenticated'
	>('loading');
	const [accessToken, setAccessToken] = useState<string | null>(null);
	const [grafana, setGrafana] = useState<GrafanaSummary | null>(null);
	const [argo, setArgo] = useState<ArgoSummary | null>(null);
	const [edge, setEdge] = useState<EdgeSummary | null>(null);
	const [clickhouse, setClickhouse] = useState<ClickHouseSummary | null>(
		null,
	);
	const [loading, setLoading] = useState(true);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	const [grafanaStatus, setGrafanaStatus] =
		useState<ServiceStatus>('loading');
	const [argoStatus, setArgoStatus] = useState<ServiceStatus>('loading');
	const [edgeStatus, setEdgeStatus] = useState<ServiceStatus>('loading');
	const [clickhouseStatus, setClickhouseStatus] =
		useState<ServiceStatus>('loading');

	// Auth init
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
					setAuthState('unauthenticated');
					return;
				}

				setAccessToken(session.access_token as string);
				setAuthState('authenticated');
			} catch {
				if (!cancelled) setAuthState('unauthenticated');
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	const fetchAll = useCallback(async () => {
		setLoading(true);
		setGrafanaStatus('loading');
		setArgoStatus('loading');
		setEdgeStatus('loading');
		setClickhouseStatus('loading');

		const edgePromise = fetchEdgeSummary().then((e) => {
			setEdge(e);
			setEdgeStatus(e ? 'ok' : 'unavailable');
			return e;
		});

		if (accessToken) {
			const grafanaPromise = fetchGrafanaSummary(accessToken).then(
				(g) => {
					setGrafana(g);
					setGrafanaStatus(g ? 'ok' : 'unavailable');
					return g;
				},
			);

			const argoPromise = fetchArgoSummary(accessToken).then((a) => {
				setArgo(a);
				setArgoStatus(a ? 'ok' : 'unavailable');
				return a;
			});

			const clickhousePromise = fetchClickHouseSummary(accessToken).then(
				(ch) => {
					setClickhouse(ch);
					setClickhouseStatus(ch ? 'ok' : 'unavailable');
					return ch;
				},
			);

			await Promise.all([
				grafanaPromise,
				argoPromise,
				edgePromise,
				clickhousePromise,
			]);
		} else {
			await edgePromise;
		}

		setLastUpdated(new Date());
		setLoading(false);
	}, [accessToken]);

	useEffect(() => {
		if (authState === 'authenticated') fetchAll();
	}, [authState, fetchAll]);

	// -----------------------------------------------------------------------
	// Auth states
	// -----------------------------------------------------------------------

	if (authState === 'loading') {
		return (
			<div className="not-content" style={styles.centeredMessage}>
				<Loader2
					size={28}
					style={{
						animation: 'spin 1s linear infinite',
						color: 'var(--sl-color-accent, #06b6d4)',
					}}
				/>
				<p
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						margin: '0.75rem 0 0',
						fontSize: '0.9rem',
					}}>
					Authenticating...
				</p>
				<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
			</div>
		);
	}

	if (authState === 'unauthenticated') {
		return (
			<div className="not-content" style={styles.centeredMessage}>
				<div
					style={{
						width: 56,
						height: 56,
						borderRadius: 14,
						background: 'rgba(6, 182, 212, 0.1)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						marginBottom: '0.5rem',
					}}>
					<LogIn
						size={24}
						style={{ color: 'var(--sl-color-accent, #06b6d4)' }}
					/>
				</div>
				<h2
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						margin: '0.5rem 0 0.25rem',
						fontSize: '1.25rem',
						fontWeight: 600,
					}}>
					Sign In Required
				</h2>
				<p
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						margin: 0,
						fontSize: '0.85rem',
					}}>
					Authentication is required to access the infrastructure
					dashboard.
				</p>
			</div>
		);
	}

	// -----------------------------------------------------------------------
	// Dashboard
	// -----------------------------------------------------------------------

	return (
		<div className="not-content" style={styles.dashboard}>
			{/* Header */}
			<header style={styles.header}>
				<div>
					<h1 style={styles.title}>
						<Activity
							size={22}
							style={{
								color: 'var(--sl-color-accent, #06b6d4)',
								marginRight: 8,
								verticalAlign: 'middle',
							}}
						/>
						Infrastructure Dashboard
					</h1>
					<p style={styles.subtitle}>
						Real-time cluster monitoring, deployment status, and
						service health
					</p>
				</div>
			</header>

			{/* System Status Banner */}
			<SystemStatusBanner
				grafanaStatus={grafanaStatus}
				argoStatus={argoStatus}
				edgeStatus={edgeStatus}
				clickhouseStatus={clickhouseStatus}
				lastUpdated={lastUpdated}
				onRefresh={fetchAll}
				refreshing={loading}
			/>

			{/* Service Cards */}
			<div style={styles.cardGrid}>
				{/* Grafana - Cluster Monitoring */}
				<ServiceCard
					title="Cluster Monitoring"
					description="Prometheus metrics & node health"
					href="/dashboard/grafana/"
					icon={<BarChart3 size={18} />}
					accentColor="#06b6d4"
					status={grafanaStatus}>
					{grafanaStatus === 'loading' ? (
						<LoadingPlaceholder />
					) : grafana ? (
						<>
							<MetricValue
								label="Nodes"
								value={grafana.nodeCount}
								color="#06b6d4"
							/>
							{grafana.cpuPercent != null && (
								<MetricValue
									label="CPU"
									value={grafana.cpuPercent}
									unit="%"
									color={getThresholdColor(
										grafana.cpuPercent,
									)}
								/>
							)}
							{grafana.memoryPercent != null && (
								<MetricValue
									label="Memory"
									value={grafana.memoryPercent}
									unit="%"
									color={getThresholdColor(
										grafana.memoryPercent,
									)}
								/>
							)}
							{grafana.podCount != null && (
								<MetricValue
									label="Pods"
									value={grafana.podCount}
								/>
							)}
						</>
					) : (
						<UnavailableMessage />
					)}
				</ServiceCard>

				{/* ArgoCD - Deployments */}
				<ServiceCard
					title="Deployments"
					description="ArgoCD application sync & health"
					href="/dashboard/argo/"
					icon={<GitBranch size={18} />}
					accentColor="#8b5cf6"
					status={argoStatus}>
					{argoStatus === 'loading' ? (
						<LoadingPlaceholder />
					) : argo ? (
						<>
							<MetricValue
								label="Apps"
								value={argo.totalApps}
								color="#8b5cf6"
							/>
							<MetricValue
								label="Healthy"
								value={argo.healthyCount}
								color="#22c55e"
							/>
							<MetricValue
								label="Synced"
								value={argo.syncedCount}
								color="#06b6d4"
							/>
							{argo.degradedCount > 0 && (
								<MetricValue
									label="Degraded"
									value={argo.degradedCount}
									color="#ef4444"
								/>
							)}
						</>
					) : (
						<UnavailableMessage />
					)}
				</ServiceCard>

				{/* Edge Functions */}
				<ServiceCard
					title="Edge Functions"
					description="Supabase serverless health"
					href="/dashboard/edge/"
					icon={<Zap size={18} />}
					accentColor="#22c55e"
					status={edgeStatus}>
					{edgeStatus === 'loading' ? (
						<LoadingPlaceholder />
					) : edge ? (
						<>
							<MetricValue
								label="Operational"
								value={`${edge.operational}/${edge.total}`}
								color={
									edge.operational === edge.total
										? '#22c55e'
										: '#f59e0b'
								}
							/>
							<MetricValue
								label="Latency"
								value={edge.latencyMs}
								unit="ms"
							/>
						</>
					) : (
						<UnavailableMessage />
					)}
				</ServiceCard>

				{/* ClickHouse Logs */}
				<ServiceCard
					title="Log Aggregation"
					description="ClickHouse cluster log analytics"
					href="/dashboard/clickhouse/"
					icon={<Database size={18} />}
					accentColor="#f59e0b"
					status={clickhouseStatus}>
					{clickhouseStatus === 'loading' ? (
						<LoadingPlaceholder />
					) : clickhouse ? (
						<>
							<MetricValue
								label="Logs/hr"
								value={clickhouse.totalLogs.toLocaleString()}
								color="#f59e0b"
							/>
							<MetricValue
								label="Errors"
								value={clickhouse.errors}
								color={
									clickhouse.errors > 0
										? '#ef4444'
										: '#22c55e'
								}
							/>
							<MetricValue
								label="Warns"
								value={clickhouse.warns}
								color={
									clickhouse.warns > 0 ? '#f59e0b' : '#22c55e'
								}
							/>
							<MetricValue
								label="Namespaces"
								value={clickhouse.namespaces}
							/>
						</>
					) : (
						<UnavailableMessage />
					)}
				</ServiceCard>
			</div>

			<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
		</div>
	);
}

function LoadingPlaceholder() {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: '100%',
				color: 'var(--sl-color-gray-3, #8b949e)',
			}}>
			<Loader2
				size={16}
				style={{ animation: 'spin 1s linear infinite' }}
			/>
		</div>
	);
}

function UnavailableMessage() {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 6,
				color: 'var(--sl-color-gray-4, #6b7280)',
				fontSize: '0.8rem',
			}}>
			<AlertCircle size={14} />
			Service unreachable
		</div>
	);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
	dashboard: {
		display: 'flex',
		flexDirection: 'column',
		gap: '1.25rem',
		minHeight: '60vh',
	},
	header: {
		marginBottom: '0.25rem',
	},
	title: {
		color: 'var(--sl-color-text, #e6edf3)',
		margin: 0,
		fontSize: '1.5rem',
		fontWeight: 700,
		letterSpacing: '-0.01em',
		display: 'flex',
		alignItems: 'center',
	},
	subtitle: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		margin: '0.25rem 0 0',
		fontSize: '0.85rem',
	},
	cardGrid: {
		display: 'grid',
		gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
		gap: '1rem',
	},
	centeredMessage: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 0,
		minHeight: '40vh',
		textAlign: 'center',
	},
};

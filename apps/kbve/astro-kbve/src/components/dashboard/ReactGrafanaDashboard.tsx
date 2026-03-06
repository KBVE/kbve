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
} from 'lucide-react';
import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRAFANA_CACHE_KEY = 'cache:grafana:cluster';
const DS_CACHE_KEY = 'cache:grafana:ds-id';
const CACHE_TTL_MS = 5 * 60 * 1000;
const PROXY_BASE = '/dashboard/grafana/proxy';

const QUERIES = {
	cpu: 'avg(100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))',
	memory: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
	pods: 'sum(kube_pod_status_phase{phase="Running"})',
	nodes: 'count(kube_node_info)',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DashboardState = 'loading' | 'authenticated' | 'unauthenticated';

interface MetricSnapshot {
	cpu: number | null;
	memory: number | null;
	pods: number | null;
	nodes: number | null;
}

interface TimeSeriesPoint {
	timestamp: number;
	cpu: number | null;
	memory: number | null;
}

interface CachedDashboard {
	snapshot: MetricSnapshot;
	timeSeries: TimeSeriesPoint[];
	cached_at: number;
	user_id: string;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function getCachedDashboard(userId: string): CachedDashboard | null {
	try {
		const raw = localStorage.getItem(GRAFANA_CACHE_KEY);
		if (!raw) return null;
		const cached: CachedDashboard = JSON.parse(raw);
		if (cached.user_id !== userId) {
			localStorage.removeItem(GRAFANA_CACHE_KEY);
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
		localStorage.setItem(GRAFANA_CACHE_KEY, JSON.stringify(data));
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
	// Check localStorage cache first
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

function StatCard({
	icon,
	label,
	value,
	unit,
}: {
	icon: React.ReactNode;
	label: string;
	value: number | null;
	unit?: string;
}) {
	return (
		<div style={styles.statCard}>
			<div style={styles.statIcon}>{icon}</div>
			<div style={styles.statValue}>
				{value != null
					? `${Number.isInteger(value) ? value : value.toFixed(1)}${unit || ''}`
					: '--'}
			</div>
			<div style={styles.statLabel}>{label}</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ReactGrafanaDashboard() {
	const [state, setState] = useState<DashboardState>('loading');
	const [snapshot, setSnapshot] = useState<MetricSnapshot>({
		cpu: null,
		memory: null,
		pods: null,
		nodes: null,
	});
	const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
	const [fromCache, setFromCache] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [accessToken, setAccessToken] = useState<string | null>(null);
	const [userId, setUserId] = useState<string | null>(null);

	const { signInWithOAuth, loading: authLoading } = useAuthBridge();

	const fetchMetrics = useCallback(
		async (token: string, uid: string, skipCache = false) => {
			// Cache check
			if (!skipCache) {
				const cached = getCachedDashboard(uid);
				if (cached) {
					setSnapshot(cached.snapshot);
					setTimeSeries(cached.timeSeries);
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

				// Fetch all 4 instant metrics in parallel
				const [cpu, memory, pods, nodes] = await Promise.all([
					queryInstant(token, dsId, QUERIES.cpu),
					queryInstant(token, dsId, QUERIES.memory),
					queryInstant(token, dsId, QUERIES.pods),
					queryInstant(token, dsId, QUERIES.nodes),
				]);

				const snap: MetricSnapshot = { cpu, memory, pods, nodes };
				setSnapshot(snap);

				// Fetch range data for chart (6h, 5-min step)
				const now = Math.floor(Date.now() / 1000);
				const sixHoursAgo = now - 6 * 3600;
				const step = 300;

				const [cpuRange, memRange] = await Promise.all([
					queryRange(
						token,
						dsId,
						QUERIES.cpu,
						sixHoursAgo,
						now,
						step,
					),
					queryRange(
						token,
						dsId,
						QUERIES.memory,
						sixHoursAgo,
						now,
						step,
					),
				]);

				// Merge CPU + Memory into unified time series
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

				// Cache
				setCachedDashboard({
					snapshot: snap,
					timeSeries: ts,
					cached_at: Date.now(),
					user_id: uid,
				});
				setFromCache(false);
			} catch (e: unknown) {
				setError(
					e instanceof Error ? e.message : 'Failed to fetch metrics',
				);
			} finally {
				setRefreshing(false);
			}
		},
		[],
	);

	// Initialize auth + fetch data
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
					fetchMetrics(token, uid);
				}

				// Listen for auth changes
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
	}, [fetchMetrics]);

	const handleRefresh = () => {
		if (accessToken && userId && !refreshing) {
			fetchMetrics(accessToken, userId, true);
		}
	};

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

	// --- Authenticated ---
	return (
		<div className="not-content" style={styles.dashboard}>
			{/* Header */}
			<header style={styles.header}>
				<div>
					<h1 style={styles.title}>Cluster Overview</h1>
					{fromCache && <span style={styles.cacheBadge}>cached</span>}
				</div>
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
			</header>

			{/* Error banner */}
			{error && (
				<div style={styles.errorBanner}>
					<AlertCircle size={16} />
					<span>{error}</span>
				</div>
			)}

			{/* Stat Cards */}
			<div style={styles.statsGrid}>
				<StatCard
					icon={<Cpu size={20} />}
					label="CPU Usage"
					value={snapshot.cpu}
					unit="%"
				/>
				<StatCard
					icon={<HardDrive size={20} />}
					label="Memory"
					value={snapshot.memory}
					unit="%"
				/>
				<StatCard
					icon={<Activity size={20} />}
					label="Running Pods"
					value={snapshot.pods}
				/>
				<StatCard
					icon={<Server size={20} />}
					label="Nodes"
					value={snapshot.nodes}
				/>
			</div>

			{/* Time-series chart */}
			{timeSeries.length > 0 && (
				<section style={styles.chartSection}>
					<h2 style={styles.chartTitle}>Resource Usage (6h)</h2>
					<ResponsiveContainer width="100%" height={300}>
						<AreaChart data={timeSeries}>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke="var(--sl-color-gray-5, #262626)"
							/>
							<XAxis
								dataKey="timestamp"
								tickFormatter={(t: number) =>
									new Date(t * 1000).toLocaleTimeString([], {
										hour: '2-digit',
										minute: '2-digit',
									})
								}
								stroke="var(--sl-color-gray-3, #8b949e)"
								fontSize={12}
							/>
							<YAxis
								unit="%"
								domain={[0, 100]}
								stroke="var(--sl-color-gray-3, #8b949e)"
								fontSize={12}
							/>
							<Tooltip
								contentStyle={{
									background: 'var(--sl-color-bg-nav, #111)',
									border: '1px solid var(--sl-color-gray-5, #262626)',
									borderRadius: '8px',
									color: 'var(--sl-color-text, #e6edf3)',
								}}
								labelFormatter={(t: number) =>
									new Date(t * 1000).toLocaleString()
								}
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
					</ResponsiveContainer>
				</section>
			)}

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
	statsGrid: {
		display: 'grid',
		gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
		gap: '1rem',
	},
	statCard: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '1.25rem',
		borderRadius: '12px',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'var(--sl-color-bg-nav, #111)',
	},
	statIcon: {
		color: 'var(--sl-color-accent, #06b6d4)',
	},
	statValue: {
		fontSize: '1.75rem',
		fontWeight: 700,
		color: 'var(--sl-color-text, #e6edf3)',
		fontVariantNumeric: 'tabular-nums',
	},
	statLabel: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.8rem',
		textTransform: 'uppercase' as const,
		letterSpacing: '0.05em',
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
};

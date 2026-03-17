import React, { useEffect, useState, useCallback } from 'react';
import { initSupa, getSupa } from '@/lib/supa';
import {
	Database,
	RefreshCw,
	Loader2,
	LogIn,
	AlertCircle,
	ShieldOff,
	Search,
	Clock,
	Filter,
	ChevronDown,
	ChevronUp,
	AlertTriangle,
	XCircle,
	Info,
	Bug,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROXY_BASE = '/dashboard/clickhouse/proxy';
const CACHE_TTL_MS = 60 * 1000; // 1 minute

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'forbidden';

interface StatRow {
	pod_namespace: string;
	service: string;
	level: string;
	cnt: string;
}

interface LogRow {
	timestamp: string;
	pod_namespace: string;
	service: string;
	level: string;
	message: string;
	pod_name: string;
	metadata: string;
}

interface StatsData {
	rows: StatRow[];
	count: number;
}

interface QueryData {
	rows: LogRow[];
	count: number;
}

interface NamespaceSummary {
	namespace: string;
	total: number;
	errors: number;
	warns: number;
	infos: number;
	debugs: number;
}

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
// API helpers
// ---------------------------------------------------------------------------

async function fetchStats(
	token: string,
	minutes: number,
): Promise<StatsData | null> {
	const cacheKey = `cache:ch:stats:${minutes}`;
	const cached = getCache<StatsData>(cacheKey);
	if (cached) return cached;

	try {
		const resp = await fetch(PROXY_BASE, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ command: 'stats', minutes }),
			signal: AbortSignal.timeout(15000),
		});
		if (resp.status === 403) throw new Error('forbidden');
		if (!resp.ok) return null;
		const data: StatsData = await resp.json();
		setCache(cacheKey, data);
		return data;
	} catch (e) {
		if (e instanceof Error && e.message === 'forbidden') throw e;
		return null;
	}
}

async function fetchLogs(
	token: string,
	params: {
		minutes?: number;
		level?: string;
		service?: string;
		pod_namespace?: string;
		search?: string;
		limit?: number;
	},
): Promise<QueryData | null> {
	try {
		const resp = await fetch(PROXY_BASE, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ command: 'query', ...params }),
			signal: AbortSignal.timeout(15000),
		});
		if (resp.status === 403) throw new Error('forbidden');
		if (!resp.ok) return null;
		return await resp.json();
	} catch (e) {
		if (e instanceof Error && e.message === 'forbidden') throw e;
		return null;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function levelColor(level: string): string {
	switch (level) {
		case 'error':
			return '#ef4444';
		case 'warn':
			return '#f59e0b';
		case 'info':
			return '#3b82f6';
		case 'debug':
			return '#6b7280';
		default:
			return '#94a3b8';
	}
}

function levelIcon(level: string) {
	switch (level) {
		case 'error':
			return <XCircle size={12} />;
		case 'warn':
			return <AlertTriangle size={12} />;
		case 'info':
			return <Info size={12} />;
		case 'debug':
			return <Bug size={12} />;
		default:
			return null;
	}
}

function buildNamespaceSummaries(stats: StatsData): NamespaceSummary[] {
	const map = new Map<string, NamespaceSummary>();
	for (const row of stats.rows) {
		const ns = row.pod_namespace;
		if (!map.has(ns)) {
			map.set(ns, {
				namespace: ns,
				total: 0,
				errors: 0,
				warns: 0,
				infos: 0,
				debugs: 0,
			});
		}
		const summary = map.get(ns)!;
		const cnt = parseInt(row.cnt, 10);
		summary.total += cnt;
		if (row.level === 'error') summary.errors += cnt;
		else if (row.level === 'warn') summary.warns += cnt;
		else if (row.level === 'info') summary.infos += cnt;
		else if (row.level === 'debug') summary.debugs += cnt;
	}
	return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function formatTimestamp(ts: string): string {
	try {
		const d = new Date(ts.replace(' ', 'T') + 'Z');
		return d.toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	} catch {
		return ts;
	}
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TimeRangeSelector({
	value,
	onChange,
}: {
	value: number;
	onChange: (m: number) => void;
}) {
	const options = [
		{ label: '15m', value: 15 },
		{ label: '1h', value: 60 },
		{ label: '6h', value: 360 },
		{ label: '24h', value: 1440 },
		{ label: '7d', value: 10080 },
	];
	return (
		<div style={{ display: 'flex', gap: 4 }}>
			{options.map((o) => (
				<button
					key={o.value}
					onClick={() => onChange(o.value)}
					style={{
						padding: '4px 10px',
						borderRadius: 6,
						border: `1px solid ${value === o.value ? 'var(--sl-color-accent, #06b6d4)' : 'var(--sl-color-gray-5, #262626)'}`,
						background:
							value === o.value
								? 'rgba(6, 182, 212, 0.15)'
								: 'transparent',
						color:
							value === o.value
								? 'var(--sl-color-accent, #06b6d4)'
								: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.75rem',
						fontWeight: 600,
						cursor: 'pointer',
						transition: 'all 0.15s',
					}}>
					{o.label}
				</button>
			))}
		</div>
	);
}

function LevelBadge({ level }: { level: string }) {
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 4,
				padding: '2px 8px',
				borderRadius: 4,
				fontSize: '0.7rem',
				fontWeight: 600,
				textTransform: 'uppercase',
				letterSpacing: '0.03em',
				color: levelColor(level),
				background: `${levelColor(level)}18`,
				border: `1px solid ${levelColor(level)}30`,
			}}>
			{levelIcon(level)}
			{level}
		</span>
	);
}

function NamespaceCard({
	summary,
	onClick,
}: {
	summary: NamespaceSummary;
	onClick: () => void;
}) {
	const hasIssues = summary.errors > 0 || summary.warns > 0;
	return (
		<button
			onClick={onClick}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 8,
				padding: '1rem',
				borderRadius: 10,
				border: `1px solid ${hasIssues ? 'rgba(239, 68, 68, 0.2)' : 'var(--sl-color-gray-5, #262626)'}`,
				background: 'var(--sl-color-bg-nav, #111)',
				cursor: 'pointer',
				textAlign: 'left',
				transition: 'border-color 0.2s, box-shadow 0.2s',
				width: '100%',
			}}>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}>
				<span
					style={{
						fontWeight: 600,
						fontSize: '0.9rem',
						color: 'var(--sl-color-text, #e6edf3)',
					}}>
					{summary.namespace}
				</span>
				<span
					style={{
						fontSize: '0.75rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontVariantNumeric: 'tabular-nums',
					}}>
					{summary.total.toLocaleString()} logs
				</span>
			</div>
			<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
				{summary.errors > 0 && (
					<span
						style={{
							fontSize: '0.75rem',
							color: '#ef4444',
							fontWeight: 600,
							fontVariantNumeric: 'tabular-nums',
						}}>
						{summary.errors} errors
					</span>
				)}
				{summary.warns > 0 && (
					<span
						style={{
							fontSize: '0.75rem',
							color: '#f59e0b',
							fontWeight: 600,
							fontVariantNumeric: 'tabular-nums',
						}}>
						{summary.warns} warns
					</span>
				)}
				{summary.infos > 0 && (
					<span
						style={{
							fontSize: '0.75rem',
							color: '#3b82f6',
							fontVariantNumeric: 'tabular-nums',
						}}>
						{summary.infos} info
					</span>
				)}
				{summary.debugs > 0 && (
					<span
						style={{
							fontSize: '0.75rem',
							color: '#6b7280',
							fontVariantNumeric: 'tabular-nums',
						}}>
						{summary.debugs} debug
					</span>
				)}
			</div>
		</button>
	);
}

function LogEntry({ log }: { log: LogRow }) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div
			style={{
				borderBottom: '1px solid var(--sl-color-gray-6, #1a1a1a)',
				padding: '0.6rem 0',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					gap: 8,
					cursor: 'pointer',
				}}
				onClick={() => setExpanded(!expanded)}>
				<span
					style={{
						fontSize: '0.7rem',
						color: 'var(--sl-color-gray-4, #6b7280)',
						fontFamily: 'monospace',
						flexShrink: 0,
						paddingTop: 2,
						fontVariantNumeric: 'tabular-nums',
					}}>
					{formatTimestamp(log.timestamp)}
				</span>
				<LevelBadge level={log.level} />
				<span
					style={{
						fontSize: '0.75rem',
						color: 'var(--sl-color-accent, #06b6d4)',
						flexShrink: 0,
						fontWeight: 500,
					}}>
					{log.service}
				</span>
				<span
					style={{
						fontSize: '0.75rem',
						color: 'var(--sl-color-text, #e6edf3)',
						flex: 1,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
						wordBreak: expanded ? 'break-all' : undefined,
						fontFamily: 'monospace',
					}}>
					{log.message}
				</span>
				<span
					style={{ flexShrink: 0, color: 'var(--sl-color-gray-4)' }}>
					{expanded ? (
						<ChevronUp size={14} />
					) : (
						<ChevronDown size={14} />
					)}
				</span>
			</div>
			{expanded && (
				<div
					style={{
						marginTop: 8,
						marginLeft: 70,
						padding: '0.5rem 0.75rem',
						borderRadius: 6,
						background: 'rgba(0, 0, 0, 0.3)',
						fontSize: '0.7rem',
						fontFamily: 'monospace',
						color: 'var(--sl-color-gray-3, #8b949e)',
						display: 'flex',
						flexDirection: 'column',
						gap: 4,
					}}>
					<div>
						<strong>Namespace:</strong> {log.pod_namespace}
					</div>
					<div>
						<strong>Pod:</strong> {log.pod_name}
					</div>
					<div>
						<strong>Timestamp:</strong> {log.timestamp}
					</div>
					{log.metadata && log.metadata !== '{}' && (
						<div style={{ marginTop: 4 }}>
							<strong>Metadata:</strong>
							<pre
								style={{
									margin: '4px 0 0',
									padding: 8,
									borderRadius: 4,
									background: 'rgba(0, 0, 0, 0.3)',
									overflow: 'auto',
									maxHeight: 200,
									fontSize: '0.65rem',
								}}>
								{JSON.stringify(
									JSON.parse(log.metadata),
									null,
									2,
								)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Auth error states
// ---------------------------------------------------------------------------

function AccessRestrictedError() {
	return (
		<div className="not-content" style={styles.centeredMessage}>
			<div style={styles.iconWrapper}>
				<ShieldOff size={24} style={{ color: '#f59e0b' }} />
			</div>
			<h2 style={styles.errorTitle}>Access Restricted</h2>
			<p style={styles.errorText}>
				You do not have permission to access the ClickHouse dashboard.
				Contact an administrator for access.
			</p>
		</div>
	);
}

function UnauthenticatedError() {
	return (
		<div className="not-content" style={styles.centeredMessage}>
			<div style={styles.iconWrapper}>
				<LogIn
					size={24}
					style={{ color: 'var(--sl-color-accent, #06b6d4)' }}
				/>
			</div>
			<h2 style={styles.errorTitle}>Sign In Required</h2>
			<p style={styles.errorText}>
				Authentication is required to access the ClickHouse logs
				dashboard.
			</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ReactClickHouseDashboard() {
	const [authState, setAuthState] = useState<AuthState>('loading');
	const [accessToken, setAccessToken] = useState<string | null>(null);
	const [stats, setStats] = useState<StatsData | null>(null);
	const [logs, setLogs] = useState<QueryData | null>(null);
	const [loading, setLoading] = useState(true);
	const [logsLoading, setLogsLoading] = useState(false);
	const [minutes, setMinutes] = useState(60);

	// Filters
	const [levelFilter, setLevelFilter] = useState<string>('');
	const [namespaceFilter, setNamespaceFilter] = useState<string>('');
	const [serviceFilter, setServiceFilter] = useState<string>('');
	const [searchText, setSearchText] = useState<string>('');

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

	// Fetch stats
	const loadStats = useCallback(async () => {
		if (!accessToken) return;
		setLoading(true);
		try {
			const data = await fetchStats(accessToken, minutes);
			setStats(data);
		} catch (e) {
			if (e instanceof Error && e.message === 'forbidden') {
				setAuthState('forbidden');
			}
		}
		setLoading(false);
	}, [accessToken, minutes]);

	// Fetch logs
	const loadLogs = useCallback(async () => {
		if (!accessToken) return;
		setLogsLoading(true);
		try {
			const params: Record<string, unknown> = {
				minutes,
				limit: 100,
			};
			if (levelFilter) params.level = levelFilter;
			if (namespaceFilter) params.pod_namespace = namespaceFilter;
			if (serviceFilter) params.service = serviceFilter;
			if (searchText) params.search = searchText;
			const data = await fetchLogs(accessToken, params);
			setLogs(data);
		} catch (e) {
			if (e instanceof Error && e.message === 'forbidden') {
				setAuthState('forbidden');
			}
		}
		setLogsLoading(false);
	}, [
		accessToken,
		minutes,
		levelFilter,
		namespaceFilter,
		serviceFilter,
		searchText,
	]);

	useEffect(() => {
		if (authState === 'authenticated') loadStats();
	}, [authState, loadStats]);

	useEffect(() => {
		if (authState === 'authenticated') loadLogs();
	}, [authState, loadLogs]);

	// Quick filter from namespace card click
	const handleNamespaceClick = (ns: string) => {
		setNamespaceFilter(ns);
		setLevelFilter('error');
	};

	// Auth states
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
						color: 'var(--sl-color-gray-3)',
						margin: '0.75rem 0 0',
						fontSize: '0.9rem',
					}}>
					Authenticating...
				</p>
				<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
			</div>
		);
	}

	if (authState === 'unauthenticated') return <UnauthenticatedError />;
	if (authState === 'forbidden') return <AccessRestrictedError />;

	const namespaceSummaries = stats ? buildNamespaceSummaries(stats) : [];
	const totalLogs = namespaceSummaries.reduce((s, n) => s + n.total, 0);
	const totalErrors = namespaceSummaries.reduce((s, n) => s + n.errors, 0);
	const totalWarns = namespaceSummaries.reduce((s, n) => s + n.warns, 0);

	// Unique services from stats for filter dropdown
	const allServices = stats
		? [...new Set(stats.rows.map((r) => r.service))].sort()
		: [];
	const allNamespaces = namespaceSummaries.map((n) => n.namespace);

	return (
		<div className="not-content" style={styles.dashboard}>
			{/* Header */}
			<header style={styles.header}>
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'flex-start',
						flexWrap: 'wrap',
						gap: '1rem',
					}}>
					<div>
						<h1 style={styles.title}>
							<Database
								size={22}
								style={{
									color: '#f59e0b',
									marginRight: 8,
									verticalAlign: 'middle',
								}}
							/>
							ClickHouse Logs
						</h1>
						<p style={styles.subtitle}>
							Real-time cluster log aggregation and analysis
						</p>
					</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 12,
						}}>
						<TimeRangeSelector
							value={minutes}
							onChange={setMinutes}
						/>
						<button
							onClick={() => {
								loadStats();
								loadLogs();
							}}
							disabled={loading}
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 32,
								height: 32,
								borderRadius: 8,
								border: '1px solid var(--sl-color-gray-5, #262626)',
								background: 'transparent',
								color: 'var(--sl-color-gray-3)',
								cursor: loading ? 'not-allowed' : 'pointer',
							}}>
							<RefreshCw
								size={14}
								style={
									loading
										? {
												animation:
													'spin 1s linear infinite',
											}
										: undefined
								}
							/>
						</button>
					</div>
				</div>
			</header>

			{/* Summary bar */}
			<div
				style={{
					display: 'flex',
					gap: '1.5rem',
					padding: '0.75rem 1rem',
					borderRadius: 10,
					border: '1px solid var(--sl-color-gray-5, #262626)',
					background: 'var(--sl-color-bg-nav, #111)',
					flexWrap: 'wrap',
					alignItems: 'center',
				}}>
				{loading ? (
					<Loader2
						size={16}
						style={{ animation: 'spin 1s linear infinite' }}
					/>
				) : (
					<>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
							}}>
							<Database size={14} style={{ color: '#f59e0b' }} />
							<span
								style={{
									fontWeight: 700,
									fontSize: '1.1rem',
									color: 'var(--sl-color-text)',
									fontVariantNumeric: 'tabular-nums',
								}}>
								{totalLogs.toLocaleString()}
							</span>
							<span
								style={{
									fontSize: '0.75rem',
									color: 'var(--sl-color-gray-3)',
								}}>
								total logs
							</span>
						</div>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
							}}>
							<XCircle size={14} style={{ color: '#ef4444' }} />
							<span
								style={{
									fontWeight: 700,
									fontSize: '1.1rem',
									color: '#ef4444',
									fontVariantNumeric: 'tabular-nums',
								}}>
								{totalErrors.toLocaleString()}
							</span>
							<span
								style={{
									fontSize: '0.75rem',
									color: 'var(--sl-color-gray-3)',
								}}>
								errors
							</span>
						</div>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
							}}>
							<AlertTriangle
								size={14}
								style={{ color: '#f59e0b' }}
							/>
							<span
								style={{
									fontWeight: 700,
									fontSize: '1.1rem',
									color: '#f59e0b',
									fontVariantNumeric: 'tabular-nums',
								}}>
								{totalWarns.toLocaleString()}
							</span>
							<span
								style={{
									fontSize: '0.75rem',
									color: 'var(--sl-color-gray-3)',
								}}>
								warnings
							</span>
						</div>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								marginLeft: 'auto',
							}}>
							<Clock
								size={12}
								style={{ color: 'var(--sl-color-gray-4)' }}
							/>
							<span
								style={{
									fontSize: '0.7rem',
									color: 'var(--sl-color-gray-4)',
								}}>
								{namespaceSummaries.length} namespaces
							</span>
						</div>
					</>
				)}
			</div>

			{/* Namespace overview grid */}
			{!loading && namespaceSummaries.length > 0 && (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns:
							'repeat(auto-fill, minmax(260px, 1fr))',
						gap: '0.75rem',
					}}>
					{namespaceSummaries.map((ns) => (
						<NamespaceCard
							key={ns.namespace}
							summary={ns}
							onClick={() => handleNamespaceClick(ns.namespace)}
						/>
					))}
				</div>
			)}

			{/* Log explorer */}
			<div
				style={{
					borderRadius: 12,
					border: '1px solid var(--sl-color-gray-5, #262626)',
					background: 'var(--sl-color-bg-nav, #111)',
					overflow: 'hidden',
				}}>
				{/* Filter bar */}
				<div
					style={{
						padding: '0.75rem 1rem',
						borderBottom:
							'1px solid var(--sl-color-gray-5, #262626)',
						display: 'flex',
						gap: 8,
						flexWrap: 'wrap',
						alignItems: 'center',
					}}>
					<Filter
						size={14}
						style={{ color: 'var(--sl-color-gray-3)' }}
					/>
					<select
						value={levelFilter}
						onChange={(e) => setLevelFilter(e.target.value)}
						style={styles.select}>
						<option value="">All levels</option>
						<option value="error">Error</option>
						<option value="warn">Warn</option>
						<option value="info">Info</option>
						<option value="debug">Debug</option>
					</select>
					<select
						value={namespaceFilter}
						onChange={(e) => setNamespaceFilter(e.target.value)}
						style={styles.select}>
						<option value="">All namespaces</option>
						{allNamespaces.map((ns) => (
							<option key={ns} value={ns}>
								{ns}
							</option>
						))}
					</select>
					<select
						value={serviceFilter}
						onChange={(e) => setServiceFilter(e.target.value)}
						style={styles.select}>
						<option value="">All services</option>
						{allServices.map((svc) => (
							<option key={svc} value={svc}>
								{svc}
							</option>
						))}
					</select>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 4,
							flex: 1,
							minWidth: 150,
						}}>
						<Search
							size={14}
							style={{ color: 'var(--sl-color-gray-4)' }}
						/>
						<input
							type="text"
							placeholder="Search messages..."
							value={searchText}
							onChange={(e) => setSearchText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') loadLogs();
							}}
							style={{
								...styles.select,
								flex: 1,
								minWidth: 0,
							}}
						/>
					</div>
					{(levelFilter ||
						namespaceFilter ||
						serviceFilter ||
						searchText) && (
						<button
							onClick={() => {
								setLevelFilter('');
								setNamespaceFilter('');
								setServiceFilter('');
								setSearchText('');
							}}
							style={{
								padding: '4px 8px',
								borderRadius: 4,
								border: '1px solid var(--sl-color-gray-5)',
								background: 'transparent',
								color: 'var(--sl-color-gray-3)',
								fontSize: '0.7rem',
								cursor: 'pointer',
							}}>
							Clear
						</button>
					)}
				</div>

				{/* Log entries */}
				<div
					style={{
						padding: '0 1rem',
						maxHeight: 600,
						overflowY: 'auto',
					}}>
					{logsLoading ? (
						<div
							style={{
								padding: '2rem',
								textAlign: 'center',
								color: 'var(--sl-color-gray-3)',
							}}>
							<Loader2
								size={20}
								style={{
									animation: 'spin 1s linear infinite',
								}}
							/>
						</div>
					) : logs && logs.rows.length > 0 ? (
						logs.rows.map((log, i) => (
							<LogEntry key={`${log.timestamp}-${i}`} log={log} />
						))
					) : (
						<div
							style={{
								padding: '2rem',
								textAlign: 'center',
								color: 'var(--sl-color-gray-4)',
								fontSize: '0.85rem',
							}}>
							<AlertCircle
								size={18}
								style={{ marginBottom: 8 }}
							/>
							<div>No logs found matching filters</div>
						</div>
					)}
				</div>

				{/* Footer */}
				{logs && (
					<div
						style={{
							padding: '0.5rem 1rem',
							borderTop:
								'1px solid var(--sl-color-gray-6, #1a1a1a)',
							fontSize: '0.7rem',
							color: 'var(--sl-color-gray-4)',
							display: 'flex',
							justifyContent: 'space-between',
						}}>
						<span>
							Showing {logs.rows.length} of {logs.count} results
						</span>
						<span>Source: observability.logs_raw</span>
					</div>
				)}
			</div>

			<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
	centeredMessage: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 0,
		minHeight: '40vh',
		textAlign: 'center',
	},
	iconWrapper: {
		width: 56,
		height: 56,
		borderRadius: 14,
		background: 'rgba(245, 158, 11, 0.1)',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: '0.5rem',
	},
	errorTitle: {
		color: 'var(--sl-color-text, #e6edf3)',
		margin: '0.5rem 0 0.25rem',
		fontSize: '1.25rem',
		fontWeight: 600,
	},
	errorText: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		margin: 0,
		fontSize: '0.85rem',
	},
	select: {
		padding: '4px 8px',
		borderRadius: 6,
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'var(--sl-color-bg, #0a0a0a)',
		color: 'var(--sl-color-text, #e6edf3)',
		fontSize: '0.75rem',
		outline: 'none',
	},
};

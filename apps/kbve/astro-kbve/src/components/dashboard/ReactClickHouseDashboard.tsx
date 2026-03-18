import React, { useEffect, useState, useCallback, useRef } from 'react';
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
	X,
	ArrowUpDown,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROXY_BASE = '/dashboard/clickhouse/proxy';
const CACHE_TTL_MS = 60 * 1000; // 1 minute
const SEARCH_DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'forbidden';
type SortField = 'total' | 'errors' | 'warns' | 'namespace';

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

function sortNamespaces(
	summaries: NamespaceSummary[],
	field: SortField,
): NamespaceSummary[] {
	const sorted = [...summaries];
	switch (field) {
		case 'errors':
			return sorted.sort((a, b) => b.errors - a.errors);
		case 'warns':
			return sorted.sort((a, b) => b.warns - a.warns);
		case 'namespace':
			return sorted.sort((a, b) =>
				a.namespace.localeCompare(b.namespace),
			);
		case 'total':
		default:
			return sorted.sort((a, b) => b.total - a.total);
	}
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

function SeverityButton({
	id,
	count,
	level,
	isActive,
	onClick,
}: {
	id: string;
	count: number;
	level: string;
	isActive: boolean;
	onClick: () => void;
}) {
	if (count === 0) return null;
	const color = levelColor(level);
	return (
		<button
			id={id}
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 4,
				padding: '2px 8px',
				borderRadius: 4,
				fontSize: '0.75rem',
				fontWeight: 600,
				fontVariantNumeric: 'tabular-nums',
				color: color,
				background: isActive ? `${color}25` : 'transparent',
				border: `1px solid ${isActive ? `${color}60` : 'transparent'}`,
				cursor: 'pointer',
				transition: 'all 0.15s',
			}}>
			{levelIcon(level)}
			{count}{' '}
			{level === 'warn'
				? 'warns'
				: level === 'info'
					? 'info'
					: level === 'debug'
						? 'debug'
						: 'errors'}
		</button>
	);
}

function NamespaceCard({
	summary,
	activeLevel,
	activeNamespace,
	onCardClick,
	onSeverityClick,
}: {
	summary: NamespaceSummary;
	activeLevel: string;
	activeNamespace: string;
	onCardClick: (ns: string) => void;
	onSeverityClick: (ns: string, level: string) => void;
}) {
	const hasIssues = summary.errors > 0 || summary.warns > 0;
	const isCardActive = activeNamespace === summary.namespace;
	const errorIntensity = Math.min(summary.errors / 50, 1);
	const borderColor = hasIssues
		? `rgba(239, 68, 68, ${0.15 + errorIntensity * 0.35})`
		: 'var(--sl-color-gray-5, #262626)';

	return (
		<div
			onClick={() => onCardClick(summary.namespace)}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 10,
				padding: '1rem',
				borderRadius: 10,
				border: `1px solid ${isCardActive ? 'var(--sl-color-accent, #06b6d4)' : borderColor}`,
				background: 'var(--sl-color-bg-nav, #111)',
				cursor: 'pointer',
				textAlign: 'left',
				transition: 'border-color 0.2s, box-shadow 0.2s',
				width: '100%',
			}}>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 2,
				}}>
				<span
					style={{
						fontWeight: 600,
						fontSize: '1rem',
						color: 'var(--sl-color-text, #e6edf3)',
					}}>
					{summary.namespace}
				</span>
				<span
					style={{
						fontSize: '0.8rem',
						color: 'rgba(255, 255, 255, 0.5)',
						fontVariantNumeric: 'tabular-nums',
						fontWeight: 500,
					}}>
					{summary.total.toLocaleString()} logs
				</span>
			</div>
			<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
				<SeverityButton
					id={`${summary.namespace}-error`}
					count={summary.errors}
					level="error"
					isActive={isCardActive && activeLevel === 'error'}
					onClick={() => onSeverityClick(summary.namespace, 'error')}
				/>
				<SeverityButton
					id={`${summary.namespace}-warn`}
					count={summary.warns}
					level="warn"
					isActive={isCardActive && activeLevel === 'warn'}
					onClick={() => onSeverityClick(summary.namespace, 'warn')}
				/>
				<SeverityButton
					id={`${summary.namespace}-info`}
					count={summary.infos}
					level="info"
					isActive={isCardActive && activeLevel === 'info'}
					onClick={() => onSeverityClick(summary.namespace, 'info')}
				/>
				<SeverityButton
					id={`${summary.namespace}-debug`}
					count={summary.debugs}
					level="debug"
					isActive={isCardActive && activeLevel === 'debug'}
					onClick={() => onSeverityClick(summary.namespace, 'debug')}
				/>
			</div>
		</div>
	);
}

function FilterChip({
	label,
	onRemove,
}: {
	label: string;
	onRemove: () => void;
}) {
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
				color: 'var(--sl-color-accent, #06b6d4)',
				background: 'rgba(6, 182, 212, 0.12)',
				border: '1px solid rgba(6, 182, 212, 0.25)',
			}}>
			{label}
			<button
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					padding: 0,
					border: 'none',
					background: 'none',
					color: 'var(--sl-color-accent, #06b6d4)',
					cursor: 'pointer',
					opacity: 0.7,
				}}>
				<X size={10} />
			</button>
		</span>
	);
}

function LogEntry({
	log,
	searchHighlight,
}: {
	log: LogRow;
	searchHighlight: string;
}) {
	const [expanded, setExpanded] = useState(false);

	const highlightMessage = (msg: string, term: string) => {
		if (!term) return msg;
		const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const parts = msg.split(new RegExp(`(${escapedTerm})`, 'gi'));
		if (parts.length === 1) return msg;
		return (
			<>
				{parts.map((part, i) =>
					part.toLowerCase() === term.toLowerCase() ? (
						<mark
							key={i}
							style={{
								background: 'rgba(6, 182, 212, 0.3)',
								color: 'inherit',
								borderRadius: 2,
								padding: '0 1px',
							}}>
							{part}
						</mark>
					) : (
						part
					),
				)}
			</>
		);
	};

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
					{highlightMessage(log.message, searchHighlight)}
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
	const [sortField, setSortField] = useState<SortField>('total');

	// Filters
	const [levelFilter, setLevelFilter] = useState<string>('');
	const [namespaceFilter, setNamespaceFilter] = useState<string>('');
	const [serviceFilter, setServiceFilter] = useState<string>('');
	const [searchText, setSearchText] = useState<string>('');
	const [debouncedSearch, setDebouncedSearch] = useState<string>('');

	const searchInputRef = useRef<HTMLInputElement>(null);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	// Debounce search input
	const handleSearchChange = useCallback((value: string) => {
		setSearchText(value);
		if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
		debounceTimerRef.current = setTimeout(() => {
			setDebouncedSearch(value);
		}, SEARCH_DEBOUNCE_MS);
	}, []);

	// Global keyboard shortcut: / to focus search
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (
				e.key === '/' &&
				!e.ctrlKey &&
				!e.metaKey &&
				document.activeElement?.tagName !== 'INPUT' &&
				document.activeElement?.tagName !== 'TEXTAREA' &&
				document.activeElement?.tagName !== 'SELECT'
			) {
				e.preventDefault();
				searchInputRef.current?.focus();
			}
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, []);

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
			if (debouncedSearch) params.search = debouncedSearch;
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
		debouncedSearch,
	]);

	useEffect(() => {
		if (authState === 'authenticated') loadStats();
	}, [authState, loadStats]);

	useEffect(() => {
		if (authState === 'authenticated') loadLogs();
	}, [authState, loadLogs]);

	// Severity button click from namespace card
	const handleSeverityClick = (ns: string, level: string) => {
		if (namespaceFilter === ns && levelFilter === level) {
			setNamespaceFilter('');
			setLevelFilter('');
		} else {
			setNamespaceFilter(ns);
			setLevelFilter(level);
		}
	};

	// Namespace card click (filters to namespace, clears level)
	const handleNamespaceClick = (ns: string) => {
		if (namespaceFilter === ns && !levelFilter) {
			setNamespaceFilter('');
		} else {
			setNamespaceFilter(ns);
			setLevelFilter('');
		}
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
	const sortedNamespaces = sortNamespaces(namespaceSummaries, sortField);
	const totalLogs = namespaceSummaries.reduce((s, n) => s + n.total, 0);
	const totalErrors = namespaceSummaries.reduce((s, n) => s + n.errors, 0);
	const totalWarns = namespaceSummaries.reduce((s, n) => s + n.warns, 0);

	// Unique services from stats for filter dropdown
	const allServices = stats
		? [...new Set(stats.rows.map((r) => r.service))].sort()
		: [];
	const allNamespaces = namespaceSummaries.map((n) => n.namespace);

	const hasActiveFilters =
		levelFilter || namespaceFilter || serviceFilter || searchText;

	// Sort options
	const sortOptions: { label: string; value: SortField }[] = [
		{ label: 'Total', value: 'total' },
		{ label: 'Errors', value: 'errors' },
		{ label: 'Warnings', value: 'warns' },
		{ label: 'Name', value: 'namespace' },
	];

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
									fontSize: '0.8rem',
									color: 'rgba(255, 255, 255, 0.7)',
									fontWeight: 500,
								}}>
								total logs
							</span>
						</div>
						<button
							onClick={() => {
								if (levelFilter === 'error') {
									setLevelFilter('');
								} else {
									setLevelFilter('error');
								}
							}}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								padding: '4px 10px',
								borderRadius: 6,
								border: `1px solid ${levelFilter === 'error' ? 'rgba(239, 68, 68, 0.5)' : 'transparent'}`,
								background:
									levelFilter === 'error'
										? 'rgba(239, 68, 68, 0.12)'
										: 'transparent',
								cursor: 'pointer',
								transition: 'all 0.15s',
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
									fontSize: '0.8rem',
									color: 'rgba(255, 255, 255, 0.7)',
									fontWeight: 500,
								}}>
								errors
							</span>
						</button>
						<button
							onClick={() => {
								if (levelFilter === 'warn') {
									setLevelFilter('');
								} else {
									setLevelFilter('warn');
								}
							}}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								padding: '4px 10px',
								borderRadius: 6,
								border: `1px solid ${levelFilter === 'warn' ? 'rgba(245, 158, 11, 0.5)' : 'transparent'}`,
								background:
									levelFilter === 'warn'
										? 'rgba(245, 158, 11, 0.12)'
										: 'transparent',
								cursor: 'pointer',
								transition: 'all 0.15s',
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
									fontSize: '0.8rem',
									color: 'rgba(255, 255, 255, 0.7)',
									fontWeight: 500,
								}}>
								warnings
							</span>
						</button>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								marginLeft: 'auto',
							}}>
							<Clock
								size={13}
								style={{
									color: 'rgba(255, 255, 255, 0.6)',
								}}
							/>
							<span
								style={{
									fontSize: '0.8rem',
									color: 'rgba(255, 255, 255, 0.7)',
									fontWeight: 500,
								}}>
								{namespaceSummaries.length} namespaces
							</span>
						</div>
					</>
				)}
			</div>

			{/* Namespace sort + overview grid */}
			{!loading && namespaceSummaries.length > 0 && (
				<>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
						}}>
						<ArrowUpDown
							size={13}
							style={{
								color: 'rgba(255, 255, 255, 0.5)',
							}}
						/>
						<span
							style={{
								fontSize: '0.75rem',
								color: 'rgba(255, 255, 255, 0.5)',
								fontWeight: 500,
							}}>
							Sort:
						</span>
						{sortOptions.map((opt) => (
							<button
								key={opt.value}
								onClick={() => setSortField(opt.value)}
								style={{
									padding: '2px 8px',
									borderRadius: 4,
									border: `1px solid ${sortField === opt.value ? 'var(--sl-color-accent, #06b6d4)' : 'var(--sl-color-gray-5, #262626)'}`,
									background:
										sortField === opt.value
											? 'rgba(6, 182, 212, 0.12)'
											: 'transparent',
									color:
										sortField === opt.value
											? 'var(--sl-color-accent, #06b6d4)'
											: 'rgba(255, 255, 255, 0.5)',
									fontSize: '0.7rem',
									fontWeight: 500,
									cursor: 'pointer',
									transition: 'all 0.15s',
								}}>
								{opt.label}
							</button>
						))}
					</div>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns:
								'repeat(auto-fill, minmax(260px, 1fr))',
							gap: '0.75rem',
						}}>
						{sortedNamespaces.map((ns) => (
							<NamespaceCard
								key={ns.namespace}
								summary={ns}
								activeLevel={levelFilter}
								activeNamespace={namespaceFilter}
								onCardClick={handleNamespaceClick}
								onSeverityClick={handleSeverityClick}
							/>
						))}
					</div>
				</>
			)}

			{/* Log explorer */}
			<div
				style={{
					borderRadius: 12,
					border: '1px solid var(--sl-color-gray-5, #262626)',
					background: 'var(--sl-color-bg-nav, #111)',
					overflow: 'hidden',
				}}>
				{/* Filter bar - sticky */}
				<div
					style={{
						padding: '0.75rem 1rem',
						borderBottom:
							'1px solid var(--sl-color-gray-5, #262626)',
						display: 'flex',
						flexDirection: 'column',
						gap: 8,
						position: 'sticky',
						top: 0,
						zIndex: 10,
						background: 'var(--sl-color-bg-nav, #111)',
					}}>
					<div
						style={{
							display: 'flex',
							gap: 8,
							flexWrap: 'wrap',
							alignItems: 'center',
						}}>
						<Filter
							size={14}
							style={{ color: 'rgba(255, 255, 255, 0.6)' }}
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
								style={{
									color: 'rgba(255, 255, 255, 0.5)',
								}}
							/>
							<input
								ref={searchInputRef}
								type="text"
								placeholder="Search logs... (press / to focus)"
								value={searchText}
								autoCorrect="off"
								autoCapitalize="off"
								spellCheck={false}
								onChange={(e) =>
									handleSearchChange(e.target.value)
								}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										if (debounceTimerRef.current)
											clearTimeout(
												debounceTimerRef.current,
											);
										setDebouncedSearch(searchText);
									}
									if (e.key === 'Escape') {
										handleSearchChange('');
										setDebouncedSearch('');
										searchInputRef.current?.blur();
									}
								}}
								style={{
									...styles.select,
									flex: 1,
									minWidth: 0,
								}}
							/>
						</div>
						{hasActiveFilters && (
							<button
								onClick={() => {
									setLevelFilter('');
									setNamespaceFilter('');
									setServiceFilter('');
									setSearchText('');
									setDebouncedSearch('');
								}}
								style={{
									padding: '4px 8px',
									borderRadius: 4,
									border: '1px solid var(--sl-color-gray-5)',
									background: 'transparent',
									color: 'rgba(255, 255, 255, 0.7)',
									fontSize: '0.7rem',
									cursor: 'pointer',
								}}>
								Clear
							</button>
						)}
					</div>
					{/* Active filter chips */}
					{hasActiveFilters && (
						<div
							style={{
								display: 'flex',
								gap: 6,
								flexWrap: 'wrap',
							}}>
							{levelFilter && (
								<FilterChip
									label={`level:${levelFilter}`}
									onRemove={() => setLevelFilter('')}
								/>
							)}
							{namespaceFilter && (
								<FilterChip
									label={`namespace:${namespaceFilter}`}
									onRemove={() => setNamespaceFilter('')}
								/>
							)}
							{serviceFilter && (
								<FilterChip
									label={`service:${serviceFilter}`}
									onRemove={() => setServiceFilter('')}
								/>
							)}
							{searchText && (
								<FilterChip
									label={`text:"${searchText}"`}
									onRemove={() => {
										setSearchText('');
										setDebouncedSearch('');
									}}
								/>
							)}
						</div>
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
							<LogEntry
								key={`${log.timestamp}-${i}`}
								log={log}
								searchHighlight={debouncedSearch}
							/>
						))
					) : (
						<div
							style={{
								padding: '2rem',
								textAlign: 'center',
								color: 'rgba(255, 255, 255, 0.5)',
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
							fontSize: '0.75rem',
							color: 'rgba(255, 255, 255, 0.6)',
							display: 'flex',
							justifyContent: 'space-between',
							fontWeight: 500,
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
		color: 'rgba(255, 255, 255, 0.6)',
		margin: '0.25rem 0 0',
		fontSize: '0.85rem',
		fontWeight: 500,
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
		color: 'rgba(255, 255, 255, 0.6)',
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

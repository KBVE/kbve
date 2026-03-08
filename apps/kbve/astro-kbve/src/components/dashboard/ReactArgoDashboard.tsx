import React, { useEffect, useState, useCallback } from 'react';
import { initSupa, getSupa } from '@/lib/supa';
import { useAuthBridge } from '@/components/auth';
import {
	Activity,
	RefreshCw,
	Loader2,
	LogIn,
	AlertCircle,
	ShieldOff,
	CheckCircle2,
	XCircle,
	Clock,
	GitBranch,
	ChevronDown,
	ChevronRight,
	Box,
	Layers,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'cache:argo:applications';
const CACHE_TTL_MS = 60 * 1000; // 1 minute
const PROXY_BASE = '/dashboard/argo/proxy';
const REFRESH_INTERVAL_MS = 30 * 1000; // 30 seconds

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArgoApplication {
	metadata: {
		name: string;
		namespace: string;
		creationTimestamp: string;
	};
	spec: {
		project: string;
		source?: {
			repoURL: string;
			path: string;
			targetRevision: string;
		};
		destination: {
			server: string;
			namespace: string;
		};
	};
	status: {
		sync: {
			status: string; // Synced, OutOfSync, Unknown
			revision?: string;
		};
		health: {
			status: string; // Healthy, Degraded, Progressing, Missing, Suspended, Unknown
			message?: string;
		};
		operationState?: {
			phase: string;
			message?: string;
			finishedAt?: string;
			startedAt?: string;
		};
		reconciledAt?: string;
	};
}

interface ResourceNode {
	group: string;
	version: string;
	kind: string;
	namespace: string;
	name: string;
	health?: {
		status: string;
		message?: string;
	};
}

interface ResourceTree {
	nodes: ResourceNode[];
}

interface CachedData {
	ts: number;
	applications: ArgoApplication[];
}

// ---------------------------------------------------------------------------
// Custom error for 403 responses
// ---------------------------------------------------------------------------

class AccessRestrictedError extends Error {
	constructor() {
		super('Access restricted');
		this.name = 'AccessRestrictedError';
	}
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchApplications(token: string): Promise<ArgoApplication[]> {
	const resp = await fetch(`${PROXY_BASE}/api/v1/applications`, {
		headers: { Authorization: `Bearer ${token}` },
	});

	if (resp.status === 403) throw new AccessRestrictedError();
	if (!resp.ok) throw new Error(`ArgoCD API error: ${resp.status}`);

	const data = await resp.json();
	return data.items ?? [];
}

async function fetchResourceTree(
	token: string,
	appName: string,
): Promise<ResourceTree> {
	const resp = await fetch(
		`${PROXY_BASE}/api/v1/applications/${encodeURIComponent(appName)}/resource-tree`,
		{
			headers: { Authorization: `Bearer ${token}` },
		},
	);

	if (resp.status === 403) throw new AccessRestrictedError();
	if (!resp.ok) throw new Error(`ArgoCD API error: ${resp.status}`);

	return await resp.json();
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function loadCache(): CachedData | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const parsed: CachedData = JSON.parse(raw);
		if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
		return parsed;
	} catch {
		return null;
	}
}

function saveCache(applications: ArgoApplication[]): void {
	try {
		const data: CachedData = { ts: Date.now(), applications };
		localStorage.setItem(CACHE_KEY, JSON.stringify(data));
	} catch {
		// ignore quota errors
	}
}

// ---------------------------------------------------------------------------
// Status color helpers
// ---------------------------------------------------------------------------

function healthColor(status: string): string {
	switch (status) {
		case 'Healthy':
			return '#10b981';
		case 'Degraded':
			return '#ef4444';
		case 'Progressing':
			return '#f59e0b';
		case 'Suspended':
			return '#6b7280';
		case 'Missing':
			return '#ef4444';
		default:
			return '#6b7280';
	}
}

function syncColor(status: string): string {
	switch (status) {
		case 'Synced':
			return '#10b981';
		case 'OutOfSync':
			return '#f59e0b';
		default:
			return '#6b7280';
	}
}

function healthIcon(status: string) {
	switch (status) {
		case 'Healthy':
			return <CheckCircle2 size={14} />;
		case 'Degraded':
			return <XCircle size={14} />;
		case 'Progressing':
			return <Loader2 size={14} className="animate-spin" />;
		default:
			return <AlertCircle size={14} />;
	}
}

function syncIcon(status: string) {
	switch (status) {
		case 'Synced':
			return <CheckCircle2 size={14} />;
		case 'OutOfSync':
			return <RefreshCw size={14} />;
		default:
			return <AlertCircle size={14} />;
	}
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
	icon,
	label,
	value,
	color,
}: {
	icon: React.ReactNode;
	label: string;
	value: string | number;
	color?: string;
}) {
	return (
		<div
			style={{
				background: 'rgba(15, 23, 42, 0.6)',
				border: '1px solid rgba(148, 163, 184, 0.1)',
				borderRadius: 12,
				padding: '1.25rem',
				display: 'flex',
				flexDirection: 'column',
				gap: '0.5rem',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
					color: '#94a3b8',
					fontSize: '0.8rem',
				}}>
				{icon}
				{label}
			</div>
			<div
				style={{
					fontSize: '1.75rem',
					fontWeight: 700,
					color: color ?? '#e2e8f0',
				}}>
				{value}
			</div>
		</div>
	);
}

function StatusBadge({
	status,
	colorFn,
	iconFn,
}: {
	status: string;
	colorFn: (s: string) => string;
	iconFn: (s: string) => React.ReactNode;
}) {
	const c = colorFn(status);
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 4,
				padding: '2px 8px',
				borderRadius: 6,
				fontSize: '0.75rem',
				fontWeight: 600,
				color: c,
				background: `${c}18`,
				border: `1px solid ${c}30`,
			}}>
			{iconFn(status)}
			{status}
		</span>
	);
}

function ResourceTreePanel({
	token,
	appName,
}: {
	token: string;
	appName: string;
}) {
	const [tree, setTree] = useState<ResourceTree | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				setLoading(true);
				const data = await fetchResourceTree(token, appName);
				if (!cancelled) setTree(data);
			} catch (e: unknown) {
				if (!cancelled)
					setError(e instanceof Error ? e.message : 'Failed to load');
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [token, appName]);

	if (loading) {
		return (
			<div
				style={{
					padding: '1rem',
					color: '#94a3b8',
					display: 'flex',
					alignItems: 'center',
					gap: 8,
				}}>
				<Loader2 size={14} className="animate-spin" />
				Loading resources...
			</div>
		);
	}

	if (error) {
		return (
			<div
				style={{
					padding: '1rem',
					color: '#ef4444',
					fontSize: '0.85rem',
				}}>
				{error}
			</div>
		);
	}

	if (!tree?.nodes?.length) {
		return (
			<div
				style={{
					padding: '1rem',
					color: '#94a3b8',
					fontSize: '0.85rem',
				}}>
				No resources found
			</div>
		);
	}

	// Group by kind
	const grouped = tree.nodes.reduce(
		(acc, node) => {
			const kind = node.kind;
			if (!acc[kind]) acc[kind] = [];
			acc[kind].push(node);
			return acc;
		},
		{} as Record<string, ResourceNode[]>,
	);

	return (
		<div
			style={{
				padding: '0.75rem 1rem',
				borderTop: '1px solid rgba(148, 163, 184, 0.1)',
			}}>
			{Object.entries(grouped).map(([kind, nodes]) => (
				<div key={kind} style={{ marginBottom: '0.75rem' }}>
					<div
						style={{
							fontSize: '0.75rem',
							fontWeight: 600,
							color: '#94a3b8',
							marginBottom: 4,
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
						}}>
						{kind} ({nodes.length})
					</div>
					{nodes.map((node, i) => (
						<div
							key={`${node.namespace}-${node.name}-${i}`}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: '4px 0',
								fontSize: '0.8rem',
								color: '#cbd5e1',
							}}>
							{node.health && (
								<span
									style={{
										color: healthColor(node.health.status),
									}}>
									{healthIcon(node.health.status)}
								</span>
							)}
							<span style={{ color: '#64748b' }}>
								{node.namespace}/
							</span>
							{node.name}
						</div>
					))}
				</div>
			))}
		</div>
	);
}

function ApplicationRow({
	app,
	token,
	expanded,
	onToggle,
}: {
	app: ArgoApplication;
	token: string;
	expanded: boolean;
	onToggle: () => void;
}) {
	const lastSync = app.status.operationState?.finishedAt
		? new Date(app.status.operationState.finishedAt).toLocaleString()
		: app.status.reconciledAt
			? new Date(app.status.reconciledAt).toLocaleString()
			: '--';

	return (
		<div
			style={{
				background: expanded
					? 'rgba(15, 23, 42, 0.8)'
					: 'rgba(15, 23, 42, 0.4)',
				border: '1px solid rgba(148, 163, 184, 0.1)',
				borderRadius: 8,
				marginBottom: 8,
				transition: 'background 0.2s',
			}}>
			<div
				onClick={onToggle}
				style={{
					display: 'grid',
					gridTemplateColumns: '24px 1fr 100px 120px 120px 180px',
					alignItems: 'center',
					padding: '0.75rem 1rem',
					cursor: 'pointer',
					gap: 8,
				}}>
				<span style={{ color: '#64748b' }}>
					{expanded ? (
						<ChevronDown size={16} />
					) : (
						<ChevronRight size={16} />
					)}
				</span>
				<span
					style={{
						fontWeight: 600,
						color: '#e2e8f0',
						fontSize: '0.9rem',
					}}>
					{app.metadata.name}
				</span>
				<span
					style={{
						color: '#64748b',
						fontSize: '0.8rem',
					}}>
					{app.spec.project}
				</span>
				<StatusBadge
					status={app.status.sync.status}
					colorFn={syncColor}
					iconFn={syncIcon}
				/>
				<StatusBadge
					status={app.status.health.status}
					colorFn={healthColor}
					iconFn={healthIcon}
				/>
				<span
					style={{
						color: '#64748b',
						fontSize: '0.75rem',
					}}>
					{lastSync}
				</span>
			</div>
			{expanded && (
				<ResourceTreePanel token={token} appName={app.metadata.name} />
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ReactArgoDashboard() {
	const { session, isLoading: authLoading } = useAuthBridge();

	const [applications, setApplications] = useState<ArgoApplication[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [accessDenied, setAccessDenied] = useState(false);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
	const [expandedApp, setExpandedApp] = useState<string | null>(null);

	const token = session?.access_token;

	const fetchData = useCallback(async (tkn: string) => {
		try {
			setError(null);
			const apps = await fetchApplications(tkn);
			setApplications(apps);
			setLastUpdated(new Date());
			saveCache(apps);
		} catch (e: unknown) {
			if (e instanceof AccessRestrictedError) {
				setAccessDenied(true);
				return;
			}
			setError(e instanceof Error ? e.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	}, []);

	// Initial load + auto-refresh
	useEffect(() => {
		if (!token) return;

		// Try cache first
		const cached = loadCache();
		if (cached) {
			setApplications(cached.applications);
			setLastUpdated(new Date(cached.ts));
			setLoading(false);
		}

		fetchData(token);

		const interval = setInterval(
			() => fetchData(token),
			REFRESH_INTERVAL_MS,
		);
		return () => clearInterval(interval);
	}, [token, fetchData]);

	// -----------------------------------------------------------------------
	// Auth states
	// -----------------------------------------------------------------------

	if (authLoading) {
		return (
			<div style={fullCenter}>
				<Loader2
					size={32}
					className="animate-spin"
					style={{ color: '#22d3ee' }}
				/>
				<p style={{ color: '#94a3b8', marginTop: 12 }}>
					Checking authentication...
				</p>
			</div>
		);
	}

	if (!session || !token) {
		return (
			<div style={fullCenter}>
				<LogIn
					size={48}
					style={{ color: '#64748b', marginBottom: 16 }}
				/>
				<h2 style={{ color: '#e2e8f0', margin: '0 0 8px' }}>
					Sign in required
				</h2>
				<p style={{ color: '#94a3b8', margin: 0 }}>
					Please sign in to access the ArgoCD dashboard.
				</p>
			</div>
		);
	}

	if (accessDenied) {
		return (
			<div style={fullCenter}>
				<ShieldOff
					size={48}
					style={{ color: '#ef4444', marginBottom: 16 }}
				/>
				<h2 style={{ color: '#e2e8f0', margin: '0 0 8px' }}>
					Access restricted
				</h2>
				<p style={{ color: '#94a3b8', margin: 0 }}>
					You do not have permission to view this dashboard.
				</p>
			</div>
		);
	}

	// -----------------------------------------------------------------------
	// Compute summary stats
	// -----------------------------------------------------------------------

	const totalApps = applications.length;
	const healthyCount = applications.filter(
		(a) => a.status.health.status === 'Healthy',
	).length;
	const syncedCount = applications.filter(
		(a) => a.status.sync.status === 'Synced',
	).length;
	const degradedCount = applications.filter(
		(a) =>
			a.status.health.status === 'Degraded' ||
			a.status.health.status === 'Missing',
	).length;
	const outOfSyncCount = applications.filter(
		(a) => a.status.sync.status === 'OutOfSync',
	).length;

	// -----------------------------------------------------------------------
	// Render
	// -----------------------------------------------------------------------

	return (
		<div
			style={{
				fontFamily:
					"'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
				color: '#e2e8f0',
				minHeight: '60vh',
			}}>
			{/* Header */}
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					marginBottom: '1.5rem',
					flexWrap: 'wrap',
					gap: '0.75rem',
				}}>
				<div>
					<h1
						style={{
							margin: 0,
							fontSize: '1.5rem',
							fontWeight: 700,
							display: 'flex',
							alignItems: 'center',
							gap: 8,
						}}>
						<GitBranch size={24} style={{ color: '#22d3ee' }} />
						ArgoCD Dashboard
					</h1>
					{lastUpdated && (
						<p
							style={{
								margin: '4px 0 0',
								fontSize: '0.75rem',
								color: '#64748b',
							}}>
							Updated {lastUpdated.toLocaleTimeString()}
						</p>
					)}
				</div>
				<button
					onClick={() => {
						if (token) {
							setLoading(true);
							fetchData(token);
						}
					}}
					disabled={loading}
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						padding: '6px 14px',
						borderRadius: 8,
						border: '1px solid rgba(148, 163, 184, 0.2)',
						background: 'rgba(15, 23, 42, 0.6)',
						color: '#94a3b8',
						cursor: loading ? 'not-allowed' : 'pointer',
						fontSize: '0.8rem',
					}}>
					<RefreshCw
						size={14}
						className={loading ? 'animate-spin' : ''}
					/>
					Refresh
				</button>
			</div>

			{/* Error banner */}
			{error && (
				<div
					style={{
						background: 'rgba(239, 68, 68, 0.1)',
						border: '1px solid rgba(239, 68, 68, 0.3)',
						borderRadius: 8,
						padding: '0.75rem 1rem',
						marginBottom: '1rem',
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						color: '#fca5a5',
						fontSize: '0.85rem',
					}}>
					<AlertCircle size={16} />
					{error}
				</div>
			)}

			{/* Loading state */}
			{loading && !applications.length && (
				<div style={fullCenter}>
					<Loader2
						size={32}
						className="animate-spin"
						style={{ color: '#22d3ee' }}
					/>
					<p style={{ color: '#94a3b8', marginTop: 12 }}>
						Loading applications...
					</p>
				</div>
			)}

			{/* Summary cards */}
			{applications.length > 0 && (
				<>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns:
								'repeat(auto-fit, minmax(160px, 1fr))',
							gap: '0.75rem',
							marginBottom: '1.5rem',
						}}>
						<StatCard
							icon={<Layers size={16} />}
							label="Applications"
							value={totalApps}
						/>
						<StatCard
							icon={
								<CheckCircle2
									size={16}
									style={{ color: '#10b981' }}
								/>
							}
							label="Healthy"
							value={healthyCount}
							color="#10b981"
						/>
						<StatCard
							icon={
								<Activity
									size={16}
									style={{ color: '#10b981' }}
								/>
							}
							label="Synced"
							value={syncedCount}
							color="#10b981"
						/>
						<StatCard
							icon={
								<XCircle
									size={16}
									style={{ color: '#ef4444' }}
								/>
							}
							label="Degraded"
							value={degradedCount}
							color={degradedCount > 0 ? '#ef4444' : '#10b981'}
						/>
						<StatCard
							icon={
								<RefreshCw
									size={16}
									style={{ color: '#f59e0b' }}
								/>
							}
							label="Out of Sync"
							value={outOfSyncCount}
							color={outOfSyncCount > 0 ? '#f59e0b' : '#10b981'}
						/>
					</div>

					{/* Application table header */}
					<div
						style={{
							display: 'grid',
							gridTemplateColumns:
								'24px 1fr 100px 120px 120px 180px',
							padding: '0 1rem 0.5rem',
							fontSize: '0.7rem',
							fontWeight: 600,
							color: '#64748b',
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
							gap: 8,
						}}>
						<span></span>
						<span>Name</span>
						<span>Project</span>
						<span>Sync</span>
						<span>Health</span>
						<span>Last Sync</span>
					</div>

					{/* Application rows */}
					{applications.map((app) => (
						<ApplicationRow
							key={app.metadata.name}
							app={app}
							token={token}
							expanded={expandedApp === app.metadata.name}
							onToggle={() =>
								setExpandedApp(
									expandedApp === app.metadata.name
										? null
										: app.metadata.name,
								)
							}
						/>
					))}
				</>
			)}

			{/* Empty state */}
			{!loading && applications.length === 0 && !error && (
				<div style={fullCenter}>
					<Box
						size={48}
						style={{ color: '#64748b', marginBottom: 16 }}
					/>
					<h2
						style={{
							color: '#e2e8f0',
							margin: '0 0 8px',
						}}>
						No applications
					</h2>
					<p style={{ color: '#94a3b8', margin: 0 }}>
						No ArgoCD applications found in the cluster.
					</p>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const fullCenter: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	justifyContent: 'center',
	minHeight: '40vh',
	textAlign: 'center',
};

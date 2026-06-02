import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	argoService,
	healthColor,
	syncColor,
	fetchResourceTree,
	fetchAppEvents,
	detectAppStall,
	detectResourceStall,
	formatAge,
	type AppEvent,
	type ArgoApplication,
	type ResourceTree,
	type ResourceNode,
	type ResourceSelector,
} from './argoService';
import ReactArgoResourceDetail, { EventsList } from './ReactArgoResourceDetail';
import {
	CheckCircle2,
	XCircle,
	AlertCircle,
	RefreshCw,
	Loader2,
	ChevronDown,
	ChevronRight,
	Box,
	Clock,
} from 'lucide-react';

const ARGO_TABLE_CSS = `
.kbve-argo-row {
	display: grid;
	grid-template-columns: 24px 1fr 100px 120px 120px 180px;
}
.kbve-argo-header {
	display: grid;
}
@media (max-width: 768px) {
	.kbve-argo-row {
		grid-template-columns: 24px 1fr auto auto;
	}
	.kbve-argo-col-project,
	.kbve-argo-col-last {
		display: none;
	}
}
`;

function StallBadge({
	reason,
	ageMs,
	compact,
}: {
	reason: string;
	ageMs: number;
	compact?: boolean;
}) {
	return (
		<span
			title={`${reason} for ${formatAge(ageMs)}`}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 3,
				padding: compact ? '0 6px' : '2px 8px',
				borderRadius: 4,
				background: 'rgba(245, 158, 11, 0.12)',
				border: '1px solid rgba(245, 158, 11, 0.35)',
				color: '#fbbf24',
				fontSize: compact ? '0.65rem' : '0.7rem',
				fontWeight: 600,
				textTransform: 'uppercase',
				letterSpacing: '0.04em',
			}}>
			<Clock size={compact ? 10 : 11} />
			Stalled {ageMs > 0 ? formatAge(ageMs) : ''}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function healthIcon(status: string) {
	switch (status) {
		case 'Healthy':
			return <CheckCircle2 size={14} />;
		case 'Degraded':
			return <XCircle size={14} />;
		case 'Progressing':
			return (
				<Loader2
					size={14}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
			);
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

export function StatusBadge({
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

// ---------------------------------------------------------------------------
// Resource Tree Panel
// ---------------------------------------------------------------------------

function LoadingBlock({ label }: { label: string }) {
	return (
		<div
			style={{
				padding: '1rem',
				color: 'var(--sl-color-gray-3, #8b949e)',
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				fontSize: '0.85rem',
			}}>
			<Loader2
				size={14}
				style={{ animation: 'spin 1s linear infinite' }}
			/>
			{label}
		</div>
	);
}

function ErrorBlock({ message }: { message: string }) {
	return (
		<div
			style={{
				padding: '1rem',
				color: '#ef4444',
				fontSize: '0.85rem',
				display: 'flex',
				alignItems: 'center',
				gap: 8,
			}}>
			<AlertCircle size={14} />
			{message}
		</div>
	);
}

type ResourceViewMode = 'kind' | 'tree';

function ResourceRow({
	node,
	depth,
	appName,
	selected,
	token,
	onSelectResource,
}: {
	node: ResourceNode;
	depth: number;
	appName: string;
	selected: boolean;
	token: string;
	onSelectResource: (sel: ResourceSelector) => void;
}) {
	const sel: ResourceSelector = {
		appName,
		kind: node.kind,
		namespace: node.namespace ?? '',
		name: node.name,
		group: node.group,
		version: node.version,
		uid: node.uid,
	};
	return (
		<>
			<button
				type="button"
				onClick={() => onSelectResource(sel)}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					padding: '4px 8px',
					paddingLeft: 8 + depth * 16,
					fontSize: '0.8rem',
					color: 'var(--sl-color-text, #e6edf3)',
					cursor: 'pointer',
					borderRadius: 4,
					background: selected
						? 'rgba(139, 92, 246, 0.12)'
						: 'transparent',
					transition: 'background 0.12s',
					border: 'none',
					textAlign: 'left',
					width: '100%',
					font: 'inherit',
					touchAction: 'manipulation',
					WebkitTapHighlightColor: 'transparent',
				}}
				onMouseEnter={(e) => {
					if (!selected) {
						e.currentTarget.style.background =
							'rgba(255, 255, 255, 0.03)';
					}
				}}
				onMouseLeave={(e) => {
					if (!selected) {
						e.currentTarget.style.background = 'transparent';
					}
				}}>
				{node.health && (
					<span
						style={{
							color: healthColor(node.health.status),
						}}>
						{healthIcon(node.health.status)}
					</span>
				)}
				<span
					style={{
						fontSize: '0.7rem',
						padding: '0 6px',
						borderRadius: 3,
						background: 'rgba(139, 92, 246, 0.1)',
						color: '#c4b5fd',
						fontWeight: 600,
					}}>
					{node.kind}
				</span>
				<span
					style={{
						color: 'var(--sl-color-gray-4, #6b7280)',
					}}>
					{node.namespace}/
				</span>
				{node.name}
				{(() => {
					const stall = detectResourceStall(node);
					return stall ? (
						<span style={{ marginLeft: 'auto' }}>
							<StallBadge
								reason={stall.reason}
								ageMs={stall.ageMs}
								compact
							/>
						</span>
					) : null;
				})()}
			</button>
			{selected && (
				<ReactArgoResourceDetail
					token={token}
					sel={sel}
					healthMessage={node.health?.message}
					onClose={() => argoService.selectResource(null)}
				/>
			)}
		</>
	);
}

function ResourceTreePanel({
	token,
	appName,
	selectedResource,
	onSelectResource,
}: {
	token: string;
	appName: string;
	selectedResource: ResourceSelector | null;
	onSelectResource: (sel: ResourceSelector) => void;
}) {
	const [tree, setTree] = useState<ResourceTree | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [viewMode, setViewMode] = useState<ResourceViewMode>('kind');
	const [kindFilter, setKindFilter] = useState<string>('');
	const [healthFilter, setHealthFilter] = useState<string>('');
	const [search, setSearch] = useState<string>('');

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

	const isSelected = (n: ResourceNode) =>
		!!selectedResource &&
		selectedResource.appName === appName &&
		selectedResource.kind === n.kind &&
		selectedResource.namespace === (n.namespace ?? '') &&
		selectedResource.name === n.name;

	const filterMatch = (n: ResourceNode) => {
		if (kindFilter && n.kind !== kindFilter) return false;
		if (healthFilter === '__stalled') {
			if (!detectResourceStall(n)) return false;
		} else if (healthFilter && n.health?.status !== healthFilter) {
			return false;
		}
		if (search) {
			const q = search.toLowerCase();
			if (
				!n.name.toLowerCase().includes(q) &&
				!(n.namespace ?? '').toLowerCase().includes(q)
			)
				return false;
		}
		return true;
	};

	if (loading) return <LoadingBlock label="Loading resources..." />;
	if (error) return <ErrorBlock message={error} />;
	if (!tree?.nodes?.length) {
		return (
			<div
				style={{
					padding: '1rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.85rem',
				}}>
				No resources found
			</div>
		);
	}

	const allKinds = Array.from(new Set(tree.nodes.map((n) => n.kind))).sort();
	const filtered = tree.nodes.filter(filterMatch);

	const filterControls = (
		<div
			style={{
				display: 'flex',
				gap: 8,
				marginBottom: 8,
				alignItems: 'center',
				flexWrap: 'wrap',
			}}>
			<div
				style={{
					display: 'inline-flex',
					borderRadius: 6,
					border: '1px solid var(--sl-color-gray-5, #262626)',
					overflow: 'hidden',
				}}>
				{(['kind', 'tree'] as ResourceViewMode[]).map((m) => (
					<button
						key={m}
						onClick={() => setViewMode(m)}
						style={{
							background:
								viewMode === m
									? 'rgba(139, 92, 246, 0.15)'
									: 'transparent',
							color:
								viewMode === m
									? '#c4b5fd'
									: 'var(--sl-color-gray-3, #8b949e)',
							border: 'none',
							padding: '4px 10px',
							fontSize: '0.75rem',
							fontWeight: 600,
							cursor: 'pointer',
							textTransform: 'capitalize',
						}}>
						{m === 'kind' ? 'By Kind' : 'Tree'}
					</button>
				))}
			</div>
			<select
				value={kindFilter}
				onChange={(e) => setKindFilter(e.target.value)}
				style={smallSelectStyle}>
				<option value="">All kinds</option>
				{allKinds.map((k) => (
					<option key={k} value={k}>
						{k}
					</option>
				))}
			</select>
			<select
				value={healthFilter}
				onChange={(e) => setHealthFilter(e.target.value)}
				style={smallSelectStyle}>
				<option value="">All health</option>
				<option value="Healthy">Healthy</option>
				<option value="Degraded">Degraded</option>
				<option value="Progressing">Progressing</option>
				<option value="Suspended">Suspended</option>
				<option value="Missing">Missing</option>
				<option value="__stalled">Stalled only</option>
			</select>
			<input
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="filter by name/namespace..."
				style={{
					...smallSelectStyle,
					minWidth: 180,
					flex: '1 1 200px',
				}}
			/>
			<span
				style={{
					fontSize: '0.7rem',
					color: 'var(--sl-color-gray-4, #6b7280)',
				}}>
				{filtered.length}/{tree.nodes.length}
			</span>
		</div>
	);

	if (filtered.length === 0) {
		return (
			<div>
				{filterControls}
				<div
					style={{
						padding: '1rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.85rem',
					}}>
					No resources match current filter
				</div>
			</div>
		);
	}

	if (viewMode === 'tree') {
		const byUid = new Map<string, ResourceNode>();
		for (const n of tree.nodes) {
			if (n.uid) byUid.set(n.uid, n);
		}
		const childrenByParentUid = new Map<string, ResourceNode[]>();
		const roots: ResourceNode[] = [];
		for (const n of tree.nodes) {
			const parentUid = n.parentRefs?.[0]?.uid;
			if (parentUid && byUid.has(parentUid)) {
				const arr = childrenByParentUid.get(parentUid) ?? [];
				arr.push(n);
				childrenByParentUid.set(parentUid, arr);
			} else {
				roots.push(n);
			}
		}

		const filteredUids = new Set(
			filtered.map((n) => n.uid).filter(Boolean) as string[],
		);
		const includesFilteredDescendant = (n: ResourceNode): boolean => {
			if (n.uid && filteredUids.has(n.uid)) return true;
			const kids = (n.uid && childrenByParentUid.get(n.uid)) || [];
			return kids.some(includesFilteredDescendant);
		};

		const renderNode = (
			n: ResourceNode,
			depth: number,
		): React.ReactNode => {
			if (!includesFilteredDescendant(n)) return null;
			const kids =
				(n.uid && childrenByParentUid.get(n.uid)) ||
				([] as ResourceNode[]);
			return (
				<React.Fragment
					key={`${n.uid ?? `${n.namespace}-${n.name}-${depth}`}`}>
					<ResourceRow
						node={n}
						depth={depth}
						appName={appName}
						selected={isSelected(n)}
						token={token}
						onSelectResource={onSelectResource}
					/>
					{kids.map((k) => renderNode(k, depth + 1))}
				</React.Fragment>
			);
		};

		return (
			<div>
				{filterControls}
				{roots.map((r) => renderNode(r, 0))}
			</div>
		);
	}

	const grouped = filtered.reduce(
		(acc, node) => {
			const kind = node.kind;
			if (!acc[kind]) acc[kind] = [];
			acc[kind].push(node);
			return acc;
		},
		{} as Record<string, ResourceNode[]>,
	);

	return (
		<div>
			{filterControls}
			{Object.entries(grouped).map(([kind, nodes]) => (
				<div key={kind} style={{ marginBottom: '0.75rem' }}>
					<div
						style={{
							fontSize: '0.75rem',
							fontWeight: 600,
							color: 'var(--sl-color-gray-3, #8b949e)',
							marginBottom: 4,
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
						}}>
						{kind} ({nodes.length})
					</div>
					{nodes.map((node, i) => (
						<ResourceRow
							key={`${node.uid ?? `${node.namespace}-${node.name}-${i}`}`}
							node={node}
							depth={0}
							appName={appName}
							selected={isSelected(node)}
							token={token}
							onSelectResource={onSelectResource}
						/>
					))}
				</div>
			))}
		</div>
	);
}

const smallSelectStyle: React.CSSProperties = {
	background: 'var(--sl-color-bg-nav, #111)',
	color: 'var(--sl-color-text, #e6edf3)',
	border: '1px solid var(--sl-color-gray-5, #262626)',
	borderRadius: 6,
	padding: '4px 8px',
	fontSize: '0.75rem',
};

function AppEventsPanel({
	token,
	appName,
}: {
	token: string;
	appName: string;
}) {
	const [events, setEvents] = useState<AppEvent[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				setLoading(true);
				const data = await fetchAppEvents(token, appName);
				if (!cancelled) setEvents(data);
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

	if (loading) return <LoadingBlock label="Loading events..." />;
	if (error) return <ErrorBlock message={error} />;
	return <EventsList events={events ?? []} />;
}

function AppHistoryPanel({ app }: { app: ArgoApplication }) {
	const history = (app.status as Record<string, unknown>)?.history as
		| Array<Record<string, unknown>>
		| undefined;
	if (!history || history.length === 0) {
		return (
			<div
				style={{
					padding: '1rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.85rem',
				}}>
				No sync history recorded
			</div>
		);
	}
	const sorted = [...history].sort((a, b) => {
		const ai = (a.id as number) ?? 0;
		const bi = (b.id as number) ?? 0;
		return bi - ai;
	});
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
			{sorted.map((h, i) => {
				const deployedAt = h.deployedAt as string | undefined;
				const revision = h.revision as string | undefined;
				const source = h.source as
					| {
							repoURL?: string;
							path?: string;
							targetRevision?: string;
					  }
					| undefined;
				const id = h.id as number | undefined;
				return (
					<div
						key={`${id ?? i}`}
						style={{
							padding: '0.5rem 0.75rem',
							borderRadius: 6,
							background: 'var(--sl-color-bg, #0d1117)',
							border: '1px solid var(--sl-color-gray-5, #262626)',
							fontSize: '0.8rem',
						}}>
						<div
							style={{
								display: 'flex',
								gap: 8,
								alignItems: 'center',
								marginBottom: 4,
							}}>
							<span
								style={{
									color: '#c4b5fd',
									fontWeight: 600,
									fontSize: '0.75rem',
								}}>
								#{id ?? '?'}
							</span>
							<span
								style={{
									color: 'var(--sl-color-text, #e6edf3)',
									fontFamily:
										'var(--sl-font-mono, monospace)',
									fontSize: '0.75rem',
								}}>
								{revision
									? revision.slice(0, 12)
									: '(no revision)'}
							</span>
							<span
								style={{
									marginLeft: 'auto',
									color: 'var(--sl-color-gray-4, #6b7280)',
									fontSize: '0.7rem',
								}}>
								{deployedAt
									? new Date(deployedAt).toLocaleString()
									: ''}
							</span>
						</div>
						{source && (
							<div
								style={{
									color: 'var(--sl-color-gray-4, #6b7280)',
									fontSize: '0.7rem',
								}}>
								{source.repoURL ?? ''}
								{source.path ? ` @ ${source.path}` : ''}
								{source.targetRevision
									? ` (${source.targetRevision})`
									: ''}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

function AppExpandedPanel({
	app,
	token,
	tab,
	onTabChange,
	selectedResource,
	onSelectResource,
}: {
	app: ArgoApplication;
	token: string;
	tab: 'resources' | 'events' | 'history';
	onTabChange: (t: 'resources' | 'events' | 'history') => void;
	selectedResource: ResourceSelector | null;
	onSelectResource: (sel: ResourceSelector) => void;
}) {
	const tabs: { id: 'resources' | 'events' | 'history'; label: string }[] = [
		{ id: 'resources', label: 'Resources' },
		{ id: 'events', label: 'Events' },
		{ id: 'history', label: 'Sync History' },
	];
	return (
		<div
			style={{
				padding: '0.75rem 1rem',
				borderTop: '1px solid var(--sl-color-gray-5, #262626)',
			}}>
			<div
				style={{
					display: 'flex',
					gap: 0,
					borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
					marginBottom: '0.75rem',
				}}>
				{tabs.map((t) => {
					const isActive = t.id === tab;
					return (
						<button
							key={t.id}
							onClick={() => onTabChange(t.id)}
							style={{
								background: 'transparent',
								border: 'none',
								borderBottom: `2px solid ${isActive ? '#8b5cf6' : 'transparent'}`,
								color: isActive
									? 'var(--sl-color-text, #e6edf3)'
									: 'var(--sl-color-gray-3, #8b949e)',
								padding: '0.4rem 0.75rem',
								fontSize: '0.8rem',
								fontWeight: isActive ? 600 : 500,
								cursor: 'pointer',
								marginBottom: '-1px',
							}}>
							{t.label}
						</button>
					);
				})}
			</div>
			{tab === 'resources' && (
				<ResourceTreePanel
					token={token}
					appName={app.metadata.name}
					selectedResource={selectedResource}
					onSelectResource={onSelectResource}
				/>
			)}
			{tab === 'events' && (
				<AppEventsPanel token={token} appName={app.metadata.name} />
			)}
			{tab === 'history' && <AppHistoryPanel app={app} />}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Application Row
// ---------------------------------------------------------------------------

export function ApplicationRow({
	app,
	token,
	expanded,
	onToggle,
	tab,
	onTabChange,
	selectedResource,
	onSelectResource,
}: {
	app: ArgoApplication;
	token: string;
	expanded: boolean;
	onToggle: () => void;
	tab: 'resources' | 'events' | 'history';
	onTabChange: (t: 'resources' | 'events' | 'history') => void;
	selectedResource: ResourceSelector | null;
	onSelectResource: (sel: ResourceSelector) => void;
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
					? 'var(--sl-color-bg-nav, #111)'
					: 'transparent',
				border: '1px solid var(--sl-color-gray-5, #262626)',
				borderRadius: 8,
				marginBottom: 8,
				transition: 'background 0.2s',
			}}>
			<button
				type="button"
				onClick={onToggle}
				className="kbve-argo-row"
				aria-expanded={expanded}
				style={{
					alignItems: 'center',
					padding: '0.75rem 1rem',
					cursor: 'pointer',
					gap: 8,
					background: 'transparent',
					border: 'none',
					color: 'inherit',
					font: 'inherit',
					textAlign: 'left',
					width: '100%',
					touchAction: 'manipulation',
					WebkitTapHighlightColor: 'transparent',
				}}>
				<span style={{ color: 'var(--sl-color-gray-4, #6b7280)' }}>
					{expanded ? (
						<ChevronDown size={16} />
					) : (
						<ChevronRight size={16} />
					)}
				</span>
				<span
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						fontWeight: 600,
						color: 'var(--sl-color-text, #e6edf3)',
						fontSize: '0.9rem',
						minWidth: 0,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}>
					{app.metadata.name}
					{(() => {
						const stall = detectAppStall(app);
						return stall ? (
							<StallBadge
								reason={stall.reason}
								ageMs={stall.ageMs}
								compact
							/>
						) : null;
					})()}
				</span>
				<span
					className="kbve-argo-col-project"
					style={{
						color: 'var(--sl-color-gray-4, #6b7280)',
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
					className="kbve-argo-col-last"
					style={{
						color: 'var(--sl-color-gray-4, #6b7280)',
						fontSize: '0.75rem',
					}}>
					{lastSync}
				</span>
			</button>
			{expanded && (
				<AppExpandedPanel
					app={app}
					token={token}
					tab={tab}
					onTabChange={onTabChange}
					selectedResource={selectedResource}
					onSelectResource={onSelectResource}
				/>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function ReactArgoAppTable() {
	const applications = useStore(argoService.$applications);
	const loading = useStore(argoService.$loading);
	const error = useStore(argoService.$error);
	const accessToken = useStore(argoService.$accessToken);
	const expandedApp = useStore(argoService.$expandedApp);
	const selectedResource = useStore(argoService.$selectedResource);
	const appTab = useStore(argoService.$appTab);

	if (!applications.length) {
		if (!loading && !error) {
			return (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						minHeight: '40vh',
						textAlign: 'center',
					}}>
					<div
						style={{
							width: 56,
							height: 56,
							borderRadius: 14,
							background: 'rgba(139, 92, 246, 0.1)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							marginBottom: '0.5rem',
						}}>
						<Box size={24} style={{ color: '#8b5cf6' }} />
					</div>
					<h2
						style={{
							color: 'var(--sl-color-text, #e6edf3)',
							margin: '0.5rem 0 0.25rem',
							fontSize: '1.25rem',
							fontWeight: 600,
						}}>
						No Applications
					</h2>
					<p
						style={{
							color: 'var(--sl-color-gray-3, #8b949e)',
							margin: 0,
							fontSize: '0.85rem',
						}}>
						No ArgoCD applications found in the cluster.
					</p>
				</div>
			);
		}
		return null;
	}

	return (
		<>
			<style>{ARGO_TABLE_CSS}</style>
			{/* Table header */}
			<div
				className="kbve-argo-row kbve-argo-header"
				style={{
					padding: '0 1rem 0.5rem',
					fontSize: '0.7rem',
					fontWeight: 600,
					color: 'var(--sl-color-gray-4, #6b7280)',
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
					gap: 8,
				}}>
				<span></span>
				<span>Name</span>
				<span className="kbve-argo-col-project">Project</span>
				<span>Sync</span>
				<span>Health</span>
				<span className="kbve-argo-col-last">Last Sync</span>
			</div>

			{/* Application rows */}
			{applications.map((app) => (
				<ApplicationRow
					key={app.metadata.name}
					app={app}
					token={accessToken!}
					expanded={expandedApp === app.metadata.name}
					onToggle={() =>
						argoService.toggleExpandedApp(app.metadata.name)
					}
					tab={appTab}
					onTabChange={(t) => argoService.setAppTab(t)}
					selectedResource={selectedResource}
					onSelectResource={(sel) => argoService.selectResource(sel)}
				/>
			))}
		</>
	);
}

import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	argoService,
	healthColor,
	syncColor,
	fetchResourceTree,
	fetchAppEvents,
	fetchManagedResources,
	detectAppStall,
	detectResourceStall,
	formatAge,
	diffLines,
	prettyManifest,
	type AppEvent,
	type AppTab,
	type ArgoApplication,
	type ManagedResource,
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
	RotateCw,
	Loader2,
	ChevronDown,
	ChevronRight,
	Box,
	Clock,
	FileDiff,
	Undo2,
} from 'lucide-react';

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

const UNKNOWN_ICON = <AlertCircle size={14} />;

const HEALTH_ICONS: Record<string, React.ReactNode> = {
	Healthy: <CheckCircle2 size={14} />,
	Degraded: <XCircle size={14} />,
	Progressing: (
		<Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
	),
};

const SYNC_ICONS: Record<string, React.ReactNode> = {
	Synced: <CheckCircle2 size={14} />,
	OutOfSync: <RefreshCw size={14} />,
};

export function healthIcon(status: string) {
	return HEALTH_ICONS[status] ?? UNKNOWN_ICON;
}

export function syncIcon(status: string) {
	return SYNC_ICONS[status] ?? UNKNOWN_ICON;
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
	const stall = detectResourceStall(node);
	const health = node.health?.status;
	const severity =
		health === 'Degraded' || health === 'Missing'
			? 'crit'
			: stall || health === 'Progressing'
				? 'warn'
				: null;
	const accent =
		severity === 'crit'
			? '#ef4444'
			: severity === 'warn'
				? '#fbbf24'
				: null;
	const idleBg = accent
		? severity === 'crit'
			? 'rgba(239, 68, 68, 0.07)'
			: 'rgba(251, 191, 36, 0.07)'
		: 'transparent';
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
					background: selected ? 'rgba(139, 92, 246, 0.12)' : idleBg,
					borderLeft: accent
						? `3px solid ${accent}`
						: '3px solid transparent',
					transition: 'background 0.12s',
					borderTop: 'none',
					borderRight: 'none',
					borderBottom: 'none',
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
						e.currentTarget.style.background = idleBg;
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
				{stall ? (
					<span style={{ marginLeft: 'auto' }}>
						<StallBadge
							reason={stall.reason}
							ageMs={stall.ageMs}
							compact
						/>
					</span>
				) : null}
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

// Cap on rows rendered at once. A fat app (namespace with hundreds of
// resources) would otherwise build the entire list every expand; this keeps
// the initial render bounded with an opt-in "show all" escape hatch.
const MAX_VISIBLE_RESOURCES = 75;

function ShowMoreBar({
	shown,
	total,
	onShowAll,
}: {
	shown: number;
	total: number;
	onShowAll: () => void;
}) {
	if (shown >= total) return null;
	return (
		<button
			type="button"
			onClick={onShowAll}
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 6,
				width: '100%',
				marginTop: 6,
				padding: '6px 8px',
				borderRadius: 6,
				border: '1px dashed var(--sl-color-gray-5, #262626)',
				background: 'transparent',
				color: 'var(--sl-color-gray-3, #8b949e)',
				fontSize: '0.75rem',
				fontWeight: 600,
				cursor: 'pointer',
			}}>
			Show all {total} resources ({total - shown} hidden)
		</button>
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
	const [showAll, setShowAll] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setShowAll(false);
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

		const ordered: { node: ResourceNode; depth: number }[] = [];
		const collect = (n: ResourceNode, depth: number) => {
			if (!includesFilteredDescendant(n)) return;
			ordered.push({ node: n, depth });
			const kids =
				(n.uid && childrenByParentUid.get(n.uid)) ||
				([] as ResourceNode[]);
			kids.forEach((k) => collect(k, depth + 1));
		};
		roots.forEach((r) => collect(r, 0));
		const visible = showAll
			? ordered
			: ordered.slice(0, MAX_VISIBLE_RESOURCES);

		return (
			<div>
				{filterControls}
				{visible.map(({ node, depth }) => (
					<ResourceRow
						key={`${node.uid ?? `${node.namespace}-${node.name}-${depth}`}`}
						node={node}
						depth={depth}
						appName={appName}
						selected={isSelected(node)}
						token={token}
						onSelectResource={onSelectResource}
					/>
				))}
				<ShowMoreBar
					shown={visible.length}
					total={ordered.length}
					onShowAll={() => setShowAll(true)}
				/>
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

	const kindLimit = showAll ? Infinity : MAX_VISIBLE_RESOURCES;
	let kindBudget = kindLimit;

	return (
		<div>
			{filterControls}
			{Object.entries(grouped).map(([kind, nodes]) => {
				if (kindBudget <= 0) return null;
				const take = nodes.slice(0, kindBudget);
				kindBudget -= take.length;
				return (
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
						{take.map((node, i) => (
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
				);
			})}
			<ShowMoreBar
				shown={
					showAll
						? filtered.length
						: Math.min(filtered.length, MAX_VISIBLE_RESOURCES)
				}
				total={filtered.length}
				onShowAll={() => setShowAll(true)}
			/>
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
	const busy = useStore(argoService.$actionBusy);
	const name = app.metadata.name;
	const rolling = busy === `${name}:rollback`;
	const anyBusy = busy !== null;
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
							{i === 0 ? (
								<span
									style={{
										padding: '1px 6px',
										borderRadius: 4,
										background: 'rgba(34, 197, 94, 0.12)',
										border: '1px solid rgba(34, 197, 94, 0.35)',
										color: '#4ade80',
										fontSize: '0.65rem',
										fontWeight: 600,
										textTransform: 'uppercase',
									}}>
									Current
								</span>
							) : (
								id != null && (
									<button
										type="button"
										disabled={anyBusy}
										title={`Roll back to revision #${id}`}
										onClick={() => {
											if (
												window.confirm(
													`Roll back ${name} to revision #${id}? This deploys the older manifests.`,
												)
											)
												void argoService.rollbackApp(
													name,
													id,
												);
										}}
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 4,
											padding: '0.2rem 0.5rem',
											borderRadius: 5,
											border: '1px solid var(--sl-color-gray-5, #262626)',
											background:
												'var(--sl-color-bg-nav, #111)',
											color: 'var(--sl-color-gray-2, #c9d1d9)',
											fontSize: '0.7rem',
											fontWeight: 500,
											cursor: anyBusy
												? 'wait'
												: 'pointer',
										}}>
										{rolling ? (
											<Loader2
												size={11}
												style={{
													animation:
														'spin 1s linear infinite',
												}}
											/>
										) : (
											<Undo2 size={11} />
										)}
										Rollback
									</button>
								)
							)}
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

function resourceLabel(r: ManagedResource): string {
	const g = r.group ? `${r.group}/` : '';
	const ns = r.namespace ? `${r.namespace}/` : '';
	return `${g}${r.kind} · ${ns}${r.name}`;
}

function isOutOfSync(r: ManagedResource): boolean {
	const live = prettyManifest(r.normalizedLiveState ?? r.liveState);
	const target = prettyManifest(r.predictedLiveState ?? r.targetState);
	return live !== target;
}

function DiffView({ before, after }: { before: string; after: string }) {
	const lines = diffLines(before, after);
	return (
		<pre
			style={{
				margin: 0,
				padding: '0.5rem 0.75rem',
				overflowX: 'auto',
				fontSize: '0.72rem',
				lineHeight: 1.55,
				fontFamily: 'var(--sl-font-mono, monospace)',
				background: 'var(--sl-color-bg, #0d1117)',
				borderRadius: 6,
				border: '1px solid var(--sl-color-gray-5, #262626)',
			}}>
			{lines.map((l, i) => {
				const sign =
					l.op === 'add' ? '+' : l.op === 'remove' ? '-' : ' ';
				const color =
					l.op === 'add'
						? '#22c55e'
						: l.op === 'remove'
							? '#ef4444'
							: 'var(--sl-color-gray-3, #8b949e)';
				const bg =
					l.op === 'add'
						? 'rgba(34, 197, 94, 0.08)'
						: l.op === 'remove'
							? 'rgba(239, 68, 68, 0.08)'
							: 'transparent';
				return (
					<div key={i} style={{ color, background: bg }}>
						{sign} {l.text}
					</div>
				);
			})}
		</pre>
	);
}

function AppDiffPanel({ token, appName }: { token: string; appName: string }) {
	const [resources, setResources] = useState<ManagedResource[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				setLoading(true);
				const data = await fetchManagedResources(token, appName);
				if (!cancelled) setResources(data);
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

	if (loading) return <LoadingBlock label="Computing diff..." />;
	if (error) return <ErrorBlock message={error} />;

	const drifted = (resources ?? []).filter(isOutOfSync);
	if (drifted.length === 0) {
		return (
			<div
				style={{
					padding: '1rem',
					color: '#22c55e',
					fontSize: '0.85rem',
					display: 'flex',
					alignItems: 'center',
					gap: 8,
				}}>
				<CheckCircle2 size={14} />
				All managed resources match the desired state
			</div>
		);
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
			<div
				style={{
					fontSize: '0.75rem',
					color: 'var(--sl-color-gray-4, #6b7280)',
				}}>
				{drifted.length} resource{drifted.length === 1 ? '' : 's'}{' '}
				differ from target —{' '}
				<span style={{ color: '#ef4444' }}>red</span> is live,{' '}
				<span style={{ color: '#22c55e' }}>green</span> is target.
			</div>
			{drifted.map((r, i) => (
				<div key={`${r.kind}-${r.namespace}-${r.name}-${i}`}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 4,
							fontSize: '0.78rem',
							fontWeight: 600,
							color: 'var(--sl-color-text, #e6edf3)',
						}}>
						<FileDiff size={13} style={{ color: '#8b5cf6' }} />
						{resourceLabel(r)}
						{r.requiresPruning && (
							<span
								style={{
									padding: '0 6px',
									borderRadius: 4,
									background: 'rgba(239, 68, 68, 0.12)',
									border: '1px solid rgba(239, 68, 68, 0.35)',
									color: '#fca5a5',
									fontSize: '0.65rem',
									fontWeight: 600,
									textTransform: 'uppercase',
								}}>
								Prune
							</span>
						)}
					</div>
					<DiffView
						before={prettyManifest(
							r.normalizedLiveState ?? r.liveState,
						)}
						after={prettyManifest(
							r.predictedLiveState ?? r.targetState,
						)}
					/>
				</div>
			))}
		</div>
	);
}

export function AppExpandedPanel({
	app,
	token,
	tab,
	onTabChange,
	selectedResource,
	onSelectResource,
}: {
	app: ArgoApplication;
	token: string;
	tab: AppTab;
	onTabChange: (t: AppTab) => void;
	selectedResource: ResourceSelector | null;
	onSelectResource: (sel: ResourceSelector) => void;
}) {
	const outOfSync = app.status.sync.status === 'OutOfSync';
	const tabs: { id: AppTab; label: string }[] = [
		{ id: 'resources', label: 'Resources' },
		{ id: 'diff', label: outOfSync ? 'Diff •' : 'Diff' },
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
			{tab === 'diff' && (
				<AppDiffPanel token={token} appName={app.metadata.name} />
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

function ApplicationRowImpl({
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
	tab: AppTab;
	onTabChange: (t: AppTab) => void;
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
			id={`argo-app-${app.metadata.name}`}
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
			{expanded && <AppActionBar app={app} />}
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

// Memoized so the 30s poll only re-renders rows whose app object actually
// changed (refs are reconciled in argoService). Closure props (onToggle, etc.)
// are behaviorally stable, so they are intentionally excluded from the compare.
// tab/selectedResource only matter for the expanded row.
export const ApplicationRow = React.memo(ApplicationRowImpl, (a, b) => {
	if (a.app !== b.app || a.expanded !== b.expanded || a.token !== b.token)
		return false;
	if (!a.expanded) return true;
	return a.tab === b.tab && a.selectedResource === b.selectedResource;
});

export function AppActionBar({ app }: { app: ArgoApplication }) {
	const busy = useStore(argoService.$actionBusy);
	const actionError = useStore(argoService.$actionError);
	const actionMsg = useStore(argoService.$actionMsg);
	const name = app.metadata.name;
	const syncing = busy === `${name}:sync`;
	const refreshing = busy === `${name}:refresh`;
	const anyBusy = busy !== null;

	const btn: React.CSSProperties = {
		display: 'flex',
		alignItems: 'center',
		gap: 6,
		padding: '0.35rem 0.7rem',
		borderRadius: 6,
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'var(--sl-color-bg, #0d0d0d)',
		color: 'var(--sl-color-text, #e6edf3)',
		fontSize: '0.78rem',
		fontWeight: 500,
		cursor: anyBusy ? 'wait' : 'pointer',
	};

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				padding: '0.5rem 1rem',
				borderTop: '1px solid var(--sl-color-gray-6, #1c1c1c)',
				flexWrap: 'wrap',
			}}>
			<button
				type="button"
				disabled={anyBusy}
				onClick={() => argoService.syncApp(name)}
				style={btn}
				title="Trigger an ArgoCD sync (requires manage permission)">
				{syncing ? (
					<Loader2
						size={13}
						style={{ animation: 'spin 1s linear infinite' }}
					/>
				) : (
					<RefreshCw size={13} />
				)}
				Sync
			</button>
			<button
				type="button"
				disabled={anyBusy}
				onClick={() => argoService.hardRefreshApp(name)}
				style={btn}
				title="Force ArgoCD to re-read the live cluster state">
				{refreshing ? (
					<Loader2
						size={13}
						style={{ animation: 'spin 1s linear infinite' }}
					/>
				) : (
					<RotateCw size={13} />
				)}
				Hard Refresh
			</button>
			{actionMsg && (
				<span style={{ color: '#22c55e', fontSize: '0.75rem' }}>
					{actionMsg}
				</span>
			)}
			{actionError && (
				<span style={{ color: '#fca5a5', fontSize: '0.75rem' }}>
					{actionError}
				</span>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function ReactArgoAppTable() {
	// Defer the list so a 30s poll re-render yields to clicks/typing.
	const applications = React.useDeferredValue(
		useStore(argoService.$applications),
	);
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

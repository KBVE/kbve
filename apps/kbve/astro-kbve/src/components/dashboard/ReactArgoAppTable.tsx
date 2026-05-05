import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	argoService,
	healthColor,
	syncColor,
	fetchResourceTree,
	fetchAppEvents,
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
} from 'lucide-react';

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

	const grouped = tree.nodes.reduce(
		(acc, node) => {
			const kind = node.kind;
			if (!acc[kind]) acc[kind] = [];
			acc[kind].push(node);
			return acc;
		},
		{} as Record<string, ResourceNode[]>,
	);

	const isSelected = (n: ResourceNode) =>
		!!selectedResource &&
		selectedResource.appName === appName &&
		selectedResource.kind === n.kind &&
		selectedResource.namespace === (n.namespace ?? '') &&
		selectedResource.name === n.name;

	return (
		<div>
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
					{nodes.map((node, i) => {
						const selected = isSelected(node);
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
							<React.Fragment
								key={`${node.namespace}-${node.name}-${i}`}>
								<div
									onClick={() => onSelectResource(sel)}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										padding: '4px 8px',
										fontSize: '0.8rem',
										color: 'var(--sl-color-text, #e6edf3)',
										cursor: 'pointer',
										borderRadius: 4,
										background: selected
											? 'rgba(139, 92, 246, 0.12)'
											: 'transparent',
										transition: 'background 0.12s',
									}}
									onMouseEnter={(e) => {
										if (!selected) {
											e.currentTarget.style.background =
												'rgba(255, 255, 255, 0.03)';
										}
									}}
									onMouseLeave={(e) => {
										if (!selected) {
											e.currentTarget.style.background =
												'transparent';
										}
									}}>
									{node.health && (
										<span
											style={{
												color: healthColor(
													node.health.status,
												),
											}}>
											{healthIcon(node.health.status)}
										</span>
									)}
									<span
										style={{
											color: 'var(--sl-color-gray-4, #6b7280)',
										}}>
										{node.namespace}/
									</span>
									{node.name}
								</div>
								{selected && (
									<ReactArgoResourceDetail
										token={token}
										sel={sel}
										healthMessage={node.health?.message}
										onClose={() =>
											argoService.selectResource(null)
										}
									/>
								)}
							</React.Fragment>
						);
					})}
				</div>
			))}
		</div>
	);
}

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

function ApplicationRow({
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
				<span style={{ color: 'var(--sl-color-gray-4, #6b7280)' }}>
					{expanded ? (
						<ChevronDown size={16} />
					) : (
						<ChevronRight size={16} />
					)}
				</span>
				<span
					style={{
						fontWeight: 600,
						color: 'var(--sl-color-text, #e6edf3)',
						fontSize: '0.9rem',
					}}>
					{app.metadata.name}
				</span>
				<span
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
					style={{
						color: 'var(--sl-color-gray-4, #6b7280)',
						fontSize: '0.75rem',
					}}>
					{lastSync}
				</span>
			</div>
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
			{/* Table header */}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: '24px 1fr 100px 120px 120px 180px',
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

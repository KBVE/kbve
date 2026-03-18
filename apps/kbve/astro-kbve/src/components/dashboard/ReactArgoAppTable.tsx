import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	argoService,
	healthColor,
	syncColor,
	fetchResourceTree,
	type ArgoApplication,
	type ResourceTree,
} from './argoService';
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
					color: 'var(--sl-color-gray-3, #8b949e)',
					display: 'flex',
					alignItems: 'center',
					gap: 8,
				}}>
				<Loader2
					size={14}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
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
		{} as Record<string, typeof tree.nodes>,
	);

	return (
		<div
			style={{
				padding: '0.75rem 1rem',
				borderTop: '1px solid var(--sl-color-gray-5, #262626)',
			}}>
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
						<div
							key={`${node.namespace}-${node.name}-${i}`}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: '4px 0',
								fontSize: '0.8rem',
								color: 'var(--sl-color-text, #e6edf3)',
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
									color: 'var(--sl-color-gray-4, #6b7280)',
								}}>
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

// ---------------------------------------------------------------------------
// Application Row
// ---------------------------------------------------------------------------

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
				<ResourceTreePanel token={token} appName={app.metadata.name} />
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
				/>
			))}
		</>
	);
}

import React from 'react';
import { useStore } from '@nanostores/react';
import {
	argoService,
	formatAge,
	healthColor,
	type ArgoApplication,
	type StallReason,
} from './argoService';
import {
	Layers,
	CheckCircle2,
	Activity,
	XCircle,
	RefreshCw,
	Clock,
	AlertCircle,
	ChevronRight,
} from 'lucide-react';

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
				background: 'var(--sl-color-bg-nav, #111)',
				border: '1px solid var(--sl-color-gray-5, #262626)',
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
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.8rem',
				}}>
				{icon}
				{label}
			</div>
			<div
				style={{
					fontSize: '1.75rem',
					fontWeight: 700,
					fontVariantNumeric: 'tabular-nums',
					color: color ?? 'var(--sl-color-text, #e6edf3)',
				}}>
				{value}
			</div>
		</div>
	);
}

function openApp(name: string): void {
	if (argoService.$expandedApp.get() !== name) {
		argoService.toggleExpandedApp(name);
	}
	requestAnimationFrame(() => {
		document
			.getElementById(`argo-app-${name}`)
			?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	});
}

function AttentionRow({
	app,
	tone,
	reason,
	ageMs,
}: {
	app: ArgoApplication;
	tone: string;
	reason: string;
	ageMs?: number;
}) {
	return (
		<button
			type="button"
			onClick={() => openApp(app.metadata.name)}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				width: '100%',
				textAlign: 'left',
				padding: '0.5rem 0.65rem',
				borderRadius: 6,
				border: '1px solid var(--sl-color-gray-5, #262626)',
				background: 'var(--sl-color-bg, #0d0d0d)',
				color: 'var(--sl-color-text, #e6edf3)',
				cursor: 'pointer',
				font: 'inherit',
				fontSize: '0.8rem',
			}}>
			<span
				style={{
					width: 8,
					height: 8,
					borderRadius: '50%',
					background: tone,
					flexShrink: 0,
				}}
			/>
			<span
				style={{
					fontWeight: 600,
					minWidth: 0,
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
				}}>
				{app.metadata.name}
			</span>
			<span
				style={{
					padding: '1px 6px',
					borderRadius: 4,
					background: 'var(--sl-color-gray-6, #1c1c1c)',
					color: 'var(--sl-color-gray-2, #c9d1d9)',
					fontSize: '0.7rem',
					fontFamily: 'var(--sl-font-mono, monospace)',
					flexShrink: 0,
				}}>
				{app.spec.destination.namespace || '—'}
			</span>
			<span style={{ flex: 1 }} />
			<span style={{ color: tone, fontSize: '0.72rem', flexShrink: 0 }}>
				{reason}
				{ageMs != null && ageMs > 0 ? ` · ${formatAge(ageMs)}` : ''}
			</span>
			<ChevronRight
				size={14}
				style={{
					color: 'var(--sl-color-gray-4, #6b7280)',
					flexShrink: 0,
				}}
			/>
		</button>
	);
}

function AttentionSection({
	title,
	icon,
	accent,
	children,
}: {
	title: string;
	icon: React.ReactNode;
	accent: string;
	children: React.ReactNode;
}) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					color: accent,
					fontSize: '0.72rem',
					fontWeight: 700,
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
				}}>
				{icon}
				{title}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
				{children}
			</div>
		</div>
	);
}

function AttentionPanel() {
	const degradedApps = useStore(argoService.$degradedApps);
	const stalledApps = useStore(argoService.$stalledApps);

	if (degradedApps.length === 0 && stalledApps.length === 0) return null;

	return (
		<div
			style={{
				background: 'var(--sl-color-bg-nav, #111)',
				border: '1px solid var(--sl-color-gray-5, #262626)',
				borderRadius: 12,
				padding: '1rem 1.1rem',
				marginBottom: '1.5rem',
				display: 'flex',
				flexDirection: 'column',
				gap: '1rem',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					fontSize: '0.85rem',
					fontWeight: 700,
					color: 'var(--sl-color-text, #e6edf3)',
				}}>
				<AlertCircle size={16} style={{ color: '#fbbf24' }} />
				Needs attention
			</div>

			{degradedApps.length > 0 && (
				<AttentionSection
					title={`Degraded / Missing (${degradedApps.length})`}
					icon={<XCircle size={13} />}
					accent="#ef4444">
					{degradedApps.map((a) => (
						<AttentionRow
							key={a.metadata.name}
							app={a}
							tone={healthColor(a.status.health.status)}
							reason={`${a.status.health.status} · ${a.status.sync.status}`}
						/>
					))}
				</AttentionSection>
			)}

			{stalledApps.length > 0 && (
				<AttentionSection
					title={`Stalled (${stalledApps.length})`}
					icon={<Clock size={13} />}
					accent="#fbbf24">
					{stalledApps.map(
						({
							app,
							stall,
						}: {
							app: ArgoApplication;
							stall: StallReason;
						}) => (
							<AttentionRow
								key={app.metadata.name}
								app={app}
								tone="#fbbf24"
								reason={stall.reason}
								ageMs={stall.ageMs}
							/>
						),
					)}
				</AttentionSection>
			)}
		</div>
	);
}

export default function ReactArgoSummary() {
	const applications = useStore(argoService.$applications);
	const loading = useStore(argoService.$loading);
	const error = useStore(argoService.$error);
	const errorReason = useStore(argoService.$errorReason);
	const totalApps = useStore(argoService.$totalApps);
	const healthyCount = useStore(argoService.$healthyCount);
	const syncedCount = useStore(argoService.$syncedCount);
	const degradedCount = useStore(argoService.$degradedCount);
	const outOfSyncCount = useStore(argoService.$outOfSyncCount);
	const stalledCount = useStore(argoService.$stalledCount);

	return (
		<>
			{/* Error banner */}
			{error && (
				<div
					style={{
						background: errorReason
							? 'rgba(245, 158, 11, 0.1)'
							: 'rgba(239, 68, 68, 0.1)',
						border: errorReason
							? '1px solid rgba(245, 158, 11, 0.3)'
							: '1px solid rgba(239, 68, 68, 0.3)',
						borderRadius: 8,
						padding: '0.75rem 1rem',
						marginBottom: '1rem',
						display: 'flex',
						flexDirection: 'column',
						gap: 4,
						color: errorReason ? '#fcd34d' : '#fca5a5',
						fontSize: '0.85rem',
					}}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
						}}>
						<AlertCircle size={16} />
						{errorReason
							? 'ArgoCD service is currently unreachable'
							: error}
					</div>
					{errorReason && (
						<div
							style={{
								fontSize: '0.75rem',
								color: 'rgba(252, 211, 77, 0.7)',
								paddingLeft: 24,
							}}>
							{errorReason === 'connection timed out'
								? 'The upstream server did not respond in time. It may be starting up or under heavy load.'
								: errorReason === 'connection failed'
									? 'Unable to connect to the ArgoCD server. The service may be down or restarting.'
									: errorReason?.startsWith(
												'upstream returned',
										  )
										? `The ArgoCD server responded with an error (${errorReason}). It may be misconfigured or experiencing issues.`
										: `Reason: ${errorReason}`}
						</div>
					)}
				</div>
			)}

			{/* Summary cards */}
			{applications.length > 0 && (
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
								style={{ color: '#22c55e' }}
							/>
						}
						label="Healthy"
						value={healthyCount}
						color="#22c55e"
					/>
					<StatCard
						icon={
							<Activity size={16} style={{ color: '#22c55e' }} />
						}
						label="Synced"
						value={syncedCount}
						color="#22c55e"
					/>
					<StatCard
						icon={
							<XCircle size={16} style={{ color: '#ef4444' }} />
						}
						label="Degraded"
						value={degradedCount}
						color={degradedCount > 0 ? '#ef4444' : '#22c55e'}
					/>
					<StatCard
						icon={
							<RefreshCw size={16} style={{ color: '#f59e0b' }} />
						}
						label="Out of Sync"
						value={outOfSyncCount}
						color={outOfSyncCount > 0 ? '#f59e0b' : '#22c55e'}
					/>
					<StatCard
						icon={<Clock size={16} style={{ color: '#fbbf24' }} />}
						label="Stalled"
						value={stalledCount}
						color={stalledCount > 0 ? '#fbbf24' : '#22c55e'}
					/>
				</div>
			)}

			{/* Fast debug list of degraded + stalled apps by namespace */}
			{applications.length > 0 && <AttentionPanel />}

			{/* Loading state */}
			{loading && applications.length === 0 && !error && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						minHeight: '40vh',
						textAlign: 'center',
					}}>
					<Activity
						size={28}
						style={{
							animation: 'spin 1s linear infinite',
							color: '#8b5cf6',
						}}
					/>
					<p
						style={{
							color: 'var(--sl-color-gray-3, #8b949e)',
							marginTop: 12,
						}}>
						Loading applications...
					</p>
				</div>
			)}
		</>
	);
}

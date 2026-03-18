import React from 'react';
import { useStore } from '@nanostores/react';
import { argoService } from './argoService';
import {
	Layers,
	CheckCircle2,
	Activity,
	XCircle,
	RefreshCw,
	AlertCircle,
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
				</div>
			)}

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

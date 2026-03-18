import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { homeService, statusColor, type ServiceStatus } from './homeService';
import { Activity, RefreshCw, Clock } from 'lucide-react';

function StatusDot({ status }: { status: ServiceStatus }) {
	const color = statusColor(status);
	return (
		<span
			style={{
				display: 'inline-block',
				width: 8,
				height: 8,
				borderRadius: '50%',
				background: color,
				boxShadow: status === 'ok' ? `0 0 6px ${color}` : 'none',
				flexShrink: 0,
			}}
		/>
	);
}

export default function ReactHomeStatusBanner() {
	const grafanaStatus = useStore(homeService.$grafanaStatus);
	const argoStatus = useStore(homeService.$argoStatus);
	const edgeStatus = useStore(homeService.$edgeStatus);
	const clickhouseStatus = useStore(homeService.$clickhouseStatus);
	const securityStatus = useStore(homeService.$securityStatus);
	const allOk = useStore(homeService.$allOk);
	const anyError = useStore(homeService.$anyError);
	const anyLoading = useStore(homeService.$anyLoading);
	const lastUpdated = useStore(homeService.$lastUpdated);
	const loading = useStore(homeService.$loading);
	const authState = useStore(homeService.$authState);

	useEffect(() => {
		if (authState === 'authenticated') {
			homeService.fetchAll();
		}
	}, [authState]);

	const overallColor = anyLoading
		? '#94a3b8'
		: allOk
			? '#22c55e'
			: anyError
				? '#ef4444'
				: '#f59e0b';
	const overallLabel = anyLoading
		? 'Checking services...'
		: allOk
			? 'All Systems Operational'
			: anyError
				? 'Service Disruption Detected'
				: 'Partial Degradation';

	const services = [
		{ name: 'Monitoring', status: grafanaStatus },
		{ name: 'Deployments', status: argoStatus },
		{ name: 'Edge', status: edgeStatus },
		{ name: 'Logs', status: clickhouseStatus },
		{ name: 'Security', status: securityStatus },
	];

	return (
		<>
			{/* Header */}
			<header style={{ marginBottom: '0.25rem' }}>
				<h1
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						margin: 0,
						fontSize: '1.5rem',
						fontWeight: 700,
						letterSpacing: '-0.01em',
						display: 'flex',
						alignItems: 'center',
					}}>
					<Activity
						size={22}
						style={{
							color: 'var(--sl-color-accent, #06b6d4)',
							marginRight: 8,
							verticalAlign: 'middle',
						}}
					/>
					Infrastructure Dashboard
				</h1>
				<p
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						margin: '0.25rem 0 0',
						fontSize: '0.85rem',
					}}>
					Real-time cluster monitoring, deployment status, and service
					health
				</p>
			</header>

			{/* System Status Banner */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '0.75rem 1rem',
					borderRadius: 10,
					border: '1px solid var(--sl-color-gray-5, #262626)',
					background: 'var(--sl-color-bg-nav, #111)',
					gap: '1rem',
					flexWrap: 'wrap',
				}}>
				{/* Left: overall status */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.5rem',
					}}>
					<span
						style={{
							display: 'inline-block',
							width: 10,
							height: 10,
							borderRadius: '50%',
							background: overallColor,
							boxShadow: allOk
								? `0 0 8px ${overallColor}`
								: 'none',
						}}
					/>
					<span
						style={{
							fontWeight: 600,
							fontSize: '0.85rem',
							color: 'var(--sl-color-text, #e6edf3)',
						}}>
						{overallLabel}
					</span>
				</div>

				{/* Center: per-service dots */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '1rem',
					}}>
					{services.map((s) => (
						<div
							key={s.name}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 4,
								fontSize: '0.75rem',
								color: 'var(--sl-color-gray-3, #8b949e)',
							}}>
							<StatusDot status={s.status} />
							{s.name}
						</div>
					))}
				</div>

				{/* Right: timestamp + refresh */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.75rem',
					}}>
					{lastUpdated && (
						<span
							style={{
								fontSize: '0.7rem',
								color: 'var(--sl-color-gray-4, #6b7280)',
								display: 'flex',
								alignItems: 'center',
								gap: 4,
							}}>
							<Clock size={10} />
							{lastUpdated.toLocaleTimeString([], {
								hour: '2-digit',
								minute: '2-digit',
							})}
						</span>
					)}
					<button
						onClick={() => homeService.fetchAll()}
						disabled={loading}
						title="Refresh all"
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 28,
							height: 28,
							borderRadius: 6,
							border: '1px solid var(--sl-color-gray-5, #262626)',
							background: 'transparent',
							color: 'var(--sl-color-gray-3, #8b949e)',
							cursor: loading ? 'not-allowed' : 'pointer',
							transition: 'border-color 0.2s',
						}}>
						<RefreshCw
							size={13}
							style={
								loading
									? { animation: 'spin 1s linear infinite' }
									: undefined
							}
						/>
					</button>
				</div>
			</div>
		</>
	);
}

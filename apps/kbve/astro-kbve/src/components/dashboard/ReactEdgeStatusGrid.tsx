import { useStore } from '@nanostores/react';
import { edgeService, type FunctionHealth } from './edgeService';
import {
	CheckCircle,
	XCircle,
	Loader2,
	Zap,
	Clock,
	Server,
	Globe,
} from 'lucide-react';

type Status = 'ok' | 'error' | 'pending';

function StatusBadge({
	label,
	icon,
	status,
	latencyMs,
	error,
}: {
	label: string;
	icon: React.ReactNode;
	status: Status;
	latencyMs?: number;
	error?: string;
}) {
	const color =
		status === 'ok'
			? '#22c55e'
			: status === 'error'
				? '#ef4444'
				: 'var(--sl-color-gray-4, #6b7280)';

	const StatusIcon =
		status === 'ok' ? CheckCircle : status === 'error' ? XCircle : Loader2;

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: '0.4rem',
				padding: '4px 8px',
				borderRadius: '6px',
				background: `${color}12`,
				border: `1px solid ${color}30`,
				fontSize: '0.72rem',
			}}>
			{icon}
			<StatusIcon size={12} style={{ color, flexShrink: 0 }} />
			<span style={{ color, fontWeight: 600 }}>{label}</span>
			{latencyMs != null && (
				<span
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontVariantNumeric: 'tabular-nums',
					}}>
					{latencyMs}ms
				</span>
			)}
			{error && status === 'error' && (
				<span style={{ color: '#fca5a5', marginLeft: 2 }}>{error}</span>
			)}
		</div>
	);
}

function StatusCard({ fn }: { fn: FunctionHealth }) {
	// Overall status: ok if either passes, error if both fail
	const overall =
		fn.proxyStatus === 'ok' || fn.directStatus === 'ok' ? 'ok' : 'error';
	const borderColor =
		overall === 'ok'
			? 'var(--sl-color-gray-5, #262626)'
			: 'rgba(239, 68, 68, 0.3)';

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: '0.5rem',
				padding: '1.25rem',
				borderRadius: '12px',
				border: `1px solid ${borderColor}`,
				background: 'var(--sl-color-bg-nav, #111)',
			}}>
			{/* Header */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
				}}>
				<span
					style={{
						display: 'inline-block',
						width: 8,
						height: 8,
						borderRadius: '50%',
						background: overall === 'ok' ? '#22c55e' : '#ef4444',
						boxShadow:
							overall === 'ok'
								? '0 0 6px #22c55e'
								: '0 0 6px #ef4444',
						flexShrink: 0,
					}}
				/>
				<span
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						fontWeight: 600,
						fontSize: '1rem',
						flex: 1,
					}}>
					{fn.label}
				</span>
			</div>

			{/* Description */}
			<div
				style={{
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.8rem',
				}}>
				{fn.description}
			</div>

			{/* Dual status badges */}
			<div
				style={{
					display: 'flex',
					gap: '0.5rem',
					flexWrap: 'wrap',
				}}>
				<StatusBadge
					label="Proxy"
					icon={<Server size={11} style={{ color: '#8b949e' }} />}
					status={fn.proxyStatus}
					latencyMs={fn.proxyLatencyMs}
					error={fn.proxyError}
				/>
				<StatusBadge
					label="Direct"
					icon={<Globe size={11} style={{ color: '#8b949e' }} />}
					status={fn.directStatus}
					latencyMs={fn.directLatencyMs}
					error={fn.directError}
				/>
			</div>

			{/* Version + timestamp (from health only) */}
			{fn.version && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.35rem',
						color: 'var(--sl-color-gray-4, #6b7280)',
						fontSize: '0.75rem',
					}}>
					<Zap size={12} />
					<span>v{fn.version}</span>
				</div>
			)}
			{fn.timestamp && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.35rem',
						color: 'var(--sl-color-gray-4, #6b7280)',
						fontSize: '0.75rem',
					}}>
					<Clock size={12} />
					<span>
						{new Date(fn.timestamp).toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
						})}
					</span>
				</div>
			)}
		</div>
	);
}

export default function ReactEdgeStatusGrid() {
	const functions = useStore(edgeService.$functions);

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
				gap: '1rem',
			}}>
			{functions.map((fn) => (
				<StatusCard key={fn.name} fn={fn} />
			))}
		</div>
	);
}

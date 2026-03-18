import { useStore } from '@nanostores/react';
import { edgeService, type FunctionHealth } from './edgeService';
import { CheckCircle, XCircle, Loader2, Zap, Clock } from 'lucide-react';

function StatusCard({ fn }: { fn: FunctionHealth }) {
	const statusColor =
		fn.status === 'ok'
			? '#22c55e'
			: fn.status === 'error'
				? '#ef4444'
				: 'var(--sl-color-gray-3, #8b949e)';

	const StatusIcon =
		fn.status === 'ok'
			? CheckCircle
			: fn.status === 'error'
				? XCircle
				: Loader2;

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: '0.5rem',
				padding: '1.25rem',
				borderRadius: '12px',
				border: '1px solid var(--sl-color-gray-5, #262626)',
				background: 'var(--sl-color-bg-nav, #111)',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
				}}>
				<StatusIcon size={18} style={{ color: statusColor }} />
				<span
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						fontWeight: 600,
						fontSize: '1rem',
						flex: 1,
					}}>
					{fn.label}
				</span>
				{fn.latencyMs != null && (
					<span
						style={{
							padding: '2px 6px',
							borderRadius: '4px',
							background: 'var(--sl-color-gray-6, #1c1c1c)',
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontSize: '0.7rem',
							fontWeight: 500,
							fontVariantNumeric: 'tabular-nums',
						}}>
						{fn.latencyMs}ms
					</span>
				)}
			</div>
			<div
				style={{
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.8rem',
				}}>
				{fn.description}
			</div>
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
			{fn.error && (
				<div
					style={{
						color: '#fca5a5',
						fontSize: '0.75rem',
						padding: '4px 8px',
						borderRadius: '4px',
						background: 'rgba(239,68,68,0.1)',
					}}>
					{fn.error}
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
				gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
				gap: '1rem',
			}}>
			{functions.map((fn) => (
				<StatusCard key={fn.name} fn={fn} />
			))}
		</div>
	);
}

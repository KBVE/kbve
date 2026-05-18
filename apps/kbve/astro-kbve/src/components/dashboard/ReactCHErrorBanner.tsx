import { useStore } from '@nanostores/react';
import { AlertOctagon, RefreshCw, X } from 'lucide-react';
import { clickhouseService } from './clickhouseService';

export default function ReactCHErrorBanner() {
	const err = useStore(clickhouseService.$upstreamError);
	if (!err) return null;

	const label =
		err.status === 0
			? 'Network error'
			: err.status === 503
				? 'ClickHouse proxy unavailable (503)'
				: err.status === 502
					? 'ClickHouse upstream error (502)'
					: `Upstream error (${err.status})`;

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: '0.75rem',
				padding: '0.75rem 1rem',
				borderRadius: 10,
				border: '1px solid rgba(239, 68, 68, 0.4)',
				background: 'rgba(239, 68, 68, 0.08)',
				color: 'var(--sl-color-text)',
			}}>
			<AlertOctagon
				size={18}
				style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }}
			/>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						fontWeight: 700,
						fontSize: '0.9rem',
						color: '#ef4444',
					}}>
					{label} on {err.source}
				</div>
				{err.body ? (
					<pre
						style={{
							margin: '0.35rem 0 0 0',
							fontSize: '0.75rem',
							lineHeight: 1.4,
							whiteSpace: 'pre-wrap',
							wordBreak: 'break-word',
							color: 'rgba(255, 255, 255, 0.75)',
							maxHeight: 120,
							overflow: 'auto',
						}}>
						{err.body}
					</pre>
				) : null}
			</div>
			<button
				onClick={() => clickhouseService.refreshAll()}
				title="Retry"
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					padding: '4px 10px',
					borderRadius: 6,
					border: '1px solid rgba(239, 68, 68, 0.4)',
					background: 'rgba(239, 68, 68, 0.12)',
					color: '#ef4444',
					cursor: 'pointer',
					fontSize: '0.8rem',
					fontWeight: 600,
				}}>
				<RefreshCw size={13} />
				Retry
			</button>
			<button
				onClick={() => clickhouseService.$upstreamError.set(null)}
				title="Dismiss"
				style={{
					display: 'flex',
					alignItems: 'center',
					padding: 4,
					borderRadius: 6,
					border: 'none',
					background: 'transparent',
					color: 'rgba(255, 255, 255, 0.6)',
					cursor: 'pointer',
				}}>
				<X size={14} />
			</button>
		</div>
	);
}

import { useStore } from '@nanostores/react';
import { forgejoService } from './forgejoService';
import { RefreshCw } from 'lucide-react';

export default function ReactForgejoHeader() {
	const lastUpdated = useStore(forgejoService.$lastUpdated);
	const loading = useStore(forgejoService.$loading);

	return (
		<div
			className="not-content"
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: '0.75rem',
			}}>
			{lastUpdated && (
				<span
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.75rem',
					}}>
					Updated {lastUpdated.toLocaleTimeString()}
				</span>
			)}
			<button
				onClick={() => forgejoService.refresh()}
				disabled={loading}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					padding: '0.4rem 0.8rem',
					borderRadius: 8,
					border: '1px solid var(--sl-color-gray-5, #30363d)',
					background: 'var(--sl-color-gray-6, #161b22)',
					color: 'var(--sl-color-text, #e6edf3)',
					cursor: loading ? 'not-allowed' : 'pointer',
					opacity: loading ? 0.6 : 1,
					fontSize: '0.8rem',
				}}>
				<RefreshCw
					size={14}
					style={
						loading
							? { animation: 'spin 1s linear infinite' }
							: undefined
					}
				/>
				Refresh
			</button>
		</div>
	);
}

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
				justifyContent: 'space-between',
				alignItems: 'center',
				marginBottom: '1.5rem',
				flexWrap: 'wrap',
				gap: '0.5rem',
			}}>
			<div>
				<h2
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						margin: 0,
						fontSize: '1.5rem',
						fontWeight: 700,
					}}>
					Forgejo
				</h2>
				{lastUpdated && (
					<p
						style={{
							color: 'var(--sl-color-gray-3, #8b949e)',
							margin: '0.25rem 0 0',
							fontSize: '0.75rem',
						}}>
						Last updated: {lastUpdated.toLocaleTimeString()}
					</p>
				)}
			</div>
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

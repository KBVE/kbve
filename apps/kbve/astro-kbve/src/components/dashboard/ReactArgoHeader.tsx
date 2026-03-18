import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { argoService } from './argoService';
import { GitBranch, RefreshCw, Clock } from 'lucide-react';

export default function ReactArgoHeader() {
	const loading = useStore(argoService.$loading);
	const lastUpdated = useStore(argoService.$lastUpdated);
	const authState = useStore(argoService.$authState);

	useEffect(() => {
		if (authState === 'authenticated') {
			argoService.loadCacheAndFetch();
		}
	}, [authState]);

	return (
		<div
			style={{
				display: 'flex',
				justifyContent: 'space-between',
				alignItems: 'center',
				marginBottom: '1.5rem',
				flexWrap: 'wrap',
				gap: '0.75rem',
			}}>
			<div>
				<h1
					style={{
						margin: 0,
						fontSize: '1.5rem',
						fontWeight: 700,
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						color: 'var(--sl-color-text, #e6edf3)',
					}}>
					<GitBranch size={22} style={{ color: '#8b5cf6' }} />
					ArgoCD Dashboard
				</h1>
				{lastUpdated && (
					<p
						style={{
							margin: '4px 0 0',
							fontSize: '0.75rem',
							color: 'var(--sl-color-gray-4, #6b7280)',
							display: 'flex',
							alignItems: 'center',
							gap: 4,
						}}>
						<Clock size={10} />
						Updated {lastUpdated.toLocaleTimeString()}
					</p>
				)}
			</div>
			<button
				onClick={() => argoService.refresh()}
				disabled={loading}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					padding: '6px 14px',
					borderRadius: 8,
					border: '1px solid var(--sl-color-gray-5, #262626)',
					background: 'transparent',
					color: 'var(--sl-color-gray-3, #8b949e)',
					cursor: loading ? 'not-allowed' : 'pointer',
					fontSize: '0.8rem',
					transition: 'border-color 0.2s',
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

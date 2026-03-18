import { useStore } from '@nanostores/react';
import { edgeService } from './edgeService';
import { RefreshCw } from 'lucide-react';

export default function ReactEdgeHeader() {
	const fromCache = useStore(edgeService.$fromCache);
	const refreshing = useStore(edgeService.$refreshing);

	return (
		<header
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
			}}>
			<div>
				<h1
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						margin: 0,
						fontSize: '1.5rem',
						fontWeight: 700,
						display: 'inline',
					}}>
					Edge Functions
				</h1>
				{fromCache && (
					<span
						style={{
							marginLeft: '0.75rem',
							padding: '2px 8px',
							borderRadius: '4px',
							background: 'var(--sl-color-gray-6, #1c1c1c)',
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontSize: '0.7rem',
							fontWeight: 500,
							textTransform: 'uppercase' as const,
							letterSpacing: '0.05em',
						}}>
						cached
					</span>
				)}
			</div>
			<button
				onClick={() => edgeService.refresh()}
				disabled={refreshing}
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '36px',
					height: '36px',
					borderRadius: '8px',
					border: '1px solid var(--sl-color-gray-5, #262626)',
					background: 'transparent',
					color: 'var(--sl-color-text, #e6edf3)',
					cursor: 'pointer',
					transition: 'border-color 0.2s',
				}}
				title="Refresh health checks">
				<RefreshCw
					size={18}
					style={
						refreshing
							? { animation: 'spin 1s linear infinite' }
							: undefined
					}
				/>
			</button>
		</header>
	);
}

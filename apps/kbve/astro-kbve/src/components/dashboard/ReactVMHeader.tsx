import { useStore } from '@nanostores/react';
import { vmService } from './vmService';
import { RefreshCw, Monitor } from 'lucide-react';

export default function ReactVMHeader() {
	const lastUpdated = useStore(vmService.$lastUpdated);
	const loading = useStore(vmService.$loading);
	const runningCount = useStore(vmService.$runningCount);
	const totalCount = useStore(vmService.$totalCount);

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
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<Monitor
						size={20}
						style={{ color: 'var(--sl-color-accent, #06b6d4)' }}
					/>
					<h2
						style={{
							color: 'var(--sl-color-text, #e6edf3)',
							margin: 0,
							fontSize: '1.5rem',
							fontWeight: 700,
						}}>
						Virtual Machines
					</h2>
					{totalCount > 0 && (
						<span
							style={{
								padding: '2px 8px',
								borderRadius: 6,
								fontSize: '0.7rem',
								fontWeight: 600,
								background:
									runningCount > 0
										? 'rgba(34, 197, 94, 0.1)'
										: 'rgba(107, 114, 128, 0.1)',
								border: `1px solid ${runningCount > 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(107, 114, 128, 0.3)'}`,
								color: runningCount > 0 ? '#22c55e' : '#6b7280',
							}}>
							{runningCount}/{totalCount} running
						</span>
					)}
				</div>
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
				onClick={() => vmService.refresh()}
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

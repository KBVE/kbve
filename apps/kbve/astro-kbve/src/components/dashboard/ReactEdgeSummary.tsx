import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { edgeService } from './edgeService';
import { Activity, XCircle, Clock, AlertCircle } from 'lucide-react';

export default function ReactEdgeSummary() {
	const okCount = useStore(edgeService.$okCount);
	const errorCount = useStore(edgeService.$errorCount);
	const totalCount = useStore(edgeService.$totalCount);
	const lastChecked = useStore(edgeService.$lastChecked);
	const error = useStore(edgeService.$error);

	useEffect(() => {
		edgeService.fetchHealth();
	}, []);

	return (
		<>
			{/* Summary bar */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '1.5rem',
					padding: '0.75rem 1rem',
					borderRadius: 10,
					background: 'var(--sl-color-bg-nav, #111)',
					border: '1px solid var(--sl-color-gray-5, #262626)',
					fontSize: '0.85rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					flexWrap: 'wrap',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.4rem',
					}}>
					<Activity size={16} />
					<span>
						{okCount}/{totalCount} operational
					</span>
				</div>
				{errorCount > 0 && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '0.4rem',
							color: '#fca5a5',
						}}>
						<XCircle size={16} />
						<span>
							{errorCount} {errorCount === 1 ? 'issue' : 'issues'}
						</span>
					</div>
				)}
				{lastChecked && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '0.4rem',
						}}>
						<Clock size={16} />
						<span>
							{lastChecked.toLocaleTimeString([], {
								hour: '2-digit',
								minute: '2-digit',
								second: '2-digit',
							})}
						</span>
					</div>
				)}
			</div>

			{/* Error banner */}
			{error && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.5rem',
						padding: '0.75rem 1rem',
						borderRadius: '8px',
						background: 'rgba(239,68,68,0.1)',
						border: '1px solid rgba(239,68,68,0.3)',
						color: '#fca5a5',
						fontSize: '0.875rem',
					}}>
					<AlertCircle size={16} />
					<span>{error}</span>
				</div>
			)}
		</>
	);
}

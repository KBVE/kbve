import { useStore } from '@nanostores/react';
import { Database, Loader2, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { clickhouseService } from './clickhouseService';

export default function ReactCHSummary() {
	const statsLoading = useStore(clickhouseService.$statsLoading);
	const totalLogs = useStore(clickhouseService.$totalLogs);
	const totalErrors = useStore(clickhouseService.$totalErrors);
	const totalWarns = useStore(clickhouseService.$totalWarns);
	const namespaceSummaries = useStore(clickhouseService.$namespaceSummaries);
	const levelFilter = useStore(clickhouseService.$levelFilter);

	return (
		<div
			style={{
				display: 'flex',
				gap: '1.5rem',
				padding: '0.75rem 1rem',
				borderRadius: 10,
				border: '1px solid var(--sl-color-gray-5, #262626)',
				background: 'var(--sl-color-bg-nav, #111)',
				flexWrap: 'wrap',
				alignItems: 'center',
			}}>
			{statsLoading ? (
				<Loader2
					size={16}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
			) : (
				<>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
						}}>
						<Database size={14} style={{ color: '#f59e0b' }} />
						<span
							style={{
								fontWeight: 700,
								fontSize: '1.1rem',
								color: 'var(--sl-color-text)',
								fontVariantNumeric: 'tabular-nums',
							}}>
							{totalLogs.toLocaleString()}
						</span>
						<span
							style={{
								fontSize: '0.8rem',
								color: 'rgba(255, 255, 255, 0.7)',
								fontWeight: 500,
							}}>
							total logs
						</span>
					</div>
					<button
						onClick={() =>
							clickhouseService.toggleLevelFilter('error')
						}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							padding: '4px 10px',
							borderRadius: 6,
							border: `1px solid ${levelFilter === 'error' ? 'rgba(239, 68, 68, 0.5)' : 'transparent'}`,
							background:
								levelFilter === 'error'
									? 'rgba(239, 68, 68, 0.12)'
									: 'transparent',
							cursor: 'pointer',
							transition: 'all 0.15s',
						}}>
						<XCircle size={14} style={{ color: '#ef4444' }} />
						<span
							style={{
								fontWeight: 700,
								fontSize: '1.1rem',
								color: '#ef4444',
								fontVariantNumeric: 'tabular-nums',
							}}>
							{totalErrors.toLocaleString()}
						</span>
						<span
							style={{
								fontSize: '0.8rem',
								color: 'rgba(255, 255, 255, 0.7)',
								fontWeight: 500,
							}}>
							errors
						</span>
					</button>
					<button
						onClick={() =>
							clickhouseService.toggleLevelFilter('warn')
						}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							padding: '4px 10px',
							borderRadius: 6,
							border: `1px solid ${levelFilter === 'warn' ? 'rgba(245, 158, 11, 0.5)' : 'transparent'}`,
							background:
								levelFilter === 'warn'
									? 'rgba(245, 158, 11, 0.12)'
									: 'transparent',
							cursor: 'pointer',
							transition: 'all 0.15s',
						}}>
						<AlertTriangle size={14} style={{ color: '#f59e0b' }} />
						<span
							style={{
								fontWeight: 700,
								fontSize: '1.1rem',
								color: '#f59e0b',
								fontVariantNumeric: 'tabular-nums',
							}}>
							{totalWarns.toLocaleString()}
						</span>
						<span
							style={{
								fontSize: '0.8rem',
								color: 'rgba(255, 255, 255, 0.7)',
								fontWeight: 500,
							}}>
							warnings
						</span>
					</button>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							marginLeft: 'auto',
						}}>
						<Clock
							size={13}
							style={{ color: 'rgba(255, 255, 255, 0.6)' }}
						/>
						<span
							style={{
								fontSize: '0.8rem',
								color: 'rgba(255, 255, 255, 0.7)',
								fontWeight: 500,
							}}>
							{namespaceSummaries.length} namespaces
						</span>
					</div>
				</>
			)}
		</div>
	);
}

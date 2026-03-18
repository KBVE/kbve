import { useStore } from '@nanostores/react';
import {
	grafanaService,
	TIME_RANGE_KEYS,
	type TimeRangeKey,
} from './grafanaService';
import { RefreshCw, AlertCircle } from 'lucide-react';

export default function ReactGrafanaHeader() {
	const fromCache = useStore(grafanaService.$fromCache);
	const refreshing = useStore(grafanaService.$refreshing);
	const error = useStore(grafanaService.$error);
	const timeRange = useStore(grafanaService.$timeRange);

	return (
		<>
			<header
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					flexWrap: 'wrap',
					gap: '0.75rem',
				}}>
				<div>
					<h1
						style={{
							color: 'var(--sl-color-text, #e6edf3)',
							margin: 0,
							fontSize: '1.75rem',
							fontWeight: 700,
							display: 'inline',
						}}>
						Cluster Overview
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
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.75rem',
					}}>
					{/* Time range picker */}
					<div
						style={{
							display: 'flex',
							gap: '2px',
							background: 'var(--sl-color-bg-nav, #111)',
							border: '1px solid var(--sl-color-gray-5, #262626)',
							borderRadius: '8px',
							padding: '3px',
						}}>
						{TIME_RANGE_KEYS.map((key) => (
							<button
								key={key}
								onClick={() =>
									grafanaService.setTimeRange(
										key as TimeRangeKey,
									)
								}
								style={
									key === timeRange
										? {
												padding: '4px 10px',
												borderRadius: '6px',
												border: 'none',
												background:
													'var(--sl-color-accent, #06b6d4)',
												color: '#fff',
												cursor: 'pointer',
												fontSize: '0.8rem',
												fontWeight: 600,
											}
										: {
												padding: '4px 10px',
												borderRadius: '6px',
												border: 'none',
												background: 'transparent',
												color: 'var(--sl-color-gray-3, #8b949e)',
												cursor: 'pointer',
												fontSize: '0.8rem',
												fontWeight: 500,
												transition: 'all 0.15s',
											}
								}>
								{key}
							</button>
						))}
					</div>
					<button
						onClick={() => grafanaService.refresh()}
						disabled={refreshing}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: '36px',
							height: '36px',
							borderRadius: '8px',
							border: '1px solid var(--sl-color-gray-5, #262626)',
							background: 'var(--sl-color-bg-nav, #111)',
							color: 'var(--sl-color-text, #e6edf3)',
							cursor: 'pointer',
							transition: 'border-color 0.2s',
						}}
						title="Refresh metrics">
						<RefreshCw
							size={18}
							style={
								refreshing
									? {
											animation:
												'spin 1s linear infinite',
										}
									: undefined
							}
						/>
					</button>
				</div>
			</header>

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

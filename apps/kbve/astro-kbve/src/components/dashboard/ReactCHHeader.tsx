import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { Database, RefreshCw } from 'lucide-react';
import { clickhouseService } from './clickhouseService';

function TimeRangeSelector() {
	const minutes = useStore(clickhouseService.$minutes);
	const options = [
		{ label: '15m', value: 15 },
		{ label: '1h', value: 60 },
		{ label: '6h', value: 360 },
		{ label: '24h', value: 1440 },
		{ label: '7d', value: 10080 },
	];
	return (
		<div style={{ display: 'flex', gap: 4 }}>
			{options.map((o) => (
				<button
					key={o.value}
					onClick={() => clickhouseService.setMinutes(o.value)}
					style={{
						padding: '4px 10px',
						borderRadius: 6,
						border: `1px solid ${minutes === o.value ? 'var(--sl-color-accent, #06b6d4)' : 'var(--sl-color-gray-5, #262626)'}`,
						background:
							minutes === o.value
								? 'rgba(6, 182, 212, 0.15)'
								: 'transparent',
						color:
							minutes === o.value
								? 'var(--sl-color-accent, #06b6d4)'
								: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.75rem',
						fontWeight: 600,
						cursor: 'pointer',
						transition: 'all 0.15s',
					}}>
					{o.label}
				</button>
			))}
		</div>
	);
}

export default function ReactCHHeader() {
	const statsLoading = useStore(clickhouseService.$statsLoading);
	const authState = useStore(clickhouseService.$authState);
	const minutes = useStore(clickhouseService.$minutes);

	// Reload stats + logs when minutes changes or auth becomes ready
	useEffect(() => {
		if (authState === 'authenticated') {
			clickhouseService.refreshAll();
		}
	}, [authState, minutes]);

	return (
		<header style={{ marginBottom: '0.25rem' }}>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'flex-start',
					flexWrap: 'wrap',
					gap: '1rem',
				}}>
				<div>
					<h1
						style={{
							color: 'var(--sl-color-text, #e6edf3)',
							margin: 0,
							fontSize: '1.5rem',
							fontWeight: 700,
							letterSpacing: '-0.01em',
							display: 'flex',
							alignItems: 'center',
						}}>
						<Database
							size={22}
							style={{
								color: '#f59e0b',
								marginRight: 8,
								verticalAlign: 'middle',
							}}
						/>
						ClickHouse Logs
					</h1>
					<p
						style={{
							color: 'rgba(255, 255, 255, 0.6)',
							margin: '0.25rem 0 0',
							fontSize: '0.85rem',
							fontWeight: 500,
						}}>
						Real-time cluster log aggregation and analysis
					</p>
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 12,
					}}>
					<TimeRangeSelector />
					<button
						onClick={() => clickhouseService.refreshAll()}
						disabled={statsLoading}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 32,
							height: 32,
							borderRadius: 8,
							border: '1px solid var(--sl-color-gray-5, #262626)',
							background: 'transparent',
							color: 'var(--sl-color-gray-3)',
							cursor: statsLoading ? 'not-allowed' : 'pointer',
						}}>
						<RefreshCw
							size={14}
							style={
								statsLoading
									? {
											animation:
												'spin 1s linear infinite',
										}
									: undefined
							}
						/>
					</button>
				</div>
			</div>
		</header>
	);
}

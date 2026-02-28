import { useState, useEffect, useCallback } from 'react';

interface PriceData {
	id: number;
	name: string;
	high: number | null;
	low: number | null;
	avg: number | null;
	high_time: number | null;
	low_time: number | null;
}

interface VolumeData {
	highPriceVolume: number;
	lowPriceVolume: number;
}

interface OSRSPriceWidgetProps {
	itemId: number;
	apiBaseUrl?: string;
	refreshInterval?: number; // in milliseconds, 0 to disable
}

/**
 * Format a number with thousands separators
 */
function formatGP(value: number | null): string {
	if (value === null || value === undefined) return 'N/A';
	return value.toLocaleString();
}

/**
 * Format volume numbers compactly
 */
function formatVolume(value: number | null): string {
	if (value === null || value === undefined) return '—';
	if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
	if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
	return value.toLocaleString();
}

/**
 * Format a Unix timestamp to relative time
 */
function formatRelativeTime(timestamp: number | null): string {
	if (!timestamp) return 'Unknown';

	const now = Math.floor(Date.now() / 1000);
	const diff = now - timestamp;

	if (diff < 60) return 'just now';
	if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
	return `${Math.floor(diff / 86400)} days ago`;
}

// Styles using Starlight CSS variables - Compact layout
const styles = {
	widget: {
		borderRadius: '0.5rem',
		border: '1px solid var(--sl-color-gray-5)',
		background: 'var(--sl-color-bg-nav)',
		padding: '0.75rem',
	} as React.CSSProperties,
	widgetLoading: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: '80px',
	} as React.CSSProperties,
	loading: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		color: 'var(--sl-color-gray-3)',
		fontSize: '0.75rem',
	} as React.CSSProperties,
	spinner: {
		width: '0.875rem',
		height: '0.875rem',
		border: '2px solid var(--sl-color-gray-5)',
		borderTopColor: 'var(--sl-color-accent)',
		borderRadius: '50%',
		animation: 'spin 1s linear infinite',
	} as React.CSSProperties,
	error: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		color: '#ef4444',
		fontSize: '0.75rem',
	} as React.CSSProperties,
	errorIcon: {
		width: '1.25rem',
		height: '1.25rem',
		borderRadius: '50%',
		background: 'rgba(239, 68, 68, 0.2)',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontWeight: 'bold',
		fontSize: '0.625rem',
	} as React.CSSProperties,
	retryBtn: {
		marginLeft: '0.5rem',
		padding: '0.1875rem 0.375rem',
		fontSize: '0.625rem',
		background: 'var(--sl-color-gray-6)',
		color: 'var(--sl-color-gray-2)',
		border: '1px solid var(--sl-color-gray-5)',
		borderRadius: '0.25rem',
		cursor: 'pointer',
		transition: 'all 0.15s ease',
	} as React.CSSProperties,
	// Main grid: 3 price cards + volume section
	mainGrid: {
		display: 'grid',
		gridTemplateColumns: 'repeat(3, 1fr)',
		gap: '0.5rem',
	} as React.CSSProperties,
	card: {
		borderRadius: '0.375rem',
		padding: '0.5rem',
		textAlign: 'center' as const,
		border: '1px solid var(--sl-color-gray-5)',
	} as React.CSSProperties,
	cardBuy: {
		background: 'rgba(239, 68, 68, 0.1)',
		borderColor: 'rgba(239, 68, 68, 0.3)',
	} as React.CSSProperties,
	cardSell: {
		background: 'rgba(34, 197, 94, 0.1)',
		borderColor: 'rgba(34, 197, 94, 0.3)',
	} as React.CSSProperties,
	cardAvg: {
		background: 'var(--sl-color-accent-low)',
		borderColor: 'var(--sl-color-accent)',
	} as React.CSSProperties,
	cardLabel: {
		fontSize: '0.5rem',
		textTransform: 'uppercase' as const,
		letterSpacing: '0.05em',
		color: 'var(--sl-color-gray-3)',
		marginBottom: '0.125rem',
	} as React.CSSProperties,
	cardValue: {
		fontSize: '0.875rem',
		fontWeight: 600,
		color: 'var(--sl-color-white)',
		display: 'flex',
		alignItems: 'baseline',
		justifyContent: 'center',
		gap: '0.125rem',
	} as React.CSSProperties,
	cardGp: {
		fontSize: '0.625rem',
		fontWeight: 'normal',
		color: 'var(--sl-color-accent)',
	} as React.CSSProperties,
	cardTime: {
		fontSize: '0.5rem',
		color: 'var(--sl-color-gray-3)',
		marginTop: '0.125rem',
	} as React.CSSProperties,
	// Volume section
	volumeSection: {
		marginTop: '0.5rem',
		paddingTop: '0.5rem',
		borderTop: '1px solid var(--sl-color-gray-5)',
	} as React.CSSProperties,
	volumeGrid: {
		display: 'grid',
		gridTemplateColumns: 'repeat(3, 1fr)',
		gap: '0.5rem',
	} as React.CSSProperties,
	volumeCard: {
		borderRadius: '0.375rem',
		padding: '0.375rem 0.5rem',
		background: 'var(--sl-color-gray-6)',
		border: '1px solid var(--sl-color-gray-5)',
		textAlign: 'center' as const,
	} as React.CSSProperties,
	volumeLabel: {
		fontSize: '0.5rem',
		textTransform: 'uppercase' as const,
		letterSpacing: '0.05em',
		color: 'var(--sl-color-gray-3)',
		marginBottom: '0.0625rem',
	} as React.CSSProperties,
	volumeValue: {
		fontSize: '0.75rem',
		fontWeight: 600,
		color: 'var(--sl-color-white)',
	} as React.CSSProperties,
	volumeValueBuy: {
		color: '#ef4444',
	} as React.CSSProperties,
	volumeValueSell: {
		color: '#22c55e',
	} as React.CSSProperties,
	footer: {
		display: 'flex',
		flexWrap: 'wrap' as const,
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: '0.375rem',
		marginTop: '0.5rem',
		paddingTop: '0.5rem',
		borderTop: '1px solid var(--sl-color-gray-5)',
		fontSize: '0.5rem',
		color: 'var(--sl-color-gray-3)',
	} as React.CSSProperties,
	refreshBtn: {
		padding: '0.1875rem 0.375rem',
		fontSize: '0.5rem',
		background: 'var(--sl-color-accent-low)',
		color: 'var(--sl-color-accent-high)',
		border: '1px solid var(--sl-color-accent)',
		borderRadius: '0.25rem',
		cursor: 'pointer',
		transition: 'all 0.15s ease',
	} as React.CSSProperties,
};

export default function OSRSPriceWidget({
	itemId,
	apiBaseUrl = '',
	refreshInterval = 60000, // Default: refresh every 60 seconds
}: OSRSPriceWidgetProps) {
	const [priceData, setPriceData] = useState<PriceData | null>(null);
	const [volumeData, setVolumeData] = useState<VolumeData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	const fetchPrices = useCallback(async () => {
		try {
			// Fetch price data from our API
			const priceResponse = await fetch(
				`${apiBaseUrl}/api/v1/osrs/${itemId}`,
			);

			if (!priceResponse.ok) {
				if (priceResponse.status === 404) {
					throw new Error('Item not found');
				}
				throw new Error(
					`Failed to fetch prices: ${priceResponse.status}`,
				);
			}

			const data: PriceData = await priceResponse.json();
			setPriceData(data);

			// Fetch 24h volume from OSRS Wiki Prices API (last 24h with 1h timestep)
			try {
				const volumeResponse = await fetch(
					`https://prices.runescape.wiki/api/v1/osrs/timeseries?timestep=1h&id=${itemId}`,
					{
						headers: {
							'User-Agent':
								'KBVE item_tracker - @h0lybyte on Discord',
						},
					},
				);

				if (volumeResponse.ok) {
					const volumeJson = await volumeResponse.json();
					const timeseries = volumeJson.data || [];
					const now = Math.floor(Date.now() / 1000);
					const cutoff24h = now - 24 * 60 * 60;

					// Sum up volume from last 24 hours
					const volume24h = timeseries
						.filter(
							(point: { timestamp: number }) =>
								point.timestamp >= cutoff24h,
						)
						.reduce(
							(
								acc: VolumeData,
								point: {
									highPriceVolume: number | null;
									lowPriceVolume: number | null;
								},
							) => ({
								highPriceVolume:
									acc.highPriceVolume +
									(point.highPriceVolume || 0),
								lowPriceVolume:
									acc.lowPriceVolume +
									(point.lowPriceVolume || 0),
							}),
							{ highPriceVolume: 0, lowPriceVolume: 0 },
						);

					setVolumeData(volume24h);
				}
			} catch {
				// Volume fetch is optional, don't fail the whole widget
				console.warn('Failed to fetch volume data');
			}

			setError(null);
			setLastUpdated(new Date());
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to fetch prices',
			);
		} finally {
			setLoading(false);
		}
	}, [itemId, apiBaseUrl]);

	useEffect(() => {
		fetchPrices();

		// Set up polling if refreshInterval > 0
		if (refreshInterval > 0) {
			const interval = setInterval(fetchPrices, refreshInterval);
			return () => clearInterval(interval);
		}
	}, [fetchPrices, refreshInterval]);

	// Calculate total volume
	const totalVolume = volumeData
		? volumeData.highPriceVolume + volumeData.lowPriceVolume
		: null;

	if (loading) {
		return (
			<div style={{ ...styles.widget, ...styles.widgetLoading }}>
				<div style={styles.loading}>
					<span style={styles.spinner} />
					<span>Loading prices...</span>
				</div>
				<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
			</div>
		);
	}

	if (error) {
		return (
			<div style={{ ...styles.widget, ...styles.widgetLoading }}>
				<div style={styles.error}>
					<span style={styles.errorIcon}>!</span>
					<span>{error}</span>
					<button
						onClick={fetchPrices}
						style={styles.retryBtn}
						type="button">
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (!priceData) {
		return null;
	}

	return (
		<div style={styles.widget}>
			{/* Price Cards - 3 column grid */}
			<div style={styles.mainGrid}>
				{/* Buy Price (High) */}
				<div style={{ ...styles.card, ...styles.cardBuy }}>
					<div style={styles.cardLabel}>Buy Price</div>
					<div style={styles.cardValue}>
						{formatGP(priceData.high)}
						<span style={styles.cardGp}>gp</span>
					</div>
					<div style={styles.cardTime}>
						{formatRelativeTime(priceData.high_time)}
					</div>
				</div>

				{/* Sell Price (Low) */}
				<div style={{ ...styles.card, ...styles.cardSell }}>
					<div style={styles.cardLabel}>Sell Price</div>
					<div style={styles.cardValue}>
						{formatGP(priceData.low)}
						<span style={styles.cardGp}>gp</span>
					</div>
					<div style={styles.cardTime}>
						{formatRelativeTime(priceData.low_time)}
					</div>
				</div>

				{/* Average Price */}
				<div style={{ ...styles.card, ...styles.cardAvg }}>
					<div style={styles.cardLabel}>Average</div>
					<div style={styles.cardValue}>
						{formatGP(priceData.avg)}
						<span style={styles.cardGp}>gp</span>
					</div>
				</div>
			</div>

			{/* 24H Volume Section */}
			{volumeData && (
				<div style={styles.volumeSection}>
					<div style={styles.volumeGrid}>
						<div style={styles.volumeCard}>
							<div style={styles.volumeLabel}>24H Buy Vol</div>
							<div
								style={{
									...styles.volumeValue,
									...styles.volumeValueBuy,
								}}>
								{formatVolume(volumeData.highPriceVolume)}
							</div>
						</div>
						<div style={styles.volumeCard}>
							<div style={styles.volumeLabel}>24H Sell Vol</div>
							<div
								style={{
									...styles.volumeValue,
									...styles.volumeValueSell,
								}}>
								{formatVolume(volumeData.lowPriceVolume)}
							</div>
						</div>
						<div style={styles.volumeCard}>
							<div style={styles.volumeLabel}>24H Total</div>
							<div style={styles.volumeValue}>
								{formatVolume(totalVolume)}
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Footer with last updated time */}
			<div style={styles.footer}>
				<span>Updates every 60s</span>
				{lastUpdated && <span>{lastUpdated.toLocaleTimeString()}</span>}
				<button
					onClick={fetchPrices}
					style={styles.refreshBtn}
					type="button"
					title="Refresh prices">
					↻ Refresh
				</button>
			</div>
		</div>
	);
}

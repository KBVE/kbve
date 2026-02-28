import { useState, useEffect, useCallback, useMemo } from 'react';

interface TimeSeriesPoint {
	timestamp: number;
	avgHighPrice: number | null;
	avgLowPrice: number | null;
	highPriceVolume: number | null;
	lowPriceVolume: number | null;
}

interface OSRSChartsProps {
	itemId: number;
	timeRange?: '6h' | '24h' | '7d' | '30d';
}

type TimeRangeOption = '6h' | '24h' | '7d' | '30d';
type ChartType = 'line' | 'candlestick';

const TIME_RANGE_CONFIG: Record<
	TimeRangeOption,
	{ label: string; timestep: string }
> = {
	'6h': { label: '6H', timestep: '5m' },
	'24h': { label: '24H', timestep: '5m' },
	'7d': { label: '7D', timestep: '1h' },
	'30d': { label: '30D', timestep: '6h' },
};

/**
 * Calculate Simple Moving Average for a data series
 */
function calculateSMA(
	data: TimeSeriesPoint[],
	period: number,
	priceKey: 'avgHighPrice' | 'avgLowPrice',
): { timestamp: number; value: number }[] {
	const result: { timestamp: number; value: number }[] = [];

	for (let i = period - 1; i < data.length; i++) {
		let sum = 0;
		let count = 0;

		for (let j = 0; j < period; j++) {
			const price = data[i - j][priceKey];
			if (price !== null) {
				sum += price;
				count++;
			}
		}

		if (count > 0) {
			result.push({
				timestamp: data[i].timestamp,
				value: sum / count,
			});
		}
	}

	return result;
}

// Common price thresholds for reference lines (in GP)
const PRICE_THRESHOLDS = [
	{ value: 100, label: '100' },
	{ value: 1000, label: '1K' },
	{ value: 10000, label: '10K' },
	{ value: 100000, label: '100K' },
	{ value: 1000000, label: '1M' },
	{ value: 10000000, label: '10M' },
	{ value: 100000000, label: '100M' },
	{ value: 1000000000, label: '1B' },
];

// Styles using Starlight CSS variables - improved for better readability
const styles = {
	container: {
		borderRadius: '0.75rem',
		border: '1px solid var(--sl-color-gray-5)',
		background: 'var(--sl-color-bg-nav)',
		padding: '1.25rem',
		marginTop: '1.5rem',
	} as React.CSSProperties,
	header: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: '1rem',
	} as React.CSSProperties,
	title: {
		fontSize: '1rem',
		fontWeight: 600,
		color: 'var(--sl-color-white)',
		margin: 0,
	} as React.CSSProperties,
	tabs: {
		display: 'flex',
		gap: '0.5rem',
	} as React.CSSProperties,
	tab: {
		padding: '0.5rem 0.875rem',
		fontSize: '0.8125rem',
		fontWeight: 500,
		border: '1px solid var(--sl-color-gray-5)',
		borderRadius: '0.375rem',
		cursor: 'pointer',
		transition: 'all 0.15s ease',
		background: 'var(--sl-color-gray-6)',
		color: 'var(--sl-color-gray-3)',
	} as React.CSSProperties,
	tabActive: {
		background: 'var(--sl-color-accent)',
		borderColor: 'var(--sl-color-accent)',
		color: 'var(--sl-color-black)',
	} as React.CSSProperties,
	chartContainer: {
		position: 'relative' as const,
		height: '320px',
		width: '100%',
	} as React.CSSProperties,
	loading: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		height: '320px',
		color: 'var(--sl-color-gray-3)',
		fontSize: '0.9375rem',
	} as React.CSSProperties,
	error: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		height: '320px',
		color: '#ef4444',
		fontSize: '0.9375rem',
	} as React.CSSProperties,
	legend: {
		display: 'flex',
		justifyContent: 'center',
		gap: '1.5rem',
		marginTop: '1rem',
		fontSize: '0.875rem',
		color: 'var(--sl-color-gray-3)',
	} as React.CSSProperties,
	legendItem: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
	} as React.CSSProperties,
	legendDot: {
		width: '0.625rem',
		height: '0.625rem',
		borderRadius: '50%',
	} as React.CSSProperties,
	noData: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		height: '320px',
		color: 'var(--sl-color-gray-3)',
		fontSize: '0.9375rem',
		fontStyle: 'italic',
	} as React.CSSProperties,
	tooltip: {
		position: 'absolute' as const,
		background: 'var(--sl-color-bg-nav)',
		border: '1px solid var(--sl-color-gray-4)',
		borderRadius: '0.5rem',
		padding: '0.75rem',
		fontSize: '0.875rem',
		color: 'var(--sl-color-white)',
		pointerEvents: 'none' as const,
		zIndex: 10,
		minWidth: '150px',
		boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
	} as React.CSSProperties,
	tooltipRow: {
		display: 'flex',
		justifyContent: 'space-between',
		gap: '0.75rem',
		marginBottom: '0.375rem',
	} as React.CSSProperties,
	tooltipLabel: {
		color: 'var(--sl-color-gray-3)',
	} as React.CSSProperties,
	tooltipValue: {
		fontWeight: 600,
	} as React.CSSProperties,
	tooltipTime: {
		fontSize: '0.75rem',
		color: 'var(--sl-color-gray-3)',
		marginTop: '0.375rem',
		borderTop: '1px solid var(--sl-color-gray-5)',
		paddingTop: '0.375rem',
	} as React.CSSProperties,
	volumeSection: {
		marginTop: '1rem',
		paddingTop: '1rem',
		borderTop: '1px solid var(--sl-color-gray-5)',
	} as React.CSSProperties,
	volumeHeader: {
		fontSize: '0.875rem',
		fontWeight: 500,
		color: 'var(--sl-color-gray-3)',
		marginBottom: '0.5rem',
	} as React.CSSProperties,
	volumeChartContainer: {
		height: '140px',
		width: '100%',
	} as React.CSSProperties,
	controlsRow: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: '0.75rem',
		gap: '1rem',
	} as React.CSSProperties,
	chartTypeToggle: {
		display: 'flex',
		gap: '0.25rem',
		background: 'var(--sl-color-gray-6)',
		padding: '0.25rem',
		borderRadius: '0.375rem',
	} as React.CSSProperties,
	chartTypeBtn: {
		padding: '0.375rem 0.625rem',
		fontSize: '0.75rem',
		fontWeight: 500,
		border: 'none',
		borderRadius: '0.25rem',
		cursor: 'pointer',
		transition: 'all 0.15s ease',
		background: 'transparent',
		color: 'var(--sl-color-gray-3)',
	} as React.CSSProperties,
	chartTypeBtnActive: {
		background: 'var(--sl-color-bg-nav)',
		color: 'var(--sl-color-white)',
		boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
	} as React.CSSProperties,
	trendToggle: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		fontSize: '0.75rem',
		color: 'var(--sl-color-gray-3)',
	} as React.CSSProperties,
	checkbox: {
		accentColor: 'var(--sl-color-accent)',
		width: '14px',
		height: '14px',
		cursor: 'pointer',
	} as React.CSSProperties,
};

/**
 * Format price for display
 */
function formatPrice(price: number): string {
	if (price >= 1000000) return `${(price / 1000000).toFixed(1)}M`;
	if (price >= 1000) return `${(price / 1000).toFixed(0)}K`;
	return price.toFixed(0);
}

/**
 * Format volume for display
 */
function formatVolume(vol: number): string {
	if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
	if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
	return vol.toString();
}

/**
 * Format timestamp to readable time
 */
function formatTime(timestamp: number, timeRange: TimeRangeOption): string {
	const date = new Date(timestamp * 1000);
	if (timeRange === '6h' || timeRange === '24h') {
		return date.toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
		});
	}
	return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface TooltipData {
	x: number;
	y: number;
	point: TimeSeriesPoint;
	index: number;
}

/**
 * Interactive line chart with tooltips and volume bars
 */
function LineChart({
	data,
	width = 700,
	height = 280,
	timeRange,
	chartType = 'line',
	showTrendLine = false,
	hoveredIndex = -1,
	onHover,
}: {
	data: TimeSeriesPoint[];
	width?: number;
	height?: number;
	timeRange: TimeRangeOption;
	chartType?: ChartType;
	showTrendLine?: boolean;
	hoveredIndex?: number;
	onHover?: (tooltip: TooltipData | null) => void;
}) {
	const padding = { top: 15, right: 15, bottom: 35, left: 60 };
	const chartWidth = width - padding.left - padding.right;
	const chartHeight = height - padding.top - padding.bottom;

	// Calculate min/max for scaling
	const { minPrice, maxPrice, minTime, maxTime } = useMemo(() => {
		const prices = data.flatMap(
			(d) => [d.avgHighPrice, d.avgLowPrice].filter(Boolean) as number[],
		);
		const times = data.map((d) => d.timestamp);

		if (prices.length === 0) {
			return { minPrice: 0, maxPrice: 100, minTime: 0, maxTime: 1 };
		}

		const min = Math.min(...prices);
		const max = Math.max(...prices);
		const priceRange = max - min || 1;

		return {
			minPrice: min - priceRange * 0.05,
			maxPrice: max + priceRange * 0.05,
			minTime: Math.min(...times),
			maxTime: Math.max(...times),
		};
	}, [data]);

	// Scale functions
	const xScale = useCallback(
		(timestamp: number) =>
			padding.left +
			((timestamp - minTime) / (maxTime - minTime || 1)) * chartWidth,
		[minTime, maxTime, chartWidth, padding.left],
	);

	const yScale = useCallback(
		(price: number) =>
			padding.top +
			chartHeight -
			((price - minPrice) / (maxPrice - minPrice || 1)) * chartHeight,
		[minPrice, maxPrice, chartHeight, padding.top],
	);

	// Generate path data
	const highPath = useMemo(() => {
		const points = data
			.filter((d) => d.avgHighPrice !== null)
			.map((d) => `${xScale(d.timestamp)},${yScale(d.avgHighPrice!)}`);
		return points.length > 0 ? `M${points.join('L')}` : '';
	}, [data, xScale, yScale]);

	const lowPath = useMemo(() => {
		const points = data
			.filter((d) => d.avgLowPrice !== null)
			.map((d) => `${xScale(d.timestamp)},${yScale(d.avgLowPrice!)}`);
		return points.length > 0 ? `M${points.join('L')}` : '';
	}, [data, xScale, yScale]);

	// Generate Y-axis ticks
	const yTicks = useMemo(() => {
		const tickCount = 6;
		const range = maxPrice - minPrice;
		const step = range / (tickCount - 1);
		return Array.from({ length: tickCount }, (_, i) => minPrice + step * i);
	}, [minPrice, maxPrice]);

	// Get reference lines for common price thresholds that fall within the visible range
	const referenceLines = useMemo(() => {
		return PRICE_THRESHOLDS.filter(
			(threshold) =>
				threshold.value > minPrice && threshold.value < maxPrice,
		);
	}, [minPrice, maxPrice]);

	// Calculate moving averages for trend lines
	const smaPeriod = timeRange === '6h' || timeRange === '24h' ? 7 : 5;
	const smaHigh = useMemo(
		() =>
			showTrendLine ? calculateSMA(data, smaPeriod, 'avgHighPrice') : [],
		[data, smaPeriod, showTrendLine],
	);
	const smaLow = useMemo(
		() =>
			showTrendLine ? calculateSMA(data, smaPeriod, 'avgLowPrice') : [],
		[data, smaPeriod, showTrendLine],
	);

	// Generate SMA path
	const smaHighPath = useMemo(() => {
		if (smaHigh.length === 0) return '';
		const points = smaHigh.map(
			(d) => `${xScale(d.timestamp)},${yScale(d.value)}`,
		);
		return `M${points.join('L')}`;
	}, [smaHigh, xScale, yScale]);

	const smaLowPath = useMemo(() => {
		if (smaLow.length === 0) return '';
		const points = smaLow.map(
			(d) => `${xScale(d.timestamp)},${yScale(d.value)}`,
		);
		return `M${points.join('L')}`;
	}, [smaLow, xScale, yScale]);

	// Calculate candlestick bar width - make them prominent
	const candleWidth = useMemo(() => {
		if (data.length < 2) return 12;
		const avgGap = chartWidth / data.length;
		// Make candles take up 80% of available space, with min 6px and max 20px
		return Math.max(6, Math.min(20, avgGap * 0.8));
	}, [data.length, chartWidth]);

	// Generate X-axis ticks (time labels)
	const xTicks = useMemo(() => {
		const tickCount = 5;
		const step = (maxTime - minTime) / (tickCount - 1);
		return Array.from({ length: tickCount }, (_, i) => minTime + step * i);
	}, [minTime, maxTime]);

	// Handle mouse interactions
	const handleMouseMove = useCallback(
		(e: React.MouseEvent<SVGSVGElement>) => {
			if (!onHover || data.length === 0) return;

			const svg = e.currentTarget;
			const rect = svg.getBoundingClientRect();
			const x = ((e.clientX - rect.left) / rect.width) * width;

			// Find closest data point
			const targetTime =
				minTime +
				((x - padding.left) / chartWidth) * (maxTime - minTime);
			let closest = data[0];
			let closestIndex = 0;
			let closestDist = Math.abs(data[0].timestamp - targetTime);

			for (let i = 0; i < data.length; i++) {
				const dist = Math.abs(data[i].timestamp - targetTime);
				if (dist < closestDist) {
					closestDist = dist;
					closest = data[i];
					closestIndex = i;
				}
			}

			const pointX = xScale(closest.timestamp);
			const pointY =
				closest.avgHighPrice !== null
					? yScale(closest.avgHighPrice)
					: closest.avgLowPrice !== null
						? yScale(closest.avgLowPrice)
						: height / 2;

			onHover({
				x: pointX,
				y: pointY,
				point: closest,
				index: closestIndex,
			});
		},
		[
			onHover,
			data,
			minTime,
			maxTime,
			chartWidth,
			padding.left,
			width,
			xScale,
			yScale,
			height,
		],
	);

	const handleMouseLeave = useCallback(() => {
		if (onHover) onHover(null);
	}, [onHover]);

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}>
			{/* Grid lines - horizontal */}
			{yTicks.map((tick, i) => (
				<line
					key={`h-${i}`}
					x1={padding.left}
					y1={yScale(tick)}
					x2={width - padding.right}
					y2={yScale(tick)}
					stroke="var(--sl-color-gray-5)"
					strokeWidth="1"
					strokeDasharray="4,4"
					opacity="0.4"
				/>
			))}

			{/* Grid lines - vertical */}
			{xTicks.map((tick, i) => (
				<line
					key={`v-${i}`}
					x1={xScale(tick)}
					y1={padding.top}
					x2={xScale(tick)}
					y2={height - padding.bottom}
					stroke="var(--sl-color-gray-5)"
					strokeWidth="1"
					strokeDasharray="4,4"
					opacity="0.3"
				/>
			))}

			{/* Reference lines for common price thresholds */}
			{referenceLines.map((threshold, i) => (
				<g key={`ref-${i}`}>
					<line
						x1={padding.left}
						y1={yScale(threshold.value)}
						x2={width - padding.right}
						y2={yScale(threshold.value)}
						stroke="#f59e0b"
						strokeWidth="1.5"
						strokeDasharray="8,4"
						opacity="0.6"
					/>
					<rect
						x={width - padding.right + 4}
						y={yScale(threshold.value) - 9}
						width={threshold.label.length * 7 + 8}
						height={18}
						fill="var(--sl-color-bg-nav)"
						stroke="#f59e0b"
						strokeWidth="1"
						rx="3"
						opacity="0.9"
					/>
					<text
						x={width - padding.right + 8}
						y={yScale(threshold.value)}
						alignmentBaseline="middle"
						fontSize="11"
						fontWeight="600"
						fill="#f59e0b">
						{threshold.label}
					</text>
				</g>
			))}

			{/* Y-axis labels */}
			{yTicks.map((tick, i) => (
				<text
					key={`y-${i}`}
					x={padding.left - 8}
					y={yScale(tick)}
					textAnchor="end"
					alignmentBaseline="middle"
					fontSize="11"
					fill="var(--sl-color-gray-3)">
					{formatPrice(tick)}
				</text>
			))}

			{/* X-axis labels */}
			{xTicks.map((tick, i) => (
				<text
					key={`x-${i}`}
					x={xScale(tick)}
					y={height - 8}
					textAnchor="middle"
					fontSize="10"
					fill="var(--sl-color-gray-3)">
					{formatTime(tick, timeRange)}
				</text>
			))}

			{/* High price line (buy) with gradient */}
			<defs>
				<linearGradient
					id="highGradient"
					x1="0%"
					y1="0%"
					x2="0%"
					y2="100%">
					<stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
					<stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
				</linearGradient>
				<linearGradient
					id="lowGradient"
					x1="0%"
					y1="0%"
					x2="0%"
					y2="100%">
					<stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
					<stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
				</linearGradient>
			</defs>

			{/* Area fills under the lines */}
			{highPath && (
				<path
					d={`${highPath}L${xScale(data[data.length - 1]?.timestamp || maxTime)},${height - padding.bottom}L${xScale(data[0]?.timestamp || minTime)},${height - padding.bottom}Z`}
					fill="url(#highGradient)"
				/>
			)}

			{/* Candlestick mode */}
			{chartType === 'candlestick' &&
				data.map((d, i) => {
					if (d.avgHighPrice === null && d.avgLowPrice === null)
						return null;

					const x = xScale(d.timestamp);

					// For OSRS: avgHighPrice = buy price (higher), avgLowPrice = sell price (lower)
					const buyPrice = d.avgHighPrice ?? d.avgLowPrice ?? 0;
					const sellPrice = d.avgLowPrice ?? d.avgHighPrice ?? 0;

					// Get previous prices to determine trend
					const prevData = i > 0 ? data[i - 1] : null;
					const prevBuy =
						prevData?.avgHighPrice ??
						prevData?.avgLowPrice ??
						buyPrice;

					// Trend is based on whether the buy price went up or down
					const isUp = buyPrice >= prevBuy;

					// Candle structure:
					// - Wick shows the full range (buy to sell spread)
					// - Body shows the price movement (prev buy to current buy)
					const wickTop = yScale(buyPrice);
					const wickBottom = yScale(sellPrice);

					// Body shows price change from previous period
					const bodyOpen = yScale(prevBuy);
					const bodyClose = yScale(buyPrice);
					const bodyTop = Math.min(bodyOpen, bodyClose);
					const bodyHeight = Math.max(
						3,
						Math.abs(bodyClose - bodyOpen),
					);

					// Colors
					const fillColor = isUp ? '#22c55e' : '#ef4444';
					const strokeColor = isUp ? '#15803d' : '#b91c1c';
					const wickColor = isUp ? '#16a34a' : '#dc2626';

					return (
						<g key={`candle-${i}`}>
							{/* Upper wick */}
							<line
								x1={x}
								y1={wickTop}
								x2={x}
								y2={bodyTop}
								stroke={wickColor}
								strokeWidth="2"
							/>
							{/* Lower wick */}
							<line
								x1={x}
								y1={bodyTop + bodyHeight}
								x2={x}
								y2={wickBottom}
								stroke={wickColor}
								strokeWidth="2"
							/>
							{/* Body */}
							<rect
								x={x - candleWidth / 2}
								y={bodyTop}
								width={candleWidth}
								height={bodyHeight}
								fill={fillColor}
								stroke={strokeColor}
								strokeWidth="1.5"
								rx="2"
							/>
							{/* Highlight on up candles for better visibility */}
							{isUp && (
								<rect
									x={x - candleWidth / 2 + 2}
									y={bodyTop + 2}
									width={Math.max(0, candleWidth - 6)}
									height={Math.max(0, bodyHeight - 4)}
									fill="rgba(255,255,255,0.15)"
									rx="1"
								/>
							)}
						</g>
					);
				})}

			{/* Line mode - High price line */}
			{chartType === 'line' && (
				<path
					d={highPath}
					fill="none"
					stroke="#ef4444"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			)}

			{/* Line mode - Low price line */}
			{chartType === 'line' && (
				<path
					d={lowPath}
					fill="none"
					stroke="#22c55e"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			)}

			{/* Trend lines (SMA) */}
			{showTrendLine && smaHighPath && (
				<path
					d={smaHighPath}
					fill="none"
					stroke="#f97316"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeDasharray="6,3"
					opacity="0.8"
				/>
			)}
			{showTrendLine && smaLowPath && (
				<path
					d={smaLowPath}
					fill="none"
					stroke="#8b5cf6"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeDasharray="6,3"
					opacity="0.8"
				/>
			)}

			{/* Data points - dots on lines for better visibility (line mode only) */}
			{chartType === 'line' &&
				data
					.filter(
						(_, i) =>
							i % Math.max(1, Math.floor(data.length / 15)) === 0,
					)
					.map((d, i) => (
						<g key={i}>
							{d.avgHighPrice !== null && (
								<circle
									cx={xScale(d.timestamp)}
									cy={yScale(d.avgHighPrice)}
									r="4"
									fill="#ef4444"
									stroke="var(--sl-color-bg-nav)"
									strokeWidth="2"
								/>
							)}
							{d.avgLowPrice !== null && (
								<circle
									cx={xScale(d.timestamp)}
									cy={yScale(d.avgLowPrice)}
									r="4"
									fill="#22c55e"
									stroke="var(--sl-color-bg-nav)"
									strokeWidth="2"
								/>
							)}
						</g>
					))}

			{/* Hover indicator - vertical line and highlight */}
			{hoveredIndex >= 0 &&
				hoveredIndex < data.length &&
				(() => {
					const d = data[hoveredIndex];
					const hoverX = xScale(d.timestamp);
					const highY =
						d.avgHighPrice !== null ? yScale(d.avgHighPrice) : null;
					const lowY =
						d.avgLowPrice !== null ? yScale(d.avgLowPrice) : null;

					return (
						<g>
							{/* Vertical crosshair line */}
							<line
								x1={hoverX}
								y1={padding.top}
								x2={hoverX}
								y2={height - padding.bottom}
								stroke="var(--sl-color-accent)"
								strokeWidth="1"
								strokeDasharray="4,2"
								opacity="0.7"
							/>
							{/* Highlight dots on data points */}
							{highY !== null && (
								<circle
									cx={hoverX}
									cy={highY}
									r="6"
									fill="#ef4444"
									stroke="white"
									strokeWidth="2"
									style={{
										filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.5))',
									}}
								/>
							)}
							{lowY !== null && (
								<circle
									cx={hoverX}
									cy={lowY}
									r="6"
									fill="#22c55e"
									stroke="white"
									strokeWidth="2"
									style={{
										filter: 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.5))',
									}}
								/>
							)}
							{/* Horizontal price lines */}
							{highY !== null && (
								<line
									x1={padding.left}
									y1={highY}
									x2={width - padding.right}
									y2={highY}
									stroke="#ef4444"
									strokeWidth="1"
									strokeDasharray="2,2"
									opacity="0.4"
								/>
							)}
							{lowY !== null && (
								<line
									x1={padding.left}
									y1={lowY}
									x2={width - padding.right}
									y2={lowY}
									stroke="#22c55e"
									strokeWidth="1"
									strokeDasharray="2,2"
									opacity="0.4"
								/>
							)}
						</g>
					);
				})()}
		</svg>
	);
}

/**
 * Volume bar chart
 */
function VolumeChart({
	data,
	width = 700,
	height = 130,
}: {
	data: TimeSeriesPoint[];
	width?: number;
	height?: number;
}) {
	const padding = { top: 10, right: 15, bottom: 10, left: 60 };
	const chartWidth = width - padding.left - padding.right;
	const chartHeight = height - padding.top - padding.bottom;

	const { maxVolume, minTime, maxTime } = useMemo(() => {
		const volumes = data.map(
			(d) => (d.highPriceVolume || 0) + (d.lowPriceVolume || 0),
		);
		const times = data.map((d) => d.timestamp);

		return {
			maxVolume: Math.max(...volumes, 1),
			minTime: Math.min(...times),
			maxTime: Math.max(...times),
		};
	}, [data]);

	const barWidth = Math.max(1, chartWidth / data.length - 1);

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			style={{ width: '100%', height: '100%' }}>
			{data.map((d, i) => {
				const totalVol =
					(d.highPriceVolume || 0) + (d.lowPriceVolume || 0);
				const barHeight = (totalVol / maxVolume) * chartHeight;
				const x =
					padding.left +
					((d.timestamp - minTime) / (maxTime - minTime || 1)) *
						chartWidth;

				return (
					<rect
						key={i}
						x={x - barWidth / 2}
						y={chartHeight - barHeight + padding.top}
						width={barWidth}
						height={barHeight}
						fill="var(--sl-color-accent)"
						opacity="0.5"
						rx="1"
					/>
				);
			})}
		</svg>
	);
}

export default function OSRSCharts({
	itemId,
	timeRange: initialTimeRange = '24h',
}: OSRSChartsProps) {
	const [timeRange, setTimeRange] =
		useState<TimeRangeOption>(initialTimeRange);
	const [chartType, setChartType] = useState<ChartType>('line');
	const [showTrendLine, setShowTrendLine] = useState(false);
	const [data, setData] = useState<TimeSeriesPoint[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [tooltip, setTooltip] = useState<TooltipData | null>(null);

	const fetchData = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const config = TIME_RANGE_CONFIG[timeRange];
			// Using OSRS Wiki Prices API for time series data
			const response = await fetch(
				`https://prices.runescape.wiki/api/v1/osrs/timeseries?timestep=${config.timestep}&id=${itemId}`,
				{
					headers: {
						'User-Agent':
							'KBVE item_tracker - @h0lybyte on Discord',
					},
				},
			);

			if (!response.ok) {
				throw new Error(
					`Failed to fetch price history: ${response.status}`,
				);
			}

			const json = await response.json();
			const timeseries: TimeSeriesPoint[] = json.data || [];

			// Filter based on time range
			const now = Math.floor(Date.now() / 1000);
			const cutoff = {
				'6h': now - 6 * 60 * 60,
				'24h': now - 24 * 60 * 60,
				'7d': now - 7 * 24 * 60 * 60,
				'30d': now - 30 * 24 * 60 * 60,
			}[timeRange];

			const filtered = timeseries.filter(
				(point) => point.timestamp >= cutoff,
			);
			setData(filtered);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: 'Failed to fetch price history',
			);
		} finally {
			setLoading(false);
		}
	}, [itemId, timeRange]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// Calculate tooltip position (keep it inside bounds)
	const tooltipStyle = useMemo(() => {
		if (!tooltip) return {};
		return {
			...styles.tooltip,
			left: Math.min(tooltip.x + 15, 500),
			top: Math.max(tooltip.y - 100, 10),
		};
	}, [tooltip]);

	return (
		<div style={styles.container}>
			{/* Header with title and time range tabs */}
			<div style={styles.header}>
				<h4 style={styles.title}>Price History</h4>
				<div style={styles.tabs}>
					{(Object.keys(TIME_RANGE_CONFIG) as TimeRangeOption[]).map(
						(range) => (
							<button
								key={range}
								type="button"
								style={{
									...styles.tab,
									...(timeRange === range
										? styles.tabActive
										: {}),
								}}
								onClick={() => setTimeRange(range)}>
								{TIME_RANGE_CONFIG[range].label}
							</button>
						),
					)}
				</div>
			</div>

			{/* Chart controls row */}
			<div style={styles.controlsRow}>
				{/* Chart type toggle */}
				<div style={styles.chartTypeToggle}>
					<button
						type="button"
						style={{
							...styles.chartTypeBtn,
							...(chartType === 'line'
								? styles.chartTypeBtnActive
								: {}),
						}}
						onClick={() => setChartType('line')}>
						Line
					</button>
					<button
						type="button"
						style={{
							...styles.chartTypeBtn,
							...(chartType === 'candlestick'
								? styles.chartTypeBtnActive
								: {}),
						}}
						onClick={() => setChartType('candlestick')}>
						Candle
					</button>
				</div>

				{/* Trend line toggle */}
				<label style={styles.trendToggle}>
					<input
						type="checkbox"
						checked={showTrendLine}
						onChange={(e) => setShowTrendLine(e.target.checked)}
						style={styles.checkbox}
					/>
					Show Trend (SMA)
				</label>
			</div>

			{/* Chart area */}
			<div style={styles.chartContainer}>
				{loading ? (
					<div style={styles.loading}>Loading price history...</div>
				) : error ? (
					<div style={styles.error}>{error}</div>
				) : data.length === 0 ? (
					<div style={styles.noData}>
						No price data available for this time range
					</div>
				) : (
					<>
						<LineChart
							data={data}
							timeRange={timeRange}
							chartType={chartType}
							showTrendLine={showTrendLine}
							hoveredIndex={tooltip?.index ?? -1}
							onHover={setTooltip}
						/>
						{/* Tooltip */}
						{tooltip && (
							<div style={tooltipStyle}>
								<div style={styles.tooltipRow}>
									<span
										style={{
											...styles.tooltipLabel,
											color: '#ef4444',
										}}>
										Buy:
									</span>
									<span
										style={{
											...styles.tooltipValue,
											color: '#ef4444',
										}}>
										{tooltip.point.avgHighPrice !== null
											? `${formatPrice(tooltip.point.avgHighPrice)} gp`
											: '—'}
									</span>
								</div>
								<div style={styles.tooltipRow}>
									<span
										style={{
											...styles.tooltipLabel,
											color: '#22c55e',
										}}>
										Sell:
									</span>
									<span
										style={{
											...styles.tooltipValue,
											color: '#22c55e',
										}}>
										{tooltip.point.avgLowPrice !== null
											? `${formatPrice(tooltip.point.avgLowPrice)} gp`
											: '—'}
									</span>
								</div>
								<div style={styles.tooltipRow}>
									<span style={styles.tooltipLabel}>
										Volume:
									</span>
									<span style={styles.tooltipValue}>
										{formatVolume(
											(tooltip.point.highPriceVolume ||
												0) +
												(tooltip.point.lowPriceVolume ||
													0),
										)}
									</span>
								</div>
								<div style={styles.tooltipTime}>
									{formatTime(
										tooltip.point.timestamp,
										timeRange,
									)}
								</div>
							</div>
						)}
					</>
				)}
			</div>

			{/* Legend */}
			{!loading && !error && data.length > 0 && (
				<div style={styles.legend}>
					<div style={styles.legendItem}>
						<span
							style={{
								...styles.legendDot,
								background: '#ef4444',
							}}
						/>
						<span>Buy Price</span>
					</div>
					<div style={styles.legendItem}>
						<span
							style={{
								...styles.legendDot,
								background: '#22c55e',
							}}
						/>
						<span>Sell Price</span>
					</div>
					{showTrendLine && (
						<>
							<div style={styles.legendItem}>
								<span
									style={{
										...styles.legendDot,
										background: '#f97316',
										borderRadius: '2px',
									}}
								/>
								<span>Buy SMA</span>
							</div>
							<div style={styles.legendItem}>
								<span
									style={{
										...styles.legendDot,
										background: '#8b5cf6',
										borderRadius: '2px',
									}}
								/>
								<span>Sell SMA</span>
							</div>
						</>
					)}
				</div>
			)}

			{/* Volume chart section */}
			{!loading && !error && data.length > 0 && (
				<div style={styles.volumeSection}>
					<div style={styles.volumeHeader}>Volume</div>
					<div style={styles.volumeChartContainer}>
						<VolumeChart data={data} />
					</div>
				</div>
			)}
		</div>
	);
}

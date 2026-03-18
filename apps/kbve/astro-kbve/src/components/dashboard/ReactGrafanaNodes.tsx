import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	grafanaService,
	formatBytes,
	getThresholdColor,
	RESOURCE_THRESHOLDS,
	type TrendInfo,
	type SparklinePoint,
	type PerNodeMetric,
} from './grafanaService';
import {
	Cpu,
	HardDrive,
	Network,
	Server,
	Database,
	Activity,
	TrendingUp,
	TrendingDown,
	Loader2,
	X,
} from 'lucide-react';
import {
	AreaChart,
	Area,
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Chart helpers
// ---------------------------------------------------------------------------

const tickFormatter = (t: number) =>
	new Date(t * 1000).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
	});

const tooltipLabelFormatter = (t: number) =>
	new Date(t * 1000).toLocaleString();

const tooltipStyle = {
	background: 'var(--sl-color-bg-nav, #111)',
	border: '1px solid var(--sl-color-gray-5, #262626)',
	borderRadius: '8px',
	color: 'var(--sl-color-text, #e6edf3)',
};

const axisStroke = 'var(--sl-color-gray-3, #8b949e)';
const gridStroke = 'var(--sl-color-gray-5, #262626)';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TrendIndicator({
	trend,
	invertColors,
}: {
	trend: TrendInfo;
	invertColors?: boolean;
}) {
	if (trend.percentChange == null) return null;

	const isUp = trend.direction === 'up';
	const isDown = trend.direction === 'down';

	let color: string;
	if (invertColors) {
		color = isUp ? '#ef4444' : isDown ? '#22c55e' : '#8b949e';
	} else {
		color = isUp ? '#22c55e' : isDown ? '#ef4444' : '#8b949e';
	}

	const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Activity;
	const sign = isUp ? '+' : '';

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
			<Icon size={12} style={{ color }} />
			<span style={{ color, fontSize: '0.75rem', fontWeight: 500 }}>
				{sign}
				{trend.percentChange.toFixed(1)}%
			</span>
		</div>
	);
}

function SparklineChart({
	data,
	color,
}: {
	data: SparklinePoint[];
	color: string;
}) {
	if (data.length < 2) return null;
	return (
		<div style={{ width: '100%', height: 36, marginTop: 'auto' }}>
			<ResponsiveContainer width="100%" height={36}>
				<LineChart data={data}>
					<Line
						type="monotone"
						dataKey="v"
						stroke={color}
						strokeWidth={1.5}
						dot={false}
						isAnimationActive={false}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}

function EnhancedStatCard({
	icon,
	label,
	value,
	unit,
	displayValue,
	trend,
	sparkline,
	thresholds,
	invertTrend,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	value: number | null;
	unit?: string;
	displayValue?: string;
	trend?: TrendInfo;
	sparkline?: SparklinePoint[];
	thresholds?: { warn: number; crit: number };
	invertTrend?: boolean;
	onClick?: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	const hasThreshold = thresholds && value != null;
	const thresholdColor = hasThreshold
		? getThresholdColor(value, thresholds)
		: undefined;
	const valueColor = thresholdColor ?? 'var(--sl-color-text, #e6edf3)';
	const sparkColor = thresholdColor ?? '#06b6d4';
	const accentColor = thresholdColor ?? 'var(--sl-color-accent, #06b6d4)';

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'flex-start',
				gap: '0.5rem',
				padding: '1rem 1.25rem',
				borderRadius: '10px',
				border: '1px solid var(--sl-color-gray-5, #262626)',
				background: 'var(--sl-color-bg-nav, #111)',
				transition:
					'border-color 0.2s, transform 0.15s, box-shadow 0.15s',
				minHeight: 120,
				cursor: onClick ? 'pointer' : 'default',
				borderTop: `2px solid ${accentColor}`,
				borderColor:
					hovered && onClick
						? 'var(--sl-color-gray-4, #6b7280)'
						: undefined,
				transform: hovered && onClick ? 'translateY(-2px)' : undefined,
				boxShadow:
					hovered && onClick
						? '0 4px 12px rgba(0,0,0,0.3)'
						: undefined,
			}}
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
					width: '100%',
				}}>
				<span style={{ color: accentColor }}>{icon}</span>
				<span
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.75rem',
						fontWeight: 500,
						textTransform: 'uppercase' as const,
						letterSpacing: '0.06em',
					}}>
					{label}
				</span>
			</div>
			<div
				style={{
					fontSize: '1.75rem',
					fontWeight: 700,
					color: valueColor,
					fontVariantNumeric: 'tabular-nums',
					whiteSpace: 'nowrap' as const,
				}}>
				{displayValue
					? displayValue
					: value != null
						? `${Number.isInteger(value) ? value : value.toFixed(1)}${unit || ''}`
						: '--'}
			</div>
			{trend && (
				<TrendIndicator trend={trend} invertColors={invertTrend} />
			)}
			{sparkline && (
				<SparklineChart data={sparkline} color={sparkColor} />
			)}
		</div>
	);
}

function PerNodeTable({
	data,
	metric,
}: {
	data: PerNodeMetric[];
	metric: 'cpu' | 'memory' | 'disk';
}) {
	const sorted = [...data].sort(
		(a, b) => (b[metric] ?? 0) - (a[metric] ?? 0),
	);

	return (
		<div
			style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
			{sorted.map((node) => {
				const val = node[metric];
				const pct = val ?? 0;
				const color = getThresholdColor(pct, RESOURCE_THRESHOLDS);
				return (
					<div
						key={node.instance}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '0.75rem',
						}}>
						<span
							style={{
								color: 'var(--sl-color-gray-3, #8b949e)',
								fontSize: '0.8rem',
								minWidth: '120px',
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}>
							{node.instance.replace(/:.*$/, '')}
						</span>
						<div
							style={{
								flex: 1,
								height: '8px',
								borderRadius: '4px',
								background: 'var(--sl-color-gray-6, #1c1c1c)',
								overflow: 'hidden',
							}}>
							<div
								style={{
									height: '100%',
									borderRadius: '4px',
									width: `${Math.min(pct, 100)}%`,
									background: color,
									transition: 'width 0.3s ease',
								}}
							/>
						</div>
						<span
							style={{
								fontSize: '0.8rem',
								fontWeight: 600,
								fontVariantNumeric: 'tabular-nums',
								minWidth: '48px',
								textAlign: 'right' as const,
								color,
							}}>
							{val != null ? `${val.toFixed(1)}%` : '--'}
						</span>
					</div>
				);
			})}
			{sorted.length === 0 && (
				<span
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						margin: 0,
					}}>
					No data available
				</span>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function ReactGrafanaNodes() {
	const snapshot = useStore(grafanaService.$snapshot);
	const timeSeries = useStore(grafanaService.$timeSeries);
	const networkTimeSeries = useStore(grafanaService.$networkTimeSeries);
	const diskTimeSeries = useStore(grafanaService.$diskTimeSeries);
	const trends = useStore(grafanaService.$trends);
	const sparklines = useStore(grafanaService.$sparklines);
	const expandedCard = useStore(grafanaService.$expandedCard);
	const perNodeMetrics = useStore(grafanaService.$perNodeMetrics);
	const drillDownLoading = useStore(grafanaService.$drillDownLoading);
	const timeRange = useStore(grafanaService.$timeRange);

	return (
		<section>
			<h2
				style={{
					color: 'var(--sl-color-text, #e6edf3)',
					margin: '0 0 1rem 0',
					fontSize: '1.3rem',
					fontWeight: 600,
					paddingBottom: '0.5rem',
					borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
				}}>
				Nodes
			</h2>

			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
					gap: '0.75rem',
				}}>
				<EnhancedStatCard
					icon={<Cpu size={20} />}
					label="CPU Usage"
					value={snapshot.cpu}
					unit="%"
					thresholds={RESOURCE_THRESHOLDS}
					trend={trends.cpu}
					invertTrend
					sparkline={sparklines.cpu}
					onClick={() => grafanaService.toggleCard('cpu')}
				/>
				<EnhancedStatCard
					icon={<HardDrive size={20} />}
					label="Memory"
					value={snapshot.memory}
					unit="%"
					thresholds={RESOURCE_THRESHOLDS}
					trend={trends.memory}
					invertTrend
					sparkline={sparklines.memory}
					onClick={() => grafanaService.toggleCard('memory')}
				/>
				<EnhancedStatCard
					icon={<HardDrive size={20} />}
					label="Disk"
					value={snapshot.disk}
					unit="%"
					thresholds={RESOURCE_THRESHOLDS}
					trend={trends.disk}
					invertTrend
					sparkline={sparklines.disk}
					onClick={() => grafanaService.toggleCard('disk')}
				/>
				<EnhancedStatCard
					icon={<Network size={20} />}
					label="Net RX"
					value={snapshot.networkRx}
					displayValue={formatBytes(snapshot.networkRx)}
				/>
				<EnhancedStatCard
					icon={<Network size={20} />}
					label="Net TX"
					value={snapshot.networkTx}
					displayValue={formatBytes(snapshot.networkTx)}
				/>
				<EnhancedStatCard
					icon={<Server size={20} />}
					label="Nodes"
					value={snapshot.nodes}
				/>
				<EnhancedStatCard
					icon={<Database size={20} />}
					label="PVC Usage"
					value={snapshot.pvcUsage}
					unit="%"
					thresholds={RESOURCE_THRESHOLDS}
				/>
			</div>

			{/* Drill-down panel */}
			{(expandedCard === 'cpu' ||
				expandedCard === 'memory' ||
				expandedCard === 'disk') && (
				<div
					style={{
						padding: '1.25rem',
						borderRadius: '12px',
						border: '1px solid var(--sl-color-gray-5, #262626)',
						background: 'var(--sl-color-bg-nav, #111)',
						marginTop: '1rem',
					}}>
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							marginBottom: '1rem',
						}}>
						<h3
							style={{
								color: 'var(--sl-color-text, #e6edf3)',
								margin: 0,
								fontSize: '1rem',
								fontWeight: 600,
							}}>
							Per-Node{' '}
							{expandedCard.charAt(0).toUpperCase() +
								expandedCard.slice(1)}{' '}
							Breakdown
						</h3>
						<button
							onClick={() =>
								grafanaService.$expandedCard.set(null)
							}
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: '28px',
								height: '28px',
								borderRadius: '6px',
								border: '1px solid var(--sl-color-gray-5, #262626)',
								background: 'transparent',
								color: 'var(--sl-color-gray-3, #8b949e)',
								cursor: 'pointer',
							}}>
							<X size={16} />
						</button>
					</div>
					{drillDownLoading ? (
						<div
							style={{
								display: 'flex',
								justifyContent: 'center',
								padding: '1rem',
							}}>
							<Loader2
								size={20}
								style={{
									animation: 'spin 1s linear infinite',
								}}
							/>
						</div>
					) : (
						<PerNodeTable
							data={perNodeMetrics}
							metric={expandedCard}
						/>
					)}
				</div>
			)}

			{/* CPU & Memory chart */}
			{timeSeries.length > 0 && (
				<div
					style={{
						padding: '1.5rem',
						borderRadius: '12px',
						border: '1px solid var(--sl-color-gray-5, #262626)',
						background: 'var(--sl-color-bg-nav, #111)',
						marginTop: '1rem',
					}}>
					<h3
						style={{
							color: 'var(--sl-color-text, #e6edf3)',
							margin: '0 0 1rem 0',
							fontSize: '1.1rem',
							fontWeight: 600,
						}}>
						CPU & Memory ({timeRange})
					</h3>
					<ResponsiveContainer width="100%" height={300}>
						<AreaChart data={timeSeries}>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke={gridStroke}
							/>
							<XAxis
								dataKey="timestamp"
								tickFormatter={tickFormatter}
								stroke={axisStroke}
								fontSize={12}
							/>
							<YAxis
								unit="%"
								domain={[0, 100]}
								stroke={axisStroke}
								fontSize={12}
							/>
							<Tooltip
								contentStyle={tooltipStyle}
								labelFormatter={tooltipLabelFormatter}
							/>
							<Area
								type="monotone"
								dataKey="cpu"
								stroke="#06b6d4"
								fill="rgba(6,182,212,0.15)"
								name="CPU %"
								strokeWidth={2}
							/>
							<Area
								type="monotone"
								dataKey="memory"
								stroke="#8b5cf6"
								fill="rgba(139,92,246,0.15)"
								name="Memory %"
								strokeWidth={2}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			)}

			{/* Network Traffic chart */}
			{networkTimeSeries.length > 0 && (
				<div
					style={{
						padding: '1.5rem',
						borderRadius: '12px',
						border: '1px solid var(--sl-color-gray-5, #262626)',
						background: 'var(--sl-color-bg-nav, #111)',
						marginTop: '1rem',
					}}>
					<h3
						style={{
							color: 'var(--sl-color-text, #e6edf3)',
							margin: '0 0 1rem 0',
							fontSize: '1.1rem',
							fontWeight: 600,
						}}>
						Network Traffic ({timeRange})
					</h3>
					<ResponsiveContainer width="100%" height={250}>
						<AreaChart data={networkTimeSeries}>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke={gridStroke}
							/>
							<XAxis
								dataKey="timestamp"
								tickFormatter={tickFormatter}
								stroke={axisStroke}
								fontSize={12}
							/>
							<YAxis
								tickFormatter={(v: number) =>
									formatBytes(v).replace('/s', '')
								}
								stroke={axisStroke}
								fontSize={12}
							/>
							<Tooltip
								contentStyle={tooltipStyle}
								labelFormatter={tooltipLabelFormatter}
								formatter={(v: number) => formatBytes(v)}
							/>
							<Area
								type="monotone"
								dataKey="rx"
								stroke="#06b6d4"
								fill="rgba(6,182,212,0.15)"
								name="RX"
								strokeWidth={2}
							/>
							<Area
								type="monotone"
								dataKey="tx"
								stroke="#8b5cf6"
								fill="rgba(139,92,246,0.15)"
								name="TX"
								strokeWidth={2}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			)}

			{/* Disk Usage chart */}
			{diskTimeSeries.length > 0 && (
				<div
					style={{
						padding: '1.5rem',
						borderRadius: '12px',
						border: '1px solid var(--sl-color-gray-5, #262626)',
						background: 'var(--sl-color-bg-nav, #111)',
						marginTop: '1rem',
					}}>
					<h3
						style={{
							color: 'var(--sl-color-text, #e6edf3)',
							margin: '0 0 1rem 0',
							fontSize: '1.1rem',
							fontWeight: 600,
						}}>
						Disk Usage ({timeRange})
					</h3>
					<ResponsiveContainer width="100%" height={250}>
						<AreaChart data={diskTimeSeries}>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke={gridStroke}
							/>
							<XAxis
								dataKey="timestamp"
								tickFormatter={tickFormatter}
								stroke={axisStroke}
								fontSize={12}
							/>
							<YAxis
								unit="%"
								domain={[0, 100]}
								stroke={axisStroke}
								fontSize={12}
							/>
							<Tooltip
								contentStyle={tooltipStyle}
								labelFormatter={tooltipLabelFormatter}
							/>
							<Area
								type="monotone"
								dataKey="disk"
								stroke="#f59e0b"
								fill="rgba(245,158,11,0.15)"
								name="Disk %"
								strokeWidth={2}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			)}
		</section>
	);
}

import React from 'react';
import { useStore } from '@nanostores/react';
import {
	grafanaService,
	type TrendInfo,
	type SparklinePoint,
	type NamespacePodCount,
} from './grafanaService';
import {
	Activity,
	Clock,
	AlertTriangle,
	Box,
	RotateCcw,
	Layers,
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

// Skeleton keeps the chart container height reserved while the first
// range query is in flight, preventing the late-arriving pods chart
// from pushing siblings down on cold load.
function ChartSkeleton({ height }: { height: number }) {
	return (
		<div
			aria-hidden
			style={{
				width: '100%',
				height,
				borderRadius: '8px',
				background:
					'repeating-linear-gradient(90deg, var(--sl-color-gray-6, #1c1c1c) 0 24px, var(--sl-color-gray-5, #262626) 24px 48px)',
				opacity: 0.5,
			}}
		/>
	);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TrendIndicator({ trend }: { trend: TrendInfo }) {
	if (trend.percentChange == null) return null;

	const isUp = trend.direction === 'up';
	const isDown = trend.direction === 'down';
	const color = isUp ? '#22c55e' : isDown ? '#ef4444' : '#8b949e';
	const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Activity;
	const sign = isUp ? '+' : '';

	return (
		<span className="kbve-stat-card__trend" style={{ color }}>
			<Icon size={11} style={{ color }} />
			<span style={{ color, fontSize: '0.7rem', fontWeight: 500 }}>
				{sign}
				{trend.percentChange.toFixed(1)}%
			</span>
		</span>
	);
}

function SparklineBg({
	data,
	color,
}: {
	data?: SparklinePoint[];
	color: string;
}) {
	if (!data || data.length < 2) return null;
	return (
		<div className="kbve-stat-card__spark">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart
					data={data}
					margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
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

function StatCard({
	icon,
	label,
	value,
	trend,
	sparkline,
	onClick,
	tip,
}: {
	icon: React.ReactNode;
	label: string;
	value: number | null;
	trend?: TrendInfo;
	sparkline?: SparklinePoint[];
	onClick?: () => void;
	tip?: string;
}) {
	const accentColor = 'var(--sl-color-accent, #06b6d4)';
	const valueText =
		value != null
			? Number.isInteger(value)
				? value
				: value.toFixed(1)
			: '--';
	return (
		<div
			className={`kbve-stat-card${onClick ? ' is-clickable' : ''}`}
			style={{ borderTopColor: accentColor }}
			onClick={onClick}
			data-tip={tip}>
			<div className="kbve-stat-card__header">
				<span style={{ color: accentColor }}>{icon}</span>
				<span>{label}</span>
			</div>
			<div className="kbve-stat-card__value">
				{valueText}
				{trend && <TrendIndicator trend={trend} />}
			</div>
			<SparklineBg data={sparkline} color={accentColor} />
		</div>
	);
}

function NamespaceBreakdown({ data }: { data: NamespacePodCount[] }) {
	const maxCount = Math.max(...data.map((d) => d.count), 1);

	return (
		<div
			style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
			{data.map((ns) => (
				<div
					key={ns.namespace}
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
						{ns.namespace}
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
								width: `${(ns.count / maxCount) * 100}%`,
								background: '#06b6d4',
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
							color: 'var(--sl-color-text, #e6edf3)',
						}}>
						{ns.count}
					</span>
				</div>
			))}
			{data.length === 0 && (
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

export default function ReactGrafanaK8s() {
	const snapshot = useStore(grafanaService.$snapshot);
	const k8sTimeSeries = useStore(grafanaService.$k8sTimeSeries);
	const trends = useStore(grafanaService.$trends);
	const sparklines = useStore(grafanaService.$sparklines);
	const expandedCard = useStore(grafanaService.$expandedCard);
	const namespacePods = useStore(grafanaService.$namespacePods);
	const drillDownLoading = useStore(grafanaService.$drillDownLoading);
	const timeRange = useStore(grafanaService.$timeRange);

	return (
		<>
			<div className="kbve-card-grid">
				<StatCard
					icon={<Activity size={16} />}
					label="Running Pods"
					value={snapshot.pods}
					trend={trends.pods}
					sparkline={sparklines.pods}
					onClick={() => grafanaService.toggleCard('pods')}
					tip="Pods currently in Running phase. Click for namespace breakdown."
				/>
				<StatCard
					icon={<Clock size={16} />}
					label="Pending Pods"
					value={snapshot.pendingPods}
					tip="Pods in Pending phase — likely waiting on scheduling or images."
				/>
				<StatCard
					icon={<AlertTriangle size={16} />}
					label="Failed Pods"
					value={snapshot.failedPods}
					tip="Pods in Failed phase — non-zero exit + restartPolicy=Never."
				/>
				<StatCard
					icon={<Box size={16} />}
					label="Containers"
					value={snapshot.containers}
					trend={trends.containers}
					tip="Container instances running across all pods."
				/>
				<StatCard
					icon={<RotateCcw size={16} />}
					label={`Restarts (${timeRange})`}
					value={snapshot.podRestarts}
					tip="Container restart count over the selected window."
				/>
				<StatCard
					icon={<Layers size={16} />}
					label="Deployments"
					value={snapshot.deployments}
					trend={trends.deployments}
					tip="Total Deployment objects across all namespaces."
				/>
			</div>

			{/* Pod namespace drill-down */}
			{expandedCard === 'pods' && (
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
							Pods by Namespace
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
						<NamespaceBreakdown data={namespacePods} />
					)}
				</div>
			)}

			{/* Running Pods chart */}
			<div
				className="kbve-chart-panel"
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
					Running Pods ({timeRange})
				</h3>
				{k8sTimeSeries.length > 0 ? (
					<ResponsiveContainer width="100%" height={250}>
						<AreaChart data={k8sTimeSeries}>
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
							<YAxis stroke={axisStroke} fontSize={12} />
							<Tooltip
								contentStyle={tooltipStyle}
								labelFormatter={tooltipLabelFormatter}
							/>
							<Area
								type="monotone"
								dataKey="pods"
								stroke="#10b981"
								fill="rgba(16,185,129,0.15)"
								name="Pods"
								strokeWidth={2}
							/>
						</AreaChart>
					</ResponsiveContainer>
				) : (
					<ChartSkeleton height={250} />
				)}
			</div>
		</>
	);
}

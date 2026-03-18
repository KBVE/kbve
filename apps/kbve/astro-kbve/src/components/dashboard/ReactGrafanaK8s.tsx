import React, { useState } from 'react';
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

function StatCard({
	icon,
	label,
	value,
	trend,
	sparkline,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	value: number | null;
	trend?: TrendInfo;
	sparkline?: SparklinePoint[];
	onClick?: () => void;
}) {
	const [hovered, setHovered] = useState(false);

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
				borderTop: '2px solid var(--sl-color-accent, #06b6d4)',
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
				<span style={{ color: 'var(--sl-color-accent, #06b6d4)' }}>
					{icon}
				</span>
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
					color: 'var(--sl-color-text, #e6edf3)',
					fontVariantNumeric: 'tabular-nums',
					whiteSpace: 'nowrap' as const,
				}}>
				{value != null
					? Number.isInteger(value)
						? value
						: value.toFixed(1)
					: '--'}
			</div>
			{trend && <TrendIndicator trend={trend} />}
			{sparkline && <SparklineChart data={sparkline} color="#06b6d4" />}
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
				Kubernetes
			</h2>

			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
					gap: '0.75rem',
				}}>
				<StatCard
					icon={<Activity size={20} />}
					label="Running Pods"
					value={snapshot.pods}
					trend={trends.pods}
					sparkline={sparklines.pods}
					onClick={() => grafanaService.toggleCard('pods')}
				/>
				<StatCard
					icon={<Clock size={20} />}
					label="Pending Pods"
					value={snapshot.pendingPods}
				/>
				<StatCard
					icon={<AlertTriangle size={20} />}
					label="Failed Pods"
					value={snapshot.failedPods}
				/>
				<StatCard
					icon={<Box size={20} />}
					label="Containers"
					value={snapshot.containers}
					trend={trends.containers}
				/>
				<StatCard
					icon={<RotateCcw size={20} />}
					label={`Restarts (${timeRange})`}
					value={snapshot.podRestarts}
				/>
				<StatCard
					icon={<Layers size={20} />}
					label="Deployments"
					value={snapshot.deployments}
					trend={trends.deployments}
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
			{k8sTimeSeries.length > 0 && (
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
						Running Pods ({timeRange})
					</h3>
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
				</div>
			)}
		</section>
	);
}

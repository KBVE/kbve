import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	Activity,
	AlertCircle,
	Loader2,
	RefreshCw,
	TrendingUp,
	Layers,
} from 'lucide-react';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from 'recharts';
import { ChartTooltip, POLL_MS } from './chartTheme';
import {
	$requestRate,
	$requestRateStatus,
	$statusHistogram,
	$statusHistogramStatus,
	$topEndpoints,
	$topEndpointsStatus,
	$errorRows,
	$errorRowsStatus,
	$telemetryRange,
	fetchAllTelemetry,
	formatBucketTick,
	invalidateTelemetryCache,
	statusColorClass,
	TELEMETRY_RANGES,
	TELEMETRY_RANGE_KEYS,
	type TelemetryRange,
} from './rowsTelemetryService';

const STATUS_BAR_COLOR = (status: number): string => {
	if (status >= 500) return '#ef4444';
	if (status >= 400) return '#f59e0b';
	if (status >= 300) return '#3b82f6';
	if (status >= 200) return '#10b981';
	return '#6b7280';
};

function PanelShell({
	icon,
	title,
	status,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	status: 'idle' | 'loading' | 'ok' | 'error';
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-lg border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] p-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm font-semibold">
					{icon}
					<span>{title}</span>
				</div>
				{status === 'loading' && (
					<Loader2 className="size-4 animate-spin text-gray-400" />
				)}
				{status === 'error' && (
					<AlertCircle className="size-4 text-red-500" />
				)}
			</div>
			{children}
		</div>
	);
}

export default function ReactRowsTelemetry() {
	const range = useStore($telemetryRange);
	const requestRate = useStore($requestRate);
	const requestRateStatus = useStore($requestRateStatus);
	const statusHistogram = useStore($statusHistogram);
	const statusHistogramStatus = useStore($statusHistogramStatus);
	const topEndpoints = useStore($topEndpoints);
	const topEndpointsStatus = useStore($topEndpointsStatus);
	const errorRows = useStore($errorRows);
	const errorRowsStatus = useStore($errorRowsStatus);
	const [refreshing, setRefreshing] = useState(false);

	useEffect(() => {
		void fetchAllTelemetry(range);
		const id = window.setInterval(() => {
			void fetchAllTelemetry(range);
		}, POLL_MS);
		return () => window.clearInterval(id);
	}, [range]);

	const onRefresh = async () => {
		setRefreshing(true);
		invalidateTelemetryCache();
		await fetchAllTelemetry(range);
		setRefreshing(false);
	};

	const onRangeChange = (r: TelemetryRange) => {
		$telemetryRange.set(r);
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<Activity className="size-4 text-emerald-500" />
					<span>ROWS Telemetry</span>
					<span className="text-xs font-normal text-gray-500">
						(via ClickHouse aggregates · 30s poll)
					</span>
				</div>
				<div className="flex items-center gap-2">
					<div className="flex rounded-md border border-[var(--sl-color-gray-5)] overflow-hidden text-xs">
						{TELEMETRY_RANGE_KEYS.map((r) => (
							<button
								key={r}
								onClick={() => onRangeChange(r)}
								className={`px-2 py-1 ${
									r === range
										? 'bg-emerald-500/20 text-emerald-400'
										: 'text-gray-400 hover:text-gray-200'
								}`}>
								{TELEMETRY_RANGES[r].label}
							</button>
						))}
					</div>
					<button
						onClick={onRefresh}
						disabled={refreshing}
						className="rounded-md border border-[var(--sl-color-gray-5)] p-1 text-gray-400 hover:text-gray-200 disabled:opacity-50">
						<RefreshCw
							className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
						/>
					</button>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<PanelShell
					icon={<TrendingUp className="size-4 text-emerald-500" />}
					title="Request rate"
					status={requestRateStatus}>
					{requestRate && requestRate.length > 0 ? (
						<ResponsiveContainer width="100%" height={180}>
							<AreaChart data={requestRate}>
								<defs>
									<linearGradient
										id="reqFill"
										x1="0"
										y1="0"
										x2="0"
										y2="1">
										<stop
											offset="0%"
											stopColor="#10b981"
											stopOpacity={0.4}
										/>
										<stop
											offset="100%"
											stopColor="#10b981"
											stopOpacity={0}
										/>
									</linearGradient>
								</defs>
								<CartesianGrid
									stroke="#262626"
									strokeDasharray="3 3"
								/>
								<XAxis
									dataKey="bucket"
									tickFormatter={formatBucketTick}
									tick={{ fontSize: 10, fill: '#9ca3af' }}
								/>
								<YAxis
									tick={{ fontSize: 10, fill: '#9ca3af' }}
								/>
								<ChartTooltip
									labelFormatter={(v) =>
										new Date(v as string).toLocaleString()
									}
								/>
								<Area
									type="monotone"
									dataKey="reqs"
									stroke="#10b981"
									fill="url(#reqFill)"
								/>
							</AreaChart>
						</ResponsiveContainer>
					) : (
						<div className="py-12 text-center text-xs text-gray-500">
							{requestRateStatus === 'loading'
								? 'Loading…'
								: 'No data'}
						</div>
					)}
				</PanelShell>

				<PanelShell
					icon={<Layers className="size-4 text-amber-500" />}
					title="Status code distribution"
					status={statusHistogramStatus}>
					{statusHistogram && statusHistogram.length > 0 ? (
						<ResponsiveContainer width="100%" height={180}>
							<BarChart data={statusHistogram}>
								<CartesianGrid
									stroke="#262626"
									strokeDasharray="3 3"
								/>
								<XAxis
									dataKey="status"
									tick={{ fontSize: 10, fill: '#9ca3af' }}
								/>
								<YAxis
									tick={{ fontSize: 10, fill: '#9ca3af' }}
								/>
								<ChartTooltip />
								<Bar dataKey="n">
									{statusHistogram.map((s, i) => (
										<Cell
											key={i}
											fill={STATUS_BAR_COLOR(s.status)}
										/>
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					) : (
						<div className="py-12 text-center text-xs text-gray-500">
							{statusHistogramStatus === 'loading'
								? 'Loading…'
								: 'No data'}
						</div>
					)}
				</PanelShell>
			</div>

			<PanelShell
				icon={<TrendingUp className="size-4 text-blue-500" />}
				title="Top endpoints (by request count)"
				status={topEndpointsStatus}>
				{topEndpoints && topEndpoints.length > 0 ? (
					<div className="overflow-x-auto">
						<table className="w-full text-xs">
							<thead className="border-b border-[var(--sl-color-gray-5)] text-left text-gray-400">
								<tr>
									<th className="py-2 pr-4">Path</th>
									<th className="py-2 pr-4 text-right">
										Reqs
									</th>
									<th className="py-2 pr-4 text-right">
										p50 ms
									</th>
									<th className="py-2 pr-4 text-right">
										p95 ms
									</th>
									<th className="py-2 text-right">p99 ms</th>
								</tr>
							</thead>
							<tbody>
								{topEndpoints.map((e) => (
									<tr
										key={e.path}
										className="border-b border-[var(--sl-color-gray-5)]/40 last:border-0">
										<td className="py-1.5 pr-4 font-mono">
											{e.path}
										</td>
										<td className="py-1.5 pr-4 text-right tabular-nums">
											{e.n.toLocaleString()}
										</td>
										<td className="py-1.5 pr-4 text-right tabular-nums">
											{e.p50}
										</td>
										<td className="py-1.5 pr-4 text-right tabular-nums">
											{e.p95}
										</td>
										<td className="py-1.5 text-right tabular-nums">
											{e.p99}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<div className="py-8 text-center text-xs text-gray-500">
						{topEndpointsStatus === 'loading'
							? 'Loading…'
							: 'No data'}
					</div>
				)}
			</PanelShell>

			<PanelShell
				icon={<AlertCircle className="size-4 text-red-500" />}
				title="Recent errors (status >= 400)"
				status={errorRowsStatus}>
				{errorRows && errorRows.length > 0 ? (
					<div className="max-h-80 overflow-y-auto">
						<table className="w-full text-xs">
							<thead className="sticky top-0 border-b border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] text-left text-gray-400">
								<tr>
									<th className="py-2 pr-4">Time</th>
									<th className="py-2 pr-4">Method</th>
									<th className="py-2 pr-4">Path</th>
									<th className="py-2 pr-4 text-right">
										Status
									</th>
									<th className="py-2 pr-4 text-right">
										Latency
									</th>
									<th className="py-2">Customer</th>
								</tr>
							</thead>
							<tbody>
								{errorRows.map((e) => (
									<tr
										key={e.request_id}
										className="border-b border-[var(--sl-color-gray-5)]/40 last:border-0">
										<td className="py-1 pr-4 font-mono text-gray-400">
											{new Date(
												e.timestamp,
											).toLocaleTimeString()}
										</td>
										<td className="py-1 pr-4 font-mono">
											{e.method}
										</td>
										<td className="py-1 pr-4 font-mono">
											{e.path}
										</td>
										<td
											className={`py-1 pr-4 text-right font-mono ${statusColorClass(e.status)}`}>
											{e.status}
										</td>
										<td className="py-1 pr-4 text-right tabular-nums">
											{e.latency_ms} ms
										</td>
										<td className="py-1 font-mono text-gray-400">
											{e.customer && e.customer !== '-'
												? e.customer.slice(0, 8)
												: '—'}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<div className="py-8 text-center text-xs text-gray-500">
						{errorRowsStatus === 'loading'
							? 'Loading…'
							: errorRowsStatus === 'error'
								? 'Failed to load'
								: 'No errors in window'}
					</div>
				)}
			</PanelShell>
		</div>
	);
}

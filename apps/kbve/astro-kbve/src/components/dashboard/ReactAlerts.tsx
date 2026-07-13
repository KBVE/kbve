import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	AlertTriangle,
	AlertCircle,
	Bell,
	Loader2,
	RefreshCw,
	Activity,
} from 'lucide-react';
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	LabelList,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from 'recharts';
import { ChartTooltip, POLL_MS } from './chartTheme';
import {
	$alertsFiring,
	$alertsFiringStatus,
	$alertsRecent,
	$alertsRecentStatus,
	$alertsSeverity,
	$alertsSeverityStatus,
	$alertsTop,
	$alertsTopStatus,
	$alertsRange,
	fetchAllAlerts,
	fetchAlertsFiring,
	invalidateAlertsCache,
	severityColor,
	severityClass,
	severityTextClass,
	formatRelative,
	ALERTS_RANGES,
	ALERTS_RANGE_KEYS,
	type AlertsRange,
} from './alertsService';


export type AlertsVariant = 'compact' | 'full';

interface Props {
	variant?: AlertsVariant;
}

export default function ReactAlerts({ variant = 'full' }: Props) {
	const range = useStore($alertsRange);
	const firing = useStore($alertsFiring);
	const firingStatus = useStore($alertsFiringStatus);
	const recent = useStore($alertsRecent);
	const recentStatus = useStore($alertsRecentStatus);
	const severity = useStore($alertsSeverity);
	const severityStatus = useStore($alertsSeverityStatus);
	const top = useStore($alertsTop);
	const topStatus = useStore($alertsTopStatus);
	const [refreshing, setRefreshing] = useState(false);

	useEffect(() => {
		if (variant === 'compact') {
			void fetchAlertsFiring(range);
			const id = window.setInterval(
				() => fetchAlertsFiring(range),
				POLL_MS,
			);
			return () => window.clearInterval(id);
		}
		void fetchAllAlerts(range);
		const id = window.setInterval(() => fetchAllAlerts(range), POLL_MS);
		return () => window.clearInterval(id);
	}, [range, variant]);

	const onRefresh = async () => {
		setRefreshing(true);
		invalidateAlertsCache();
		if (variant === 'compact') await fetchAlertsFiring(range);
		else await fetchAllAlerts(range);
		setRefreshing(false);
	};

	if (variant === 'compact') {
		const firingByLevel: Record<string, number> = {};
		(firing ?? []).forEach((a) => {
			const s = (a.severity || 'unknown').toLowerCase();
			firingByLevel[s] = (firingByLevel[s] ?? 0) + 1;
		});
		const total = firing?.length ?? 0;
		return (
			<div className="rounded-lg border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] p-3">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<Bell className="size-4 text-amber-500" />
						<a
							href="/dashboard/grafana/"
							className="hover:underline">
							Alerts firing
						</a>
						<span className="text-lg font-bold tabular-nums">
							{total}
						</span>
					</div>
					<div className="flex items-center gap-2 text-xs">
						{['critical', 'warning', 'info'].map(
							(s) =>
								firingByLevel[s] > 0 && (
									<span
										key={s}
										className={`flex items-center gap-1 ${severityTextClass(s)}`}>
										<span
											className="inline-block size-2 rounded-full"
											style={{
												background: severityColor(s),
											}}
										/>
										<span className="tabular-nums">
											{firingByLevel[s]}
										</span>
										<span className="opacity-60">{s}</span>
									</span>
								),
						)}
						{firingStatus === 'loading' && (
							<Loader2 className="size-3 animate-spin text-gray-400" />
						)}
						{firingStatus === 'error' && (
							<AlertCircle className="size-3 text-red-500" />
						)}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<Bell className="size-4 text-amber-500" />
					<span>Alerts</span>
					<span className="text-xs font-normal text-gray-500">
						(Alertmanager → ClickHouse · 30s poll · 30d retention)
					</span>
				</div>
				<div className="flex items-center gap-2">
					<div className="flex rounded-md border border-[var(--sl-color-gray-5)] overflow-hidden text-xs">
						{ALERTS_RANGE_KEYS.map((r) => (
							<button
								key={r}
								onClick={() => $alertsRange.set(r)}
								className={`px-2 py-1 ${
									r === range
										? 'bg-amber-500/20 text-amber-400'
										: 'text-gray-400 hover:text-gray-200'
								}`}>
								{ALERTS_RANGES[r].label}
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

			<div className="rounded-lg border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] p-4">
				<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
					<AlertTriangle className="size-4 text-red-500" />
					<span>Currently firing</span>
					{firingStatus === 'loading' && (
						<Loader2 className="size-4 animate-spin text-gray-400" />
					)}
				</div>
				{firing && firing.length > 0 ? (
					<div className="max-h-72 overflow-y-auto">
						<table className="w-full text-xs">
							<thead className="sticky top-0 border-b border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] text-left text-gray-400">
								<tr>
									<th className="py-1.5 pr-3">Severity</th>
									<th className="py-1.5 pr-3">Alert</th>
									<th className="py-1.5 pr-3">Namespace</th>
									<th className="py-1.5 pr-3">Service</th>
									<th className="py-1.5 pr-3">Summary</th>
									<th className="py-1.5">Started</th>
								</tr>
							</thead>
							<tbody>
								{firing.map((a) => (
									<tr
										key={a.fingerprint}
										className="border-b border-[var(--sl-color-gray-5)]/40 last:border-0">
										<td
											className={`py-1 pr-3 ${severityTextClass(a.severity)}`}>
											● {a.severity || '—'}
										</td>
										<td className="py-1 pr-3 font-mono">
											{a.alertname}
										</td>
										<td className="py-1 pr-3 font-mono text-gray-400">
											{a.namespace || '—'}
										</td>
										<td className="py-1 pr-3 font-mono text-gray-400">
											{a.service || '—'}
										</td>
										<td className="py-1 pr-3">
											{a.summary || '—'}
										</td>
										<td className="py-1 text-gray-400">
											{formatRelative(a.starts_at)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<div className="py-6 text-center text-xs text-gray-500">
						{firingStatus === 'loading'
							? 'Loading…'
							: firingStatus === 'error'
								? 'Failed to load'
								: '✓ No alerts firing in window'}
					</div>
				)}
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<div className="rounded-lg border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] p-4">
					<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
						<Activity className="size-4 text-amber-500" />
						<span>By severity</span>
						{severityStatus === 'loading' && (
							<Loader2 className="size-4 animate-spin text-gray-400" />
						)}
					</div>
					{severity && severity.length > 0 ? (
						<ResponsiveContainer width="100%" height={240}>
							<BarChart
								data={severity}
								margin={{
									top: 24,
									right: 12,
									left: 0,
									bottom: 4,
								}}
								barCategoryGap="25%">
								<CartesianGrid
									strokeDasharray="3 3"
									vertical={false}
								/>
								<XAxis
									dataKey="severity"
									tick={{
										fontSize: 12,
										fontWeight: 600,
									}}
									tickFormatter={(v: string) =>
										v
											? v.charAt(0).toUpperCase() +
												v.slice(1)
											: v
									}
									tickLine={false}
								/>
								<YAxis
									allowDecimals={false}
									tick={{ fontSize: 11 }}
									axisLine={false}
									tickLine={false}
									width={32}
								/>
								<ChartTooltip
									cursor={{
										fill: 'color-mix(in srgb, var(--sl-color-gray-4) 18%, transparent)',
									}}
								/>
								<Bar
									dataKey="firing_events"
									radius={[4, 4, 0, 0]}
									maxBarSize={72}>
									{severity.map((s, i) => (
										<Cell
											key={i}
											className={severityClass(
												s.severity,
											)}
										/>
									))}
									<LabelList
										dataKey="firing_events"
										position="top"
										fontSize={12}
										fontWeight={700}
									/>
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					) : (
						<div className="py-10 text-center text-xs text-gray-500">
							{severityStatus === 'loading'
								? 'Loading…'
								: 'No data'}
						</div>
					)}
				</div>

				<div className="rounded-lg border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] p-4">
					<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
						<Bell className="size-4 text-blue-500" />
						<span>Top alertnames</span>
						{topStatus === 'loading' && (
							<Loader2 className="size-4 animate-spin text-gray-400" />
						)}
					</div>
					{top && top.length > 0 ? (
						<div className="max-h-44 overflow-y-auto">
							<table className="w-full text-xs">
								<thead className="border-b border-[var(--sl-color-gray-5)] text-left text-gray-400">
									<tr>
										<th className="py-1 pr-3">Alert</th>
										<th className="py-1 pr-3 text-right">
											Instances
										</th>
										<th className="py-1 pr-3 text-right">
											Events
										</th>
										<th className="py-1 text-right">
											Firing
										</th>
									</tr>
								</thead>
								<tbody>
									{top.map((t) => (
										<tr
											key={t.alertname}
											className="border-b border-[var(--sl-color-gray-5)]/40 last:border-0">
											<td className="py-1 pr-3 font-mono">
												{t.alertname}
											</td>
											<td className="py-1 pr-3 text-right tabular-nums">
												{t.distinct_instances}
											</td>
											<td className="py-1 pr-3 text-right tabular-nums text-gray-400">
												{t.total_events}
											</td>
											<td className="py-1 text-right tabular-nums text-amber-400">
												{t.firing_events}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<div className="py-10 text-center text-xs text-gray-500">
							{topStatus === 'loading' ? 'Loading…' : 'No data'}
						</div>
					)}
				</div>
			</div>

			<div className="rounded-lg border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] p-4">
				<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
					<Activity className="size-4 text-gray-400" />
					<span>Recent timeline</span>
					{recentStatus === 'loading' && (
						<Loader2 className="size-4 animate-spin text-gray-400" />
					)}
				</div>
				{recent && recent.length > 0 ? (
					<div className="max-h-80 overflow-y-auto">
						<table className="w-full text-xs">
							<thead className="sticky top-0 border-b border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] text-left text-gray-400">
								<tr>
									<th className="py-1.5 pr-3">Time</th>
									<th className="py-1.5 pr-3">Status</th>
									<th className="py-1.5 pr-3">Severity</th>
									<th className="py-1.5 pr-3">Alert</th>
									<th className="py-1.5 pr-3">Namespace</th>
									<th className="py-1.5 pr-3">Source</th>
									<th className="py-1.5">Summary</th>
								</tr>
							</thead>
							<tbody>
								{recent.map((a, i) => (
									<tr
										key={`${a.fingerprint}-${a.timestamp}-${i}`}
										className="border-b border-[var(--sl-color-gray-5)]/40 last:border-0">
										<td className="py-1 pr-3 font-mono text-gray-400">
											{formatRelative(a.timestamp)}
										</td>
										<td
											className={`py-1 pr-3 ${
												a.status === 'firing'
													? 'text-red-400'
													: 'text-emerald-400'
											}`}>
											{a.status}
										</td>
										<td
											className={`py-1 pr-3 ${severityTextClass(a.severity)}`}>
											{a.severity || '—'}
										</td>
										<td className="py-1 pr-3 font-mono">
											{a.alertname}
										</td>
										<td className="py-1 pr-3 font-mono text-gray-400">
											{a.namespace || '—'}
										</td>
										<td className="py-1 pr-3 text-gray-500">
											{a.source}
										</td>
										<td className="py-1 text-gray-300">
											{a.summary || '—'}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<div className="py-6 text-center text-xs text-gray-500">
						{recentStatus === 'loading'
							? 'Loading…'
							: 'No alert events in window'}
					</div>
				)}
			</div>
		</div>
	);
}

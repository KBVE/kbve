import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	Activity,
	AlertCircle,
	Cpu,
	HardDrive,
	Loader2,
	Network,
	RefreshCw,
	RotateCcw,
} from 'lucide-react';
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import {
	fetchAlerts,
	fetchPodMetrics,
	formatBytes,
	grafanaService,
	TIME_RANGE_KEYS,
	type Alert,
	type PodMetrics,
	type TimeRangeKey,
} from './grafanaService';
import {
	alertMatchesNamespace,
	alertMatchesPod,
	AlertRow,
} from './grafanaAlertHelpers';
import type { ResourceSelector } from './argoService';

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

function formatBytesAbs(bytes: number | null): string {
	if (bytes == null) return '--';
	if (bytes >= 1_073_741_824)
		return `${(bytes / 1_073_741_824).toFixed(2)} GiB`;
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${bytes.toFixed(0)} B`;
}

function formatCores(cores: number | null): string {
	if (cores == null) return '--';
	if (cores < 0.01) return `${(cores * 1000).toFixed(0)} m`;
	return `${cores.toFixed(2)} cores`;
}

function StatCard({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: '0.4rem',
				padding: '0.75rem 0.9rem',
				borderRadius: 8,
				border: '1px solid var(--sl-color-gray-5, #262626)',
				background: 'var(--sl-color-bg-nav, #111)',
				minHeight: 70,
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.7rem',
					fontWeight: 500,
					textTransform: 'uppercase',
					letterSpacing: '0.06em',
				}}>
				<span style={{ color: 'var(--sl-color-accent, #06b6d4)' }}>
					{icon}
				</span>
				{label}
			</div>
			<div
				style={{
					fontSize: '1.05rem',
					fontWeight: 700,
					color: 'var(--sl-color-text, #e6edf3)',
					fontVariantNumeric: 'tabular-nums',
				}}>
				{value}
			</div>
		</div>
	);
}

function TimeRangePicker({
	value,
	onChange,
}: {
	value: TimeRangeKey;
	onChange: (v: TimeRangeKey) => void;
}) {
	return (
		<div
			style={{
				display: 'flex',
				gap: 2,
				background: 'var(--sl-color-bg-nav, #111)',
				border: '1px solid var(--sl-color-gray-5, #262626)',
				borderRadius: 6,
				padding: 2,
			}}>
			{TIME_RANGE_KEYS.map((k) => {
				const active = k === value;
				return (
					<button
						key={k}
						onClick={() => onChange(k)}
						style={{
							padding: '2px 8px',
							borderRadius: 4,
							border: 'none',
							background: active
								? 'var(--sl-color-accent, #06b6d4)'
								: 'transparent',
							color: active
								? '#fff'
								: 'var(--sl-color-gray-3, #8b949e)',
							cursor: 'pointer',
							fontSize: '0.7rem',
							fontWeight: active ? 600 : 500,
						}}>
						{k}
					</button>
				);
			})}
		</div>
	);
}

export default function ReactArgoGrafanaPanel({
	token,
	sel,
}: {
	token: string;
	sel: ResourceSelector;
}) {
	const userId = useStore(grafanaService.$userId);
	const tr = useStore(grafanaService.$timeRange);

	const [metrics, setMetrics] = useState<PodMetrics | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [scopedAlerts, setScopedAlerts] = useState<Alert[]>([]);
	const [alertsError, setAlertsError] = useState<string | null>(null);

	const isPod = sel.kind === 'Pod';
	const ns = sel.namespace;
	const name = sel.name;

	useEffect(() => {
		if (!isPod || !userId || !ns || !name) return;

		let cancelled = false;
		(async () => {
			setLoading(true);
			setError(null);
			try {
				const data = await fetchPodMetrics(token, userId, ns, name, tr);
				if (cancelled) return;
				if (!data) {
					setError('Could not find Prometheus datasource in Grafana');
					return;
				}
				setMetrics(data);
			} catch (e: unknown) {
				if (!cancelled)
					setError(
						e instanceof Error
							? e.message
							: 'Failed to load metrics',
					);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [token, userId, ns, name, tr, isPod]);

	// Scoped alerts — reuses the global alerts cache populated on the main
	// /dashboard/grafana page. Filters to alerts whose labels mention this
	// pod (or namespace, for non-Pod kinds). 60s cache absorbs repeat
	// drawer opens for the same resource.
	useEffect(() => {
		if (!userId || !ns || !name) return;
		let cancelled = false;
		(async () => {
			setAlertsError(null);
			try {
				const snap = await fetchAlerts(token, userId);
				if (cancelled || !snap) return;
				const filtered = snap.alerts.filter((a) =>
					isPod
						? alertMatchesPod(a, ns, name)
						: alertMatchesNamespace(a, ns),
				);
				setScopedAlerts(filtered);
			} catch (e: unknown) {
				if (!cancelled)
					setAlertsError(
						e instanceof Error
							? e.message
							: 'Failed to load alerts',
					);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [token, userId, ns, name, isPod]);

	const handleRefresh = async () => {
		if (!userId || !isPod || loading) return;
		setLoading(true);
		setError(null);
		try {
			const data = await fetchPodMetrics(
				token,
				userId,
				ns,
				name,
				tr,
				true,
			);
			if (!data) {
				setError('Could not find Prometheus datasource in Grafana');
				return;
			}
			setMetrics(data);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : 'Failed to load metrics');
		} finally {
			setLoading(false);
		}
	};

	const handleTimeRange = (next: TimeRangeKey) => {
		grafanaService.$timeRange.set(next);
		try {
			localStorage.setItem('grafana:timeRange', next);
		} catch {
			/* ignore */
		}
	};

	const alertsBlock = (
		<>
			{alertsError && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						padding: '0.4rem 0.65rem',
						borderRadius: 6,
						background: 'rgba(239,68,68,0.1)',
						border: '1px solid rgba(239,68,68,0.3)',
						color: '#fca5a5',
						fontSize: '0.75rem',
					}}>
					<AlertCircle size={12} />
					{alertsError}
				</div>
			)}
			{scopedAlerts.length > 0 && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: '0.4rem',
					}}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontSize: '0.7rem',
							fontWeight: 600,
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
						}}>
						Alerts
						<span
							style={{
								color: '#fca5a5',
								fontWeight: 700,
							}}>
							({scopedAlerts.length})
						</span>
					</div>
					{scopedAlerts.map((a, i) => (
						<AlertRow
							key={`${a.labels.alertname ?? 'alert'}-${i}`}
							alert={a}
						/>
					))}
				</div>
			)}
		</>
	);

	if (!isPod) {
		return (
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: '0.6rem',
				}}>
				{alertsBlock}
				<div
					style={{
						padding: '0.85rem 1rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.85rem',
						display: 'flex',
						flexDirection: 'column',
						gap: '0.5rem',
					}}>
					<span>
						Per-resource Prometheus metrics are scoped to Pods. Open
						one of the pods owned by this {sel.kind} to view CPU,
						memory, network, and restart history.
					</span>
					<a
						href="/dashboard/grafana"
						target="_blank"
						rel="noopener noreferrer"
						style={{
							color: 'var(--sl-color-accent, #06b6d4)',
							fontSize: '0.8rem',
							width: 'fit-content',
						}}>
						Open cluster overview ↗
					</a>
				</div>
			</div>
		);
	}

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: '0.75rem',
			}}>
			{alertsBlock}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: '0.5rem',
					flexWrap: 'wrap',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.5rem',
						fontSize: '0.75rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
					}}>
					<span>
						{ns}/{name}
					</span>
					{metrics?.fromCache && (
						<span
							style={{
								padding: '1px 6px',
								borderRadius: 3,
								background: 'var(--sl-color-gray-6, #1c1c1c)',
								fontSize: '0.65rem',
								textTransform: 'uppercase',
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
						gap: '0.5rem',
					}}>
					<TimeRangePicker value={tr} onChange={handleTimeRange} />
					<button
						onClick={handleRefresh}
						disabled={loading}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 28,
							height: 28,
							borderRadius: 6,
							border: '1px solid var(--sl-color-gray-5, #262626)',
							background: 'var(--sl-color-bg-nav, #111)',
							color: 'var(--sl-color-text, #e6edf3)',
							cursor: loading ? 'wait' : 'pointer',
						}}
						title="Refresh">
						<RefreshCw
							size={14}
							style={
								loading
									? { animation: 'spin 1s linear infinite' }
									: undefined
							}
						/>
					</button>
				</div>
			</div>

			{error && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						padding: '0.5rem 0.75rem',
						borderRadius: 6,
						background: 'rgba(239,68,68,0.1)',
						border: '1px solid rgba(239,68,68,0.3)',
						color: '#fca5a5',
						fontSize: '0.8rem',
					}}>
					<AlertCircle size={14} />
					{error}
				</div>
			)}

			{loading && !metrics && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						padding: '0.85rem 0.5rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.85rem',
					}}>
					<Loader2
						size={14}
						style={{ animation: 'spin 1s linear infinite' }}
					/>
					Loading pod metrics...
				</div>
			)}

			{metrics && (
				<>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns:
								'repeat(auto-fit, minmax(150px, 1fr))',
							gap: '0.5rem',
						}}>
						<StatCard
							icon={<Cpu size={14} />}
							label="CPU"
							value={formatCores(metrics.snapshot.cpuCores)}
						/>
						<StatCard
							icon={<HardDrive size={14} />}
							label="Memory"
							value={formatBytesAbs(metrics.snapshot.memoryBytes)}
						/>
						<StatCard
							icon={<HardDrive size={14} />}
							label="Mem Limit"
							value={formatBytesAbs(
								metrics.snapshot.memoryLimitBytes,
							)}
						/>
						<StatCard
							icon={<Network size={14} />}
							label="Net RX"
							value={formatBytes(
								metrics.snapshot.netRxBytesPerSec,
							)}
						/>
						<StatCard
							icon={<Network size={14} />}
							label="Net TX"
							value={formatBytes(
								metrics.snapshot.netTxBytesPerSec,
							)}
						/>
						<StatCard
							icon={<HardDrive size={14} />}
							label="FS Usage"
							value={formatBytesAbs(metrics.snapshot.fsBytes)}
						/>
						<StatCard
							icon={<RotateCcw size={14} />}
							label="Restarts"
							value={
								metrics.snapshot.restarts != null
									? String(metrics.snapshot.restarts)
									: '--'
							}
						/>
						<StatCard
							icon={<Activity size={14} />}
							label="Phase"
							value={
								metrics.snapshot.running == null
									? '--'
									: metrics.snapshot.running
										? 'Running'
										: 'Not running'
							}
						/>
					</div>

					{metrics.cpuMemSeries.length > 0 && (
						<div
							style={{
								padding: '0.75rem',
								borderRadius: 8,
								border: '1px solid var(--sl-color-gray-5, #262626)',
								background: 'var(--sl-color-bg-nav, #111)',
							}}>
							<h4
								style={{
									margin: '0 0 0.5rem 0',
									fontSize: '0.85rem',
									color: 'var(--sl-color-text, #e6edf3)',
								}}>
								CPU (cores) & Memory (bytes) — {tr}
							</h4>
							<ResponsiveContainer width="100%" height={180}>
								<AreaChart data={metrics.cpuMemSeries}>
									<CartesianGrid
										strokeDasharray="3 3"
										stroke={gridStroke}
									/>
									<XAxis
										dataKey="timestamp"
										tickFormatter={tickFormatter}
										stroke={axisStroke}
										fontSize={11}
									/>
									<YAxis
										yAxisId="cpu"
										stroke={axisStroke}
										fontSize={11}
										width={50}
										tickFormatter={(v: number) =>
											v < 0.01
												? `${(v * 1000).toFixed(0)}m`
												: v.toFixed(2)
										}
									/>
									<YAxis
										yAxisId="mem"
										orientation="right"
										stroke={axisStroke}
										fontSize={11}
										width={60}
										tickFormatter={(v: number) =>
											formatBytesAbs(v)
										}
									/>
									<Tooltip
										contentStyle={tooltipStyle}
										labelFormatter={tooltipLabelFormatter}
										formatter={(v: number, n: string) =>
											n === 'CPU'
												? formatCores(v)
												: formatBytesAbs(v)
										}
									/>
									<Area
										yAxisId="cpu"
										type="monotone"
										dataKey="cpu"
										stroke="#06b6d4"
										fill="rgba(6,182,212,0.15)"
										name="CPU"
										strokeWidth={2}
									/>
									<Area
										yAxisId="mem"
										type="monotone"
										dataKey="memory"
										stroke="#8b5cf6"
										fill="rgba(139,92,246,0.15)"
										name="Memory"
										strokeWidth={2}
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
					)}

					{metrics.netSeries.length > 0 && (
						<div
							style={{
								padding: '0.75rem',
								borderRadius: 8,
								border: '1px solid var(--sl-color-gray-5, #262626)',
								background: 'var(--sl-color-bg-nav, #111)',
							}}>
							<h4
								style={{
									margin: '0 0 0.5rem 0',
									fontSize: '0.85rem',
									color: 'var(--sl-color-text, #e6edf3)',
								}}>
								Network — {tr}
							</h4>
							<ResponsiveContainer width="100%" height={150}>
								<AreaChart data={metrics.netSeries}>
									<CartesianGrid
										strokeDasharray="3 3"
										stroke={gridStroke}
									/>
									<XAxis
										dataKey="timestamp"
										tickFormatter={tickFormatter}
										stroke={axisStroke}
										fontSize={11}
									/>
									<YAxis
										stroke={axisStroke}
										fontSize={11}
										width={70}
										tickFormatter={(v: number) =>
											formatBytes(v).replace('/s', '')
										}
									/>
									<Tooltip
										contentStyle={tooltipStyle}
										labelFormatter={tooltipLabelFormatter}
										formatter={(v: number) =>
											formatBytes(v)
										}
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
				</>
			)}

			<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
		</div>
	);
}

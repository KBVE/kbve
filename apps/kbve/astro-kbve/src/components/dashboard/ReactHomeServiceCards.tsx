import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	homeService,
	statusColor,
	statusLabel,
	getThresholdColor,
	type ServiceStatus,
} from './homeService';
import {
	BarChart3,
	GitBranch,
	Zap,
	Database,
	Loader2,
	ArrowRight,
	CheckCircle2,
	XCircle,
	AlertCircle,
	ShieldAlert,
	Kanban,
	FileText,
	Network,
	Gamepad2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: ServiceStatus }) {
	const color = statusColor(status);
	return (
		<span
			style={{
				display: 'inline-block',
				width: 8,
				height: 8,
				borderRadius: '50%',
				background: color,
				boxShadow: status === 'ok' ? `0 0 6px ${color}` : 'none',
				flexShrink: 0,
			}}
		/>
	);
}

function MetricValue({
	label,
	value,
	unit,
	color,
}: {
	label: string;
	value: string | number;
	unit?: string;
	color?: string;
}) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
			<div
				style={{
					fontSize: '1.5rem',
					fontWeight: 700,
					fontVariantNumeric: 'tabular-nums',
					color: color ?? 'var(--sl-color-text, #e6edf3)',
					lineHeight: 1.2,
				}}>
				{value}
				{unit && (
					<span
						style={{
							fontSize: '0.75rem',
							fontWeight: 500,
							color: 'var(--sl-color-gray-3, #8b949e)',
							marginLeft: 2,
						}}>
						{unit}
					</span>
				)}
			</div>
			<div
				style={{
					fontSize: '0.7rem',
					textTransform: 'uppercase' as const,
					letterSpacing: '0.05em',
					fontWeight: 500,
					color: 'var(--sl-color-gray-3, #8b949e)',
				}}>
				{label}
			</div>
		</div>
	);
}

function LoadingPlaceholder() {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: '100%',
				color: 'var(--sl-color-gray-3, #8b949e)',
			}}>
			<Loader2
				size={16}
				style={{ animation: 'spin 1s linear infinite' }}
			/>
		</div>
	);
}

function UnavailableMessage() {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 6,
				color: 'var(--sl-color-gray-4, #6b7280)',
				fontSize: '0.8rem',
			}}>
			<AlertCircle size={14} />
			Service unreachable
		</div>
	);
}

function ServiceCard({
	title,
	description,
	href,
	icon,
	accentColor,
	status,
	children,
	span,
}: {
	title: string;
	description: string;
	href: string;
	icon: React.ReactNode;
	accentColor: string;
	status: ServiceStatus;
	children: React.ReactNode;
	span?: number;
}) {
	const [hovered, setHovered] = useState(false);

	return (
		<div
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gridColumn: span ? `span ${span}` : undefined,
				borderRadius: 12,
				border: `1px solid ${hovered ? 'var(--sl-color-gray-4, #4b5563)' : 'var(--sl-color-gray-5, #262626)'}`,
				background: 'var(--sl-color-bg-nav, #111)',
				overflow: 'hidden',
				transition: 'border-color 0.2s, box-shadow 0.2s',
				boxShadow: hovered
					? '0 8px 24px rgba(0, 0, 0, 0.3)'
					: '0 2px 8px rgba(0, 0, 0, 0.15)',
			}}>
			{/* Accent strip */}
			<div
				style={{
					height: 3,
					background: accentColor,
					opacity: status === 'ok' ? 1 : 0.4,
				}}
			/>

			{/* Header */}
			<div
				style={{
					padding: '1.25rem 1.25rem 0',
					display: 'flex',
					alignItems: 'flex-start',
					gap: '0.75rem',
				}}>
				<div
					style={{
						width: 36,
						height: 36,
						borderRadius: 8,
						background: `${accentColor}18`,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0,
						color: accentColor,
					}}>
					{icon}
				</div>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 2,
						}}>
						<span
							style={{
								fontWeight: 600,
								fontSize: '1rem',
								color: 'var(--sl-color-text, #e6edf3)',
							}}>
							{title}
						</span>
						<StatusDot status={status} />
					</div>
					<div
						style={{
							fontSize: '0.8rem',
							color: 'var(--sl-color-gray-3, #8b949e)',
						}}>
						{description}
					</div>
				</div>
			</div>

			{/* Metrics */}
			<div
				style={{
					padding: '1rem 1.25rem',
					display: 'flex',
					gap: '1.25rem',
					flexWrap: 'wrap',
					minHeight: 64,
					alignItems: 'flex-end',
				}}>
				{children}
			</div>

			{/* Footer */}
			<div
				style={{
					padding: '0.75rem 1.25rem',
					borderTop: '1px solid var(--sl-color-gray-5, #262626)',
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}>
				<span
					style={{
						fontSize: '0.7rem',
						fontWeight: 500,
						color: statusColor(status),
						textTransform: 'uppercase' as const,
						letterSpacing: '0.05em',
						display: 'flex',
						alignItems: 'center',
						gap: 4,
					}}>
					{status === 'loading' ? (
						<Loader2
							size={10}
							style={{
								animation: 'spin 1s linear infinite',
							}}
						/>
					) : status === 'ok' ? (
						<CheckCircle2 size={10} />
					) : status === 'error' ? (
						<XCircle size={10} />
					) : (
						<AlertCircle size={10} />
					)}
					{statusLabel(status)}
				</span>
				<a
					href={href}
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 4,
						color: 'var(--sl-color-accent, #06b6d4)',
						fontSize: '0.8rem',
						fontWeight: 600,
						textDecoration: 'none',
					}}>
					Details
					<ArrowRight size={12} />
				</a>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function KanbanColumnBar({ columns }: { columns: Record<string, number> }) {
	const entries = Object.entries(columns).filter(([, v]) => v > 0);
	const total = entries.reduce((s, [, v]) => s + v, 0);
	if (total === 0) return null;

	const colColors: Record<string, string> = {
		Theory: '#8b5cf6',
		AI: '#06b6d4',
		Todo: '#3b82f6',
		Backlog: '#6366f1',
		Error: '#ef4444',
		Support: '#f59e0b',
		Staging: '#f97316',
		Review: '#eab308',
		Done: '#22c55e',
	};

	return (
		<div style={{ width: '100%' }}>
			<div
				style={{
					display: 'flex',
					height: 6,
					borderRadius: 3,
					overflow: 'hidden',
					background: 'var(--sl-color-gray-5, #30363d)',
					marginBottom: 6,
				}}>
				{entries.map(([col, count]) => (
					<div
						key={col}
						title={`${col}: ${count}`}
						style={{
							width: `${(count / total) * 100}%`,
							background: colColors[col] ?? '#6b7280',
							minWidth: count > 0 ? 2 : 0,
						}}
					/>
				))}
			</div>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: '0.3rem 0.6rem',
				}}>
				{entries.map(([col, count]) => (
					<span
						key={col}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 3,
							fontSize: '0.65rem',
							color: 'var(--sl-color-gray-3, #8b949e)',
						}}>
						<span
							style={{
								width: 6,
								height: 6,
								borderRadius: '50%',
								background: colColors[col] ?? '#6b7280',
							}}
						/>
						{col} {count}
					</span>
				))}
			</div>
		</div>
	);
}

export default function ReactHomeServiceCards() {
	const grafana = useStore(homeService.$grafana);
	const argo = useStore(homeService.$argo);
	const edge = useStore(homeService.$edge);
	const clickhouse = useStore(homeService.$clickhouse);
	const security = useStore(homeService.$security);
	const kanban = useStore(homeService.$kanban);
	const report = useStore(homeService.$report);
	const graph = useStore(homeService.$graph);
	const rows = useStore(homeService.$rows);

	const grafanaStatus = useStore(homeService.$grafanaStatus);
	const argoStatus = useStore(homeService.$argoStatus);
	const edgeStatus = useStore(homeService.$edgeStatus);
	const clickhouseStatus = useStore(homeService.$clickhouseStatus);
	const securityStatus = useStore(homeService.$securityStatus);
	const kanbanStatus = useStore(homeService.$kanbanStatus);
	const reportStatus = useStore(homeService.$reportStatus);
	const graphStatus = useStore(homeService.$graphStatus);
	const rowsStatus = useStore(homeService.$rowsStatus);

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
				gap: '1rem',
			}}>
			{/* Grafana - Cluster Monitoring */}
			<ServiceCard
				title="Cluster Monitoring"
				description="Prometheus metrics & node health"
				href="/dashboard/grafana/"
				icon={<BarChart3 size={18} />}
				accentColor="#06b6d4"
				status={grafanaStatus}>
				{grafanaStatus === 'loading' ? (
					<LoadingPlaceholder />
				) : grafana ? (
					<>
						<MetricValue
							label="Nodes"
							value={grafana.nodeCount}
							color="#06b6d4"
						/>
						{grafana.cpuPercent != null && (
							<MetricValue
								label="CPU"
								value={grafana.cpuPercent}
								unit="%"
								color={getThresholdColor(grafana.cpuPercent)}
							/>
						)}
						{grafana.memoryPercent != null && (
							<MetricValue
								label="Memory"
								value={grafana.memoryPercent}
								unit="%"
								color={getThresholdColor(grafana.memoryPercent)}
							/>
						)}
						{grafana.podCount != null && (
							<MetricValue
								label="Pods"
								value={grafana.podCount}
							/>
						)}
					</>
				) : (
					<UnavailableMessage />
				)}
			</ServiceCard>

			{/* ArgoCD - Deployments */}
			<ServiceCard
				title="Deployments"
				description="ArgoCD application sync & health"
				href="/dashboard/argo/"
				icon={<GitBranch size={18} />}
				accentColor="#8b5cf6"
				status={argoStatus}>
				{argoStatus === 'loading' ? (
					<LoadingPlaceholder />
				) : argo ? (
					<>
						<MetricValue
							label="Apps"
							value={argo.totalApps}
							color="#8b5cf6"
						/>
						<MetricValue
							label="Healthy"
							value={argo.healthyCount}
							color="#22c55e"
						/>
						<MetricValue
							label="Synced"
							value={argo.syncedCount}
							color="#06b6d4"
						/>
						{argo.degradedCount > 0 && (
							<MetricValue
								label="Degraded"
								value={argo.degradedCount}
								color="#ef4444"
							/>
						)}
					</>
				) : (
					<UnavailableMessage />
				)}
			</ServiceCard>

			{/* ROWS — Game Server Operations */}
			<ServiceCard
				title="Game Ops (ROWS)"
				description="ChuckRPG game server backend"
				href="/dashboard/rows/"
				icon={<Gamepad2 size={18} />}
				accentColor="#f97316"
				status={rowsStatus}>
				{rowsStatus === 'loading' ? (
					<LoadingPlaceholder />
				) : rows ? (
					<>
						<MetricValue
							label="Sessions"
							value={rows.active_sessions}
							color="#f97316"
						/>
						<MetricValue
							label="Instances"
							value={rows.active_instances}
							color="#06b6d4"
						/>
						<MetricValue
							label="Version"
							value={`v${rows.version}`}
							color="var(--sl-color-gray-3, #8b949e)"
						/>
					</>
				) : (
					<UnavailableMessage />
				)}
			</ServiceCard>

			{/* Edge Functions */}
			<ServiceCard
				title="Edge Functions"
				description="Supabase serverless health"
				href="/dashboard/edge/"
				icon={<Zap size={18} />}
				accentColor="#22c55e"
				status={edgeStatus}>
				{edgeStatus === 'loading' ? (
					<LoadingPlaceholder />
				) : edge ? (
					<>
						<MetricValue
							label="Operational"
							value={`${edge.operational}/${edge.total}`}
							color={
								edge.operational === edge.total
									? '#22c55e'
									: '#f59e0b'
							}
						/>
						<MetricValue
							label="Latency"
							value={edge.latencyMs}
							unit="ms"
						/>
					</>
				) : (
					<UnavailableMessage />
				)}
			</ServiceCard>

			{/* ClickHouse Logs */}
			<ServiceCard
				title="Log Aggregation"
				description="ClickHouse cluster log analytics"
				href="/dashboard/clickhouse/"
				icon={<Database size={18} />}
				accentColor="#f59e0b"
				status={clickhouseStatus}>
				{clickhouseStatus === 'loading' ? (
					<LoadingPlaceholder />
				) : clickhouse ? (
					<>
						<MetricValue
							label="Logs/hr"
							value={clickhouse.totalLogs.toLocaleString()}
							color="#f59e0b"
						/>
						<MetricValue
							label="Errors"
							value={clickhouse.errors}
							color={
								clickhouse.errors > 0 ? '#ef4444' : '#22c55e'
							}
						/>
						<MetricValue
							label="Warns"
							value={clickhouse.warns}
							color={clickhouse.warns > 0 ? '#f59e0b' : '#22c55e'}
						/>
						<MetricValue
							label="Namespaces"
							value={clickhouse.namespaces}
						/>
					</>
				) : (
					<UnavailableMessage />
				)}
			</ServiceCard>

			{/* Security Audit */}
			<ServiceCard
				title="Security Audit"
				description="Daily vulnerability scan across all ecosystems"
				href="/dashboard/security/"
				icon={<ShieldAlert size={18} />}
				accentColor="#ef4444"
				status={securityStatus}>
				{securityStatus === 'loading' ? (
					<LoadingPlaceholder />
				) : security ? (
					<>
						<MetricValue
							label="Critical"
							value={security.critical}
							color={
								security.critical > 0 ? '#ef4444' : '#22c55e'
							}
						/>
						<MetricValue
							label="High"
							value={security.high}
							color={security.high > 0 ? '#f59e0b' : '#22c55e'}
						/>
						<MetricValue
							label="Medium"
							value={security.medium}
							color="#94a3b8"
						/>
						<MetricValue
							label="Total"
							value={security.total}
							color={
								security.critical + security.high > 0
									? '#ef4444'
									: '#22c55e'
							}
						/>
					</>
				) : (
					<UnavailableMessage />
				)}
			</ServiceCard>

			{/* Kanban Board — spans 3 columns */}
			<ServiceCard
				title="Project Board"
				description="GitHub Projects kanban pipeline"
				href="/dashboard/kanban/"
				icon={<Kanban size={18} />}
				accentColor="#3b82f6"
				status={kanbanStatus}
				span={3}>
				{kanbanStatus === 'loading' ? (
					<LoadingPlaceholder />
				) : kanban ? (
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 10,
							width: '100%',
						}}>
						<div
							style={{
								display: 'flex',
								gap: '1.25rem',
								flexWrap: 'wrap',
							}}>
							<MetricValue
								label="Total Items"
								value={kanban.total_items}
								color="#3b82f6"
							/>
							<MetricValue
								label="Done"
								value={kanban.done}
								color="#22c55e"
							/>
							<MetricValue
								label="Active"
								value={kanban.active}
								color="#f59e0b"
							/>
							{kanban.error > 0 && (
								<MetricValue
									label="Error"
									value={kanban.error}
									color="#ef4444"
								/>
							)}
						</div>
						<KanbanColumnBar columns={kanban.columns} />
					</div>
				) : (
					<UnavailableMessage />
				)}
			</ServiceCard>

			{/* Report — spans 2 columns */}
			<ServiceCard
				title="Workspace Report"
				description="NX monorepo environment & LOC stats"
				href="/dashboard/report/"
				icon={<FileText size={18} />}
				accentColor="#a855f7"
				status={reportStatus}
				span={2}>
				{reportStatus === 'loading' ? (
					<LoadingPlaceholder />
				) : report ? (
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 8,
							width: '100%',
						}}>
						<div
							style={{
								display: 'flex',
								gap: '1.25rem',
								flexWrap: 'wrap',
							}}>
							<MetricValue
								label="Files"
								value={report.totalFiles.toLocaleString()}
								color="#a855f7"
							/>
							<MetricValue
								label="Lines"
								value={report.totalLines.toLocaleString()}
								color="#06b6d4"
							/>
							<MetricValue label="Node" value={report.node} />
							<MetricValue label="Nx" value={report.nx} />
							<MetricValue label="pnpm" value={report.pnpm} />
						</div>
						{report.topLanguages.length > 0 && (
							<div
								style={{
									display: 'flex',
									flexWrap: 'wrap',
									gap: '0.4rem 0.8rem',
								}}>
								{report.topLanguages.map((l) => (
									<span
										key={l.name}
										style={{
											fontSize: '0.65rem',
											color: 'var(--sl-color-gray-3, #8b949e)',
										}}>
										{l.name}{' '}
										<span
											style={{
												color: '#a855f7',
												fontWeight: 600,
											}}>
											{l.lines.toLocaleString()}
										</span>
									</span>
								))}
							</div>
						)}
					</div>
				) : (
					<UnavailableMessage />
				)}
			</ServiceCard>

			{/* Graph — 1 column */}
			<ServiceCard
				title="Dependency Graph"
				description="NX project dependency map"
				href="/dashboard/graph/"
				icon={<Network size={18} />}
				accentColor="#14b8a6"
				status={graphStatus}>
				{graphStatus === 'loading' ? (
					<LoadingPlaceholder />
				) : graph ? (
					<>
						<MetricValue
							label="Projects"
							value={graph.totalProjects}
							color="#14b8a6"
						/>
						<MetricValue
							label="Apps"
							value={graph.apps}
							color="#3b82f6"
						/>
						<MetricValue
							label="Libs"
							value={graph.libs}
							color="#8b5cf6"
						/>
						<MetricValue
							label="E2E"
							value={graph.e2e}
							color="#6b7280"
						/>
					</>
				) : (
					<UnavailableMessage />
				)}
			</ServiceCard>
		</div>
	);
}

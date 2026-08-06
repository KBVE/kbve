import { useStore } from '@nanostores/react';
import type { CSSProperties } from 'react';
import { homeService, getThresholdColor } from './homeService';
import {
	LoadingPlaceholder,
	MetricValue,
	ServiceCard,
	UnavailableMessage,
} from './homeServiceCard';
import './homeServiceCards.css';

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
		<div className="svc-stack">
			<div>
				<div className="svc-bar">
					{entries.map(([col, count]) => (
						<div
							key={col}
							title={`${col}: ${count}`}
							style={{
								width: `${(count / total) * 100}%`,
								background: colColors[col] ?? '#6b7280',
								minWidth: 2,
							}}
						/>
					))}
				</div>
				<div className="svc-legend">
					{entries.map(([col, count]) => (
						<span key={col} className="svc-legend__item">
							<span
								className="svc-legend__swatch"
								style={
									{
										'--svc-swatch':
											colColors[col] ?? '#6b7280',
									} as CSSProperties
								}
							/>
							{col} {count}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}

export default function ReactHomeServiceCards() {
	const isStaff = useStore(homeService.$isStaff);
	const grafana = useStore(homeService.$grafana);
	const argo = useStore(homeService.$argo);
	const edge = useStore(homeService.$edge);
	const clickhouse = useStore(homeService.$clickhouse);
	const security = useStore(homeService.$security);
	const kanban = useStore(homeService.$kanban);
	const report = useStore(homeService.$report);
	const graph = useStore(homeService.$graph);
	const rows = useStore(homeService.$rows);
	const vm = useStore(homeService.$vm);
	const forgejo = useStore(homeService.$forgejo);

	const grafanaStatus = useStore(homeService.$grafanaStatus);
	const argoStatus = useStore(homeService.$argoStatus);
	const edgeStatus = useStore(homeService.$edgeStatus);
	const clickhouseStatus = useStore(homeService.$clickhouseStatus);
	const securityStatus = useStore(homeService.$securityStatus);
	const kanbanStatus = useStore(homeService.$kanbanStatus);
	const reportStatus = useStore(homeService.$reportStatus);
	const graphStatus = useStore(homeService.$graphStatus);
	const rowsStatus = useStore(homeService.$rowsStatus);
	const vmStatus = useStore(homeService.$vmStatus);
	const forgejoStatus = useStore(homeService.$forgejoStatus);

	return (
		<div className="svc-grid">
			{/* Grafana - Cluster Monitoring (staff only) */}
			{isStaff && (
				<ServiceCard
					title="Cluster Monitoring"
					description="Prometheus metrics & node health"
					href="/dashboard/grafana/"
					icon="chart"
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
									color={getThresholdColor(
										grafana.cpuPercent,
									)}
								/>
							)}
							{grafana.memoryPercent != null && (
								<MetricValue
									label="Memory"
									value={grafana.memoryPercent}
									unit="%"
									color={getThresholdColor(
										grafana.memoryPercent,
									)}
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
			)}

			{/* ArgoCD - Deployments (staff only) */}
			{isStaff && (
				<ServiceCard
					title="Deployments"
					description="ArgoCD application sync & health"
					href="/dashboard/argo/"
					icon="gitBranch"
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
			)}

			{/* GameOps — central panel for all game servers (staff only) */}
			{isStaff && (
				<ServiceCard
					title="GameOps"
					description="ROWS, Factorio, and MC control panels"
					href="/dashboard/gameops/"
					icon="gamepad"
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
			)}

			{/* KubeVirt VMs (staff only) */}
			{isStaff && (
				<ServiceCard
					title="Virtual Machines"
					description="KubeVirt build & dev VMs"
					href="/dashboard/vm/"
					icon="server"
					accentColor="#6366f1"
					status={vmStatus}>
					{vmStatus === 'loading' ? (
						<LoadingPlaceholder />
					) : vm ? (
						<>
							<MetricValue
								label="Running"
								value={vm.running}
								color={vm.running > 0 ? '#22c55e' : '#6b7280'}
							/>
							<MetricValue
								label="Stopped"
								value={vm.stopped}
								color={vm.stopped > 0 ? '#f59e0b' : '#6b7280'}
							/>
							<MetricValue
								label="Total"
								value={vm.total}
								color="#6366f1"
							/>
						</>
					) : (
						<UnavailableMessage />
					)}
				</ServiceCard>
			)}

			{/* Forgejo — Git hosting (staff only) */}
			{isStaff && (
				<ServiceCard
					title="Forgejo"
					description="Self-hosted Git repositories"
					href="/dashboard/forgejo/"
					icon="gitFork"
					accentColor="#e85d04"
					status={forgejoStatus}>
					{forgejoStatus === 'loading' ? (
						<LoadingPlaceholder />
					) : forgejo ? (
						<>
							<MetricValue
								label="Repos"
								value={forgejo.totalRepos}
								color="#e85d04"
							/>
							<MetricValue
								label="Private"
								value={forgejo.privateRepos}
								color="#8b5cf6"
							/>
							<MetricValue
								label="Mirrors"
								value={forgejo.mirrors}
								color="#06b6d4"
							/>
							<MetricValue
								label="Issues"
								value={forgejo.openIssues}
								color={
									forgejo.openIssues > 0
										? '#f59e0b'
										: '#22c55e'
								}
							/>
							<MetricValue
								label="PRs"
								value={forgejo.openPRs}
								color={
									forgejo.openPRs > 0 ? '#3b82f6' : '#6b7280'
								}
							/>
						</>
					) : (
						<UnavailableMessage />
					)}
				</ServiceCard>
			)}

			{/* Edge Functions */}
			<ServiceCard
				title="Edge Functions"
				description="Supabase serverless health"
				href="/dashboard/edge/"
				icon="zap"
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

			{/* ClickHouse Logs (staff only) */}
			{isStaff && (
				<ServiceCard
					title="Log Aggregation"
					description="ClickHouse cluster log analytics"
					href="/dashboard/clickhouse/"
					icon="database"
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
									clickhouse.errors > 0
										? '#ef4444'
										: '#22c55e'
								}
							/>
							<MetricValue
								label="Warns"
								value={clickhouse.warns}
								color={
									clickhouse.warns > 0 ? '#f59e0b' : '#22c55e'
								}
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
			)}

			{/* Security Audit */}
			<ServiceCard
				title="Security Audit"
				description="Daily vulnerability scan across all ecosystems"
				href="/dashboard/security/"
				icon="shield"
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
				icon="kanban"
				accentColor="#3b82f6"
				status={kanbanStatus}
				span={3}>
				{kanbanStatus === 'loading' ? (
					<LoadingPlaceholder />
				) : kanban ? (
					<div className="svc-stack">
						<div className="svc-stack__row">
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
				icon="report"
				accentColor="#a855f7"
				status={reportStatus}
				span={2}>
				{reportStatus === 'loading' ? (
					<LoadingPlaceholder />
				) : report ? (
					<div className="svc-stack">
						<div className="svc-stack__row">
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
							<div className="svc-langs">
								{report.topLanguages.map((l) => (
									<span key={l.name} className="svc-lang">
										{l.name}{' '}
										<span className="svc-lang__count">
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
				icon="graph"
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

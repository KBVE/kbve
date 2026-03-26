import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	$rowsHealth,
	$rowsHealthStatus,
	$fleetStatus,
	$activePlayers,
	$instanceLog,
	$deploymentInfo,
	fetchAll,
	statusColor,
	formatUptime,
	type ServiceStatus,
	type HealthCheck,
} from './rowsService';
import {
	Activity,
	Server,
	Users,
	Clock,
	CheckCircle2,
	XCircle,
	AlertTriangle,
	Loader2,
	RefreshCw,
	Database,
	Wifi,
	Box,
	Info,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const card: React.CSSProperties = {
	background: 'var(--sl-color-bg-nav, #161b22)',
	borderRadius: 12,
	border: '1px solid var(--sl-color-hairline, #30363d)',
	padding: '1.25rem',
	display: 'flex',
	flexDirection: 'column',
	gap: '0.75rem',
};

const cardTitle: React.CSSProperties = {
	fontSize: '0.85rem',
	fontWeight: 600,
	color: 'var(--sl-color-gray-2, #c9d1d9)',
	display: 'flex',
	alignItems: 'center',
	gap: 8,
};

const metric: React.CSSProperties = {
	fontSize: '1.75rem',
	fontWeight: 700,
	fontVariantNumeric: 'tabular-nums',
	color: 'var(--sl-color-text, #e6edf3)',
	lineHeight: 1.2,
};

const sub: React.CSSProperties = {
	fontSize: '0.75rem',
	color: 'var(--sl-color-gray-3, #8b949e)',
};

// ---------------------------------------------------------------------------
// Health Check Dot
// ---------------------------------------------------------------------------

function HealthDot({ check, label }: { check: HealthCheck; label: string }) {
	const color = check.ok ? '#3fb950' : '#f85149';
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
			<span
				style={{
					width: 10,
					height: 10,
					borderRadius: '50%',
					background: color,
					boxShadow: check.ok ? `0 0 6px ${color}` : 'none',
					flexShrink: 0,
				}}
			/>
			<span style={{ fontSize: '0.8rem', color: 'var(--sl-color-text)' }}>
				{label}
			</span>
			{check.latency_ms !== undefined && (
				<span style={sub}>{check.latency_ms}ms</span>
			)}
			{check.error && (
				<span style={{ ...sub, color: '#f85149' }}>{check.error}</span>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Deployment Info Card
// ---------------------------------------------------------------------------

function DeploymentCard() {
	const info = useStore($deploymentInfo);
	if (!info) return null;
	return (
		<div style={card}>
			<div style={cardTitle}>
				<Info size={16} /> Deployment
			</div>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
				<div>
					<div style={sub}>Version</div>
					<div
						style={{
							fontSize: '1.1rem',
							fontWeight: 600,
							color: 'var(--sl-color-text)',
						}}>
						v{info.version}
					</div>
				</div>
				<div>
					<div style={sub}>Fleet</div>
					<div
						style={{
							fontSize: '0.9rem',
							color: 'var(--sl-color-text)',
						}}>
						{info.agones_fleet}
					</div>
				</div>
				<div>
					<div style={sub}>Namespace</div>
					<div
						style={{
							fontSize: '0.9rem',
							color: 'var(--sl-color-text)',
						}}>
						{info.agones_namespace}
					</div>
				</div>
				<div>
					<div style={sub}>RabbitMQ</div>
					<div
						style={{
							fontSize: '0.9rem',
							color: info.rabbitmq_connected
								? '#3fb950'
								: '#f85149',
						}}>
						{info.rabbitmq_connected ? 'Connected' : 'Disconnected'}
					</div>
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Health Card
// ---------------------------------------------------------------------------

function HealthCard() {
	const health = useStore($rowsHealth);
	const status = useStore($rowsHealthStatus);
	if (!health) {
		return (
			<div style={card}>
				<div style={cardTitle}>
					<Activity size={16} /> System Health
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					{status === 'loading' ? (
						<Loader2 size={16} className="spin" />
					) : (
						<XCircle size={16} color="#f85149" />
					)}
					<span style={sub}>
						{status === 'loading'
							? 'Loading...'
							: 'Unable to reach ROWS'}
					</span>
				</div>
			</div>
		);
	}
	return (
		<div style={card}>
			<div
				style={{
					...cardTitle,
					justifyContent: 'space-between',
				}}>
				<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<Activity size={16} /> System Health
				</span>
				<span
					style={{
						fontSize: '0.75rem',
						fontWeight: 500,
						padding: '2px 8px',
						borderRadius: 6,
						background:
							status === 'ok'
								? 'rgba(63,185,80,0.15)'
								: 'rgba(210,153,34,0.15)',
						color: statusColor(status),
					}}>
					{health.status}
				</span>
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
					gap: 8,
				}}>
				<HealthDot check={health.checks.postgres} label="Postgres" />
				<HealthDot check={health.checks.rabbitmq} label="RabbitMQ" />
				<HealthDot check={health.checks.agones} label="Agones" />
				<HealthDot check={health.checks.valkey} label="Valkey" />
			</div>
			<div style={{ display: 'flex', gap: '1.5rem' }}>
				<div>
					<div style={sub}>Uptime</div>
					<div
						style={{
							color: 'var(--sl-color-text)',
							fontWeight: 600,
						}}>
						{formatUptime(health.uptime_seconds)}
					</div>
				</div>
				<div>
					<div style={sub}>Sessions</div>
					<div
						style={{
							color: 'var(--sl-color-text)',
							fontWeight: 600,
						}}>
						{health.active_sessions}
					</div>
				</div>
				<div>
					<div style={sub}>Instances</div>
					<div
						style={{
							color: 'var(--sl-color-text)',
							fontWeight: 600,
						}}>
						{health.active_instances}
					</div>
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Fleet Status Card
// ---------------------------------------------------------------------------

function FleetCard() {
	const fleet = useStore($fleetStatus);
	if (!fleet) return null;

	const stateColor = (state: string) => {
		switch (state) {
			case 'Ready':
				return '#3fb950';
			case 'Allocated':
				return '#58a6ff';
			case 'Shutdown':
				return '#8b949e';
			default:
				return '#d29922';
		}
	};

	return (
		<div style={card}>
			<div style={cardTitle}>
				<Server size={16} /> Fleet: {fleet.fleet_name}
			</div>
			<div style={{ display: 'flex', gap: '1.5rem' }}>
				<div>
					<div style={metric}>{fleet.ready}</div>
					<div style={sub}>Ready</div>
				</div>
				<div>
					<div style={{ ...metric, color: '#58a6ff' }}>
						{fleet.allocated}
					</div>
					<div style={sub}>Allocated</div>
				</div>
				<div>
					<div style={{ ...metric, color: '#8b949e' }}>
						{fleet.shutdown}
					</div>
					<div style={sub}>Shutdown</div>
				</div>
			</div>
			{fleet.game_servers.length > 0 && (
				<div
					style={{
						maxHeight: 200,
						overflowY: 'auto',
						fontSize: '0.8rem',
					}}>
					<table
						style={{
							width: '100%',
							borderCollapse: 'collapse',
							color: 'var(--sl-color-text)',
						}}>
						<thead>
							<tr
								style={{
									borderBottom:
										'1px solid var(--sl-color-hairline)',
								}}>
								<th style={{ textAlign: 'left', padding: 4 }}>
									Server
								</th>
								<th style={{ textAlign: 'left', padding: 4 }}>
									State
								</th>
								<th style={{ textAlign: 'left', padding: 4 }}>
									Map
								</th>
								<th style={{ textAlign: 'right', padding: 4 }}>
									Players
								</th>
							</tr>
						</thead>
						<tbody>
							{fleet.game_servers.map((gs) => (
								<tr
									key={gs.name}
									style={{
										borderBottom:
											'1px solid var(--sl-color-hairline, #21262d)',
									}}>
									<td
										style={{
											padding: 4,
											fontFamily: 'monospace',
											fontSize: '0.75rem',
										}}>
										{gs.name.slice(-12)}
									</td>
									<td style={{ padding: 4 }}>
										<span
											style={{
												color: stateColor(gs.state),
											}}>
											{gs.state}
										</span>
									</td>
									<td style={{ padding: 4 }}>
										{gs.map_name || '—'}
									</td>
									<td
										style={{
											padding: 4,
											textAlign: 'right',
										}}>
										{gs.players}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Active Players Card
// ---------------------------------------------------------------------------

function PlayersCard() {
	const players = useStore($activePlayers);
	if (!players) return null;
	return (
		<div style={card}>
			<div style={cardTitle}>
				<Users size={16} /> Active Players
			</div>
			<div style={metric}>{players.total}</div>
			{players.players.length > 0 && (
				<div
					style={{
						maxHeight: 200,
						overflowY: 'auto',
						fontSize: '0.8rem',
					}}>
					{players.players.map((p) => (
						<div
							key={p.user_session_guid}
							style={{
								display: 'flex',
								justifyContent: 'space-between',
								padding: '4px 0',
								borderBottom:
									'1px solid var(--sl-color-hairline, #21262d)',
								color: 'var(--sl-color-text)',
							}}>
							<span style={{ fontWeight: 500 }}>
								{p.character_name}
							</span>
							<span style={sub}>{p.zone_name}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Instance Timeline Card
// ---------------------------------------------------------------------------

function TimelineCard() {
	const log = useStore($instanceLog);
	if (!log || log.events.length === 0) return null;

	const eventColor = (e: string) =>
		e === 'allocated'
			? '#3fb950'
			: e === 'deallocated'
				? '#f85149'
				: '#d29922';

	return (
		<div style={card}>
			<div style={cardTitle}>
				<Clock size={16} /> Instance Timeline
			</div>
			<div
				style={{
					maxHeight: 250,
					overflowY: 'auto',
					fontSize: '0.8rem',
				}}>
				{log.events.map((ev, i) => (
					<div
						key={`${ev.timestamp}-${i}`}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							padding: '4px 0',
							borderBottom:
								'1px solid var(--sl-color-hairline, #21262d)',
							color: 'var(--sl-color-text)',
						}}>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: '50%',
								background: eventColor(ev.event),
								flexShrink: 0,
							}}
						/>
						<span style={{ fontFamily: 'monospace', ...sub }}>
							{new Date(ev.timestamp).toLocaleTimeString()}
						</span>
						<span style={{ fontWeight: 500 }}>{ev.event}</span>
						<span style={sub}>{ev.map_name}</span>
						<span style={{ marginLeft: 'auto', ...sub }}>
							{ev.game_server?.slice(-8) || ''}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------

export default function ReactRowsDashboard() {
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetchAll().finally(() => setLoading(false));
		const interval = setInterval(fetchAll, 30_000);
		return () => clearInterval(interval);
	}, []);

	if (loading) {
		return (
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					minHeight: '40vh',
					gap: 12,
					color: 'var(--sl-color-gray-3)',
				}}>
				<Loader2 size={24} className="spin" />
				<span>Loading ROWS dashboard...</span>
			</div>
		);
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
			{/* Row 1: Deployment + Health */}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
					gap: '1rem',
				}}>
				<DeploymentCard />
				<HealthCard />
			</div>

			{/* Row 2: Fleet + Players */}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
					gap: '1rem',
				}}>
				<FleetCard />
				<PlayersCard />
			</div>

			{/* Row 3: Timeline */}
			<TimelineCard />
		</div>
	);
}

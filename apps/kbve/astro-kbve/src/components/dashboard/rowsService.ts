import { atom } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';

// ---------------------------------------------------------------------------
// Types — match the ROWS /api/System/* response shapes
// ---------------------------------------------------------------------------

export type ServiceStatus = 'ok' | 'error' | 'loading' | 'degraded';

export interface HealthCheck {
	ok: boolean;
	latency_ms?: number;
	error?: string;
}

export interface RowsHealth {
	status: string;
	version: string;
	uptime_seconds: number;
	checks: {
		postgres: HealthCheck;
		rabbitmq: HealthCheck;
		agones: HealthCheck;
		valkey: HealthCheck;
	};
	active_sessions: number;
	active_instances: number;
}

export interface GameServer {
	name: string;
	state: string;
	address: string;
	port: number;
	zone_instance_id: number | null;
	map_name: string;
	players: number;
	age_seconds: number;
}

export interface FleetStatus {
	fleet_name: string;
	namespace: string;
	ready: number;
	allocated: number;
	shutdown: number;
	desired: number;
	game_servers: GameServer[];
}

export interface ActivePlayer {
	character_name: string;
	user_session_guid: string;
	zone_name: string;
	zone_instance_id: number;
	login_at: string;
}

export interface ActivePlayers {
	total: number;
	players: ActivePlayer[];
}

export interface InstanceEvent {
	timestamp: string;
	event: string;
	zone_instance_id: number;
	map_name: string;
	game_server: string;
	trigger: string;
}

export interface InstanceLog {
	events: InstanceEvent[];
}

export interface DeploymentInfo {
	version: string;
	build_timestamp: string;
	rust_version: string;
	agones_namespace: string;
	agones_fleet: string;
	database_host: string;
	rabbitmq_connected: boolean;
	http_port: number;
	swagger_port: number;
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export const $rowsHealth = atom<RowsHealth | null>(null);
export const $rowsHealthStatus = atom<ServiceStatus>('loading');
export const $fleetStatus = atom<FleetStatus | null>(null);
export const $activePlayers = atom<ActivePlayers | null>(null);
export const $instanceLog = atom<InstanceLog | null>(null);
export const $deploymentInfo = atom<DeploymentInfo | null>(null);

// ---------------------------------------------------------------------------
// Proxy base — goes through axum-kbve JWT-gated proxy
// ---------------------------------------------------------------------------

const PROXY_BASE = '/dashboard/chuckrpg/proxy';

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function getAuthHeaders(): Promise<Record<string, string>> {
	const supa = getSupa() ?? initSupa();
	if (!supa) return {};
	const {
		data: { session },
	} = await supa.auth.getSession();
	if (!session?.access_token) return {};
	return {
		Authorization: `Bearer ${session.access_token}`,
		'Content-Type': 'application/json',
	};
}

async function fetchRows<T>(path: string): Promise<T | null> {
	try {
		const headers = await getAuthHeaders();
		if (!headers.Authorization) return null;

		const resp = await fetch(`${PROXY_BASE}${path}`, { headers });
		if (!resp.ok) {
			console.warn(`[rows] ${path} returned ${resp.status}`);
			return null;
		}
		return (await resp.json()) as T;
	} catch (e) {
		console.error(`[rows] fetch ${path} failed:`, e);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Public fetch functions
// ---------------------------------------------------------------------------

export async function fetchHealth(): Promise<void> {
	$rowsHealthStatus.set('loading');
	const data = await fetchRows<RowsHealth>('/api/System/Health');
	if (data) {
		$rowsHealth.set(data);
		const allOk = Object.values(data.checks).every((c) => c.ok);
		$rowsHealthStatus.set(allOk ? 'ok' : 'degraded');
	} else {
		$rowsHealthStatus.set('error');
	}
}

export async function fetchFleetStatus(): Promise<void> {
	const data = await fetchRows<FleetStatus>('/api/System/FleetStatus');
	if (data) $fleetStatus.set(data);
}

export async function fetchActivePlayers(): Promise<void> {
	const data = await fetchRows<ActivePlayers>('/api/System/ActivePlayers');
	if (data) $activePlayers.set(data);
}

export async function fetchInstanceLog(): Promise<void> {
	const data = await fetchRows<InstanceLog>(
		'/api/System/InstanceLog?limit=50',
	);
	if (data) $instanceLog.set(data);
}

export async function fetchDeploymentInfo(): Promise<void> {
	const data = await fetchRows<DeploymentInfo>('/api/System/DeploymentInfo');
	if (data) $deploymentInfo.set(data);
}

/** Fetch all ROWS data in parallel. */
export async function fetchAll(): Promise<void> {
	await Promise.allSettled([
		fetchHealth(),
		fetchFleetStatus(),
		fetchActivePlayers(),
		fetchInstanceLog(),
		fetchDeploymentInfo(),
	]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function statusColor(status: ServiceStatus): string {
	switch (status) {
		case 'ok':
			return '#3fb950';
		case 'degraded':
			return '#d29922';
		case 'error':
			return '#f85149';
		default:
			return '#8b949e';
	}
}

export function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
}

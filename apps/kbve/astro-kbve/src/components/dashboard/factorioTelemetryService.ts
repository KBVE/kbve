import { atom } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';

// ---------------------------------------------------------------------------
// Types — match the axum-kbve /dashboard/clickhouse/proxy factorio_* commands
// (gameops.factorio_* tables). ClickHouse JSONEachRow can serialize UInt64 as
// strings, so numeric fields are coerced at the display layer, not here.
// ---------------------------------------------------------------------------

export type FetchStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface FactorioCurrent {
	server_id: string;
	scenario: string;
	rotation_id: string;
	seed: number | string;
	players: number | string;
	ups: number;
	map_age_game_s: number | string;
	map_age_wall_s: number | string;
	auto_pause_enabled: number | string;
	game_tick: number | string;
	ts: string;
}

export interface FactorioSnapshot {
	ts: string;
	server_id: string;
	players: number | string;
	ups: number;
	map_age_game_s: number | string;
	map_age_wall_s: number | string;
}

export interface FactorioPlayerEvent {
	ts: string;
	server_id: string;
	player: string;
	event: string;
	game_tick: number | string;
}

export interface FactorioRotation {
	rotation_id: string;
	server_id: string;
	scenario: string;
	seed: number | string;
	started_at: string;
	ended_at: string | null;
	end_reason: string;
	peak_players: number | string;
	joins_first_15m: number | string;
	joins_first_60m: number | string;
	total_player_seconds: number | string;
	wall_age_s: number | string;
	game_age_s: number | string;
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export const $current = atom<FactorioCurrent[] | null>(null);
export const $currentStatus = atom<FetchStatus>('idle');

export const $snapshots = atom<FactorioSnapshot[] | null>(null);
export const $snapshotsStatus = atom<FetchStatus>('idle');

export const $playerEvents = atom<FactorioPlayerEvent[] | null>(null);
export const $playerEventsStatus = atom<FetchStatus>('idle');

export const $rotations = atom<FactorioRotation[] | null>(null);
export const $rotationsStatus = atom<FetchStatus>('idle');

// ---------------------------------------------------------------------------
// Proxy + auth
// ---------------------------------------------------------------------------

const PROXY_URL = '/dashboard/clickhouse/proxy';

async function getAuthHeaders(): Promise<Record<string, string>> {
	const supa = getSupa() ?? initSupa();
	if (!supa) return {};
	const { session } = await supa.getSession();
	if (!session?.access_token) return {};
	return {
		Authorization: `Bearer ${session.access_token}`,
		'Content-Type': 'application/json',
	};
}

interface ProxyResponse<T> {
	rows: T[];
	count: number;
}

async function proxyCommand<T>(
	body: Record<string, unknown>,
): Promise<T[] | null> {
	const headers = await getAuthHeaders();
	if (!headers.Authorization) return null;
	try {
		const resp = await fetch(PROXY_URL, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(15000),
		});
		if (!resp.ok) {
			console.warn(
				`[factorio-telemetry] ${body.command} → HTTP ${resp.status}`,
			);
			return null;
		}
		const data = (await resp.json()) as ProxyResponse<T>;
		return data.rows ?? [];
	} catch (e) {
		console.error(`[factorio-telemetry] ${body.command} failed:`, e);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export async function fetchCurrent(serverId?: string): Promise<void> {
	$currentStatus.set('loading');
	const rows = await proxyCommand<FactorioCurrent>({
		command: 'factorio_current',
		minutes: 15,
		server_id: serverId,
	});
	if (rows === null) {
		$currentStatus.set('error');
		return;
	}
	$current.set(rows);
	$currentStatus.set('ok');
}

export async function fetchSnapshots(
	serverId?: string,
	minutes = 60,
): Promise<void> {
	$snapshotsStatus.set('loading');
	const rows = await proxyCommand<FactorioSnapshot>({
		command: 'factorio_snapshots',
		minutes,
		limit: 500,
		server_id: serverId,
	});
	if (rows === null) {
		$snapshotsStatus.set('error');
		return;
	}
	$snapshots.set(rows);
	$snapshotsStatus.set('ok');
}

export async function fetchPlayerEvents(serverId?: string): Promise<void> {
	$playerEventsStatus.set('loading');
	const rows = await proxyCommand<FactorioPlayerEvent>({
		command: 'factorio_players',
		minutes: 1440,
		limit: 50,
		server_id: serverId,
	});
	if (rows === null) {
		$playerEventsStatus.set('error');
		return;
	}
	$playerEvents.set(rows);
	$playerEventsStatus.set('ok');
}

export async function fetchRotations(serverId?: string): Promise<void> {
	$rotationsStatus.set('loading');
	const rows = await proxyCommand<FactorioRotation>({
		command: 'factorio_rotations',
		limit: 25,
		server_id: serverId,
	});
	if (rows === null) {
		$rotationsStatus.set('error');
		return;
	}
	$rotations.set(rows);
	$rotationsStatus.set('ok');
}

export async function fetchAll(serverId?: string): Promise<void> {
	await Promise.all([
		fetchCurrent(serverId),
		fetchSnapshots(serverId),
		fetchPlayerEvents(serverId),
		fetchRotations(serverId),
	]);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function num(v: number | string | null | undefined): number {
	if (v === null || v === undefined) return 0;
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : 0;
}

export function formatGameAge(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

export function isLive(
	row: FactorioCurrent | undefined,
	maxAgeMs = 60_000,
): boolean {
	if (!row) return false;
	const ts = new Date(row.ts.replace(' ', 'T') + 'Z').getTime();
	return Number.isFinite(ts) && Date.now() - ts < maxAgeMs;
}

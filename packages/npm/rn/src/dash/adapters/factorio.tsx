import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../../ui';
import type { BadgeTone } from '../../ui';
import { createStreamSource } from '../createStreamSource';
import type { StreamLens, StreamStore } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawCurrent {
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

export interface FactorioServerItem {
	id: string;
	serverId: string;
	scenario: string;
	rotationId: string;
	seed: string;
	players: number;
	ups: number;
	mapAgeGameHours: number;
	mapAgeWallHours: number;
	isLive: boolean;
	lastSeenAgo: string;
	timestamp: string;
}

export interface FactorioStreamOptions {
	/** Returns a fresh bearer token (Supabase access token). */
	getToken: () => Promise<string | null>;
	/** Origin for the proxy. '' (relative) on web, absolute URL on mobile. */
	baseUrl?: string;
	pollMs?: number;
	/** Minutes window for "current" servers */
	minutes?: number;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalize(raw: RawCurrent): FactorioServerItem {
	const players =
		typeof raw.players === 'number'
			? raw.players
			: parseInt(String(raw.players), 10) || 0;
	const mapAgeGameS =
		typeof raw.map_age_game_s === 'number'
			? raw.map_age_game_s
			: parseInt(String(raw.map_age_game_s), 10) || 0;
	const mapAgeWallS =
		typeof raw.map_age_wall_s === 'number'
			? raw.map_age_wall_s
			: parseInt(String(raw.map_age_wall_s), 10) || 0;

	const mapAgeGameHours = Math.floor(mapAgeGameS / 3600);
	const mapAgeWallHours = Math.floor(mapAgeWallS / 3600);

	const seed =
		typeof raw.seed === 'number'
			? String(raw.seed)
			: String(raw.seed || '');

	// Check if live (within last 60s)
	const ts = new Date(raw.ts.replace(' ', 'T') + 'Z').getTime();
	const isLive = Number.isFinite(ts) && Date.now() - ts < 60_000;

	const lastSeenAgo = formatAgo(raw.ts);

	return {
		id: `${raw.server_id}:${raw.rotation_id}`,
		serverId: raw.server_id,
		scenario: raw.scenario,
		rotationId: raw.rotation_id,
		seed,
		players,
		ups: raw.ups,
		mapAgeGameHours,
		mapAgeWallHours,
		isLive,
		lastSeenAgo,
		timestamp: raw.ts,
	};
}

function formatAgo(ts: string): string {
	try {
		const then = new Date(ts.replace(' ', 'T') + 'Z').getTime();
		const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
		if (diffSec < 60) return `${diffSec}s ago`;
		const diffMin = Math.round(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.round(diffMin / 60);
		return `${diffHr}h ago`;
	} catch {
		return ts;
	}
}

// ---------------------------------------------------------------------------
// Stream Source
// ---------------------------------------------------------------------------

export function createFactorioStream(
	opts: FactorioStreamOptions,
): StreamStore<FactorioServerItem> {
	const { getToken, baseUrl = '', pollMs = 30_000, minutes = 15 } = opts;

	return createStreamSource<RawCurrent, FactorioServerItem>({
		key: 'factorio:current',
		pollMs,
		cacheTtlMs: 60_000,
		id: (it) => it.id,
		signature: (it) =>
			`${it.players}|${it.ups}|${it.isLive}|${it.timestamp}`,
		normalize,
		fetch: async ({ signal }) => {
			const token = await getToken();
			const body = {
				command: 'factorio_current',
				minutes,
			};

			const res = await fetch(`${baseUrl}/dashboard/clickhouse/proxy`, {
				method: 'POST',
				headers: {
					...(token ? { Authorization: `Bearer ${token}` } : {}),
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
				signal,
			});

			if (res.status === 403) throw new Error('Access restricted');
			if (!res.ok)
				throw new Error(`Factorio telemetry API error: ${res.status}`);

			const json = (await res.json()) as { rows?: RawCurrent[] };
			const raw = json?.rows ?? [];

			// Sort by players descending (most active first)
			return raw.sort((a, b) => {
				const aPlayers =
					typeof a.players === 'number'
						? a.players
						: parseInt(String(a.players), 10) || 0;
				const bPlayers =
					typeof b.players === 'number'
						? b.players
						: parseInt(String(b.players), 10) || 0;
				return bPlayers - aPlayers;
			});
		},
	});
}

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

function liveTone(isLive: boolean): BadgeTone {
	return isLive ? 'success' : 'neutral';
}

function liveColor(isLive: boolean): string {
	return isLive ? tokens.color.success : tokens.color.textFaint;
}

function upsColor(ups: number): string {
	if (ups >= 59) return tokens.color.success;
	if (ups >= 50) return tokens.color.warning;
	return tokens.color.danger;
}

export const factorioLens: StreamLens<FactorioServerItem> = {
	searchText: (it) => `${it.serverId} ${it.scenario} ${it.rotationId}`,
	group: (it) => (it.isLive ? 'Live' : 'Offline'),
	filters: [
		{
			id: 'live',
			label: 'Live',
			tone: 'success',
			predicate: (it) => it.isLive,
		},
		{
			id: 'with_players',
			label: 'With Players',
			tone: 'success',
			predicate: (it) => it.players > 0,
		},
		{
			id: 'offline',
			label: 'Offline',
			tone: 'neutral',
			predicate: (it) => !it.isLive,
		},
	],
	stats: (items) => [
		{ id: 'total', label: 'Servers', value: items.length },
		{
			id: 'live',
			label: 'Live',
			tone: 'success',
			value: items.filter((i) => i.isLive).length,
		},
		{
			id: 'players',
			label: 'Total Players',
			tone: 'success',
			value: items.reduce((sum, i) => sum + i.players, 0),
		},
		{
			id: 'avg_ups',
			label: 'Avg UPS',
			value: Math.round(
				items.reduce((sum, i) => sum + i.ups, 0) /
					Math.max(1, items.length),
			),
		},
	],
	row: (it) => (
		<Surface padded={false} style={styles.row}>
			<View
				style={[
					styles.statusDot,
					{ backgroundColor: liveColor(it.isLive) },
				]}
			/>
			<Stack gap="xs" style={styles.rowContent}>
				<Stack direction="row" align="center" gap="xs" wrap>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{it.serverId}
					</Text>
					<Badge
						label={it.isLive ? 'Live' : 'Offline'}
						tone={liveTone(it.isLive)}
					/>
					{it.players > 0 && (
						<Badge
							label={`${it.players} player${it.players > 1 ? 's' : ''}`}
							tone="success"
						/>
					)}
				</Stack>
				<Text variant="caption" tone="muted" numberOfLines={1}>
					{it.scenario} · Rotation {it.rotationId}
				</Text>
				<Text variant="caption" tone="faint">
					UPS:{' '}
					<Text style={{ color: upsColor(it.ups) }}>{it.ups}</Text> ·
					Map Age: {it.mapAgeGameHours}h · Last seen {it.lastSeenAgo}
				</Text>
			</Stack>
		</Surface>
	),
	card: (it) => (
		<Surface style={styles.card}>
			<Stack gap="sm">
				<Stack direction="row" align="center" gap="xs">
					<View
						style={[
							styles.statusDot,
							{ backgroundColor: liveColor(it.isLive) },
						]}
					/>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{it.serverId}
					</Text>
				</Stack>
				<Stack direction="row" gap="sm" wrap>
					<Badge
						label={it.isLive ? 'Live' : 'Offline'}
						tone={liveTone(it.isLive)}
					/>
					{it.players > 0 && (
						<Badge
							label={`${it.players} player${it.players > 1 ? 's' : ''}`}
							tone="success"
						/>
					)}
				</Stack>
				<Text variant="caption" tone="muted">
					{it.scenario}
				</Text>
				<Text variant="caption" tone="faint">
					UPS:{' '}
					<Text style={{ color: upsColor(it.ups) }}>{it.ups}</Text>
				</Text>
				<Text variant="caption" tone="faint">
					Map Age: {it.mapAgeGameHours}h game / {it.mapAgeWallHours}h
					wall
				</Text>
				<Text variant="caption" tone="faint">
					Rotation: {it.rotationId}
				</Text>
				<Text variant="caption" tone="faint">
					Last seen {it.lastSeenAgo}
				</Text>
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Server ID" value={it.serverId} />
			<Fact label="Status" value={it.isLive ? 'LIVE' : 'OFFLINE'} />
			<Fact label="Scenario" value={it.scenario} />
			<Fact label="Rotation ID" value={it.rotationId} />
			<Fact label="Seed" value={it.seed} />
			<Fact label="Players" value={String(it.players)} />
			<Fact label="UPS" value={String(it.ups)} />
			<Fact
				label="Map Age (Game)"
				value={`${it.mapAgeGameHours} hours`}
			/>
			<Fact
				label="Map Age (Wall)"
				value={`${it.mapAgeWallHours} hours`}
			/>
			<Fact label="Last Seen" value={it.lastSeenAgo} />
			<Fact
				label="Timestamp"
				value={new Date(it.timestamp).toLocaleString()}
			/>
		</Stack>
	),
};

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<Stack direction="row" gap="sm" justify="space-between">
			<Text variant="caption" tone="muted">
				{label}
			</Text>
			<Text variant="caption" numberOfLines={1} style={styles.factValue}>
				{value}
			</Text>
		</Stack>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.md,
		paddingVertical: tokens.space.sm,
	},
	rowContent: {
		flexShrink: 1,
		flexGrow: 1,
	},
	card: {
		padding: tokens.space.md,
	},
	statusDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		flexShrink: 0,
	},
	name: {
		flexShrink: 1,
	},
	factValue: {
		flexShrink: 1,
		textAlign: 'right',
	},
});

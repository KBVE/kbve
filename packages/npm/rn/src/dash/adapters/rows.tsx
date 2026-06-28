import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../../ui';
import type { BadgeTone } from '../../ui';
import { createStreamSource } from '../createStreamSource';
import type { StreamLens, StreamStore } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServerState = 'Ready' | 'Allocated' | 'Shutdown' | 'Unknown';

interface RawGameServer {
	name: string;
	state: string;
	address: string;
	port: number;
	zone_instance_id: number | null;
	map_name: string;
	players: number;
	age_seconds: number;
}

export interface GameServerItem {
	id: string;
	name: string;
	state: ServerState;
	address: string;
	port: number;
	zoneInstanceId: number | null;
	mapName: string;
	players: number;
	ageMinutes: number;
}

export interface RowsStreamOptions {
	/** Returns a fresh bearer token (Supabase access token). */
	getToken: () => Promise<string | null>;
	/** Origin for the proxy. '' (relative) on web, absolute URL on mobile. */
	baseUrl?: string;
	pollMs?: number;
	/** ChuckRPG tenant ID */
	tenantId?: string;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeState(state: string): ServerState {
	const s = state.toLowerCase();
	if (s.includes('ready')) return 'Ready';
	if (s.includes('allocated')) return 'Allocated';
	if (s.includes('shutdown')) return 'Shutdown';
	return 'Unknown';
}

function normalize(raw: RawGameServer): GameServerItem {
	return {
		id: raw.name,
		name: raw.name,
		state: normalizeState(raw.state),
		address: raw.address,
		port: raw.port,
		zoneInstanceId: raw.zone_instance_id,
		mapName: raw.map_name,
		players: raw.players,
		ageMinutes: Math.floor(raw.age_seconds / 60),
	};
}

// ---------------------------------------------------------------------------
// Stream Source
// ---------------------------------------------------------------------------

export function createRowsStream(
	opts: RowsStreamOptions,
): StreamStore<GameServerItem> {
	const { getToken, baseUrl = '', pollMs = 30_000, tenantId } = opts;

	const proxyBase = tenantId
		? `${baseUrl}/dashboard/chuckrpg/proxy/${encodeURIComponent(tenantId)}`
		: `${baseUrl}/dashboard/chuckrpg/proxy`;

	return createStreamSource<RawGameServer, GameServerItem>({
		key: `rows:${tenantId ?? 'default'}`,
		pollMs,
		cacheTtlMs: 60_000,
		id: (it) => it.id,
		signature: (it) =>
			`${it.state}|${it.players}|${it.zoneInstanceId}|${it.ageMinutes}`,
		normalize,
		fetch: async ({ signal }) => {
			const token = await getToken();
			const res = await fetch(`${proxyBase}/api/System/FleetStatus`, {
				headers: token
					? { Authorization: `Bearer ${token}` }
					: undefined,
				signal,
			});

			if (res.status === 403) throw new Error('Access restricted');
			if (res.status === 502) throw new Error('ROWS backend unreachable');
			if (res.status === 503)
				throw new Error('ROWS proxy not configured');
			if (!res.ok) throw new Error(`ROWS API error: ${res.status}`);

			const json = (await res.json()) as {
				game_servers?: RawGameServer[];
			};
			const raw = json?.game_servers ?? [];

			// Sort by state (Allocated > Ready > Shutdown) then by age
			return raw.sort((a, b) => {
				const stateOrder = { Allocated: 0, Ready: 1, Shutdown: 2 };
				const aState = normalizeState(a.state);
				const bState = normalizeState(b.state);
				const aOrd = stateOrder[aState] ?? 99;
				const bOrd = stateOrder[bState] ?? 99;
				if (aOrd !== bOrd) return aOrd - bOrd;
				return b.age_seconds - a.age_seconds;
			});
		},
	});
}

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

function stateTone(state: ServerState): BadgeTone {
	if (state === 'Allocated') return 'success';
	if (state === 'Ready') return 'primary';
	if (state === 'Shutdown') return 'neutral';
	return 'neutral';
}

function stateColor(state: ServerState): string {
	if (state === 'Allocated') return tokens.color.success;
	if (state === 'Ready') return tokens.color.primary;
	if (state === 'Shutdown') return tokens.color.textFaint;
	return tokens.color.textFaint;
}

export const rowsLens: StreamLens<GameServerItem> = {
	searchText: (it) => `${it.name} ${it.mapName} ${it.state}`,
	group: (it) => it.state,
	filters: [
		{
			id: 'allocated',
			label: 'Allocated',
			tone: 'success',
			predicate: (it) => it.state === 'Allocated',
		},
		{
			id: 'ready',
			label: 'Ready',
			tone: 'primary',
			predicate: (it) => it.state === 'Ready',
		},
		{
			id: 'shutdown',
			label: 'Shutdown',
			tone: 'neutral',
			predicate: (it) => it.state === 'Shutdown',
		},
		{
			id: 'with_players',
			label: 'With Players',
			tone: 'success',
			predicate: (it) => it.players > 0,
		},
	],
	stats: (items) => [
		{ id: 'total', label: 'Total Servers', value: items.length },
		{
			id: 'allocated',
			label: 'Allocated',
			tone: 'success',
			value: items.filter((i) => i.state === 'Allocated').length,
		},
		{
			id: 'ready',
			label: 'Ready',
			tone: 'primary',
			value: items.filter((i) => i.state === 'Ready').length,
		},
		{
			id: 'players',
			label: 'Total Players',
			tone: 'success',
			value: items.reduce((sum, i) => sum + i.players, 0),
		},
	],
	row: (it) => (
		<Surface padded={false} style={styles.row}>
			<View
				style={[
					styles.statusDot,
					{ backgroundColor: stateColor(it.state) },
				]}
			/>
			<Stack gap="xs" style={styles.rowContent}>
				<Stack direction="row" align="center" gap="xs" wrap>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{it.name}
					</Text>
					<Badge label={it.state} tone={stateTone(it.state)} />
					{it.players > 0 && (
						<Badge
							label={`${it.players} player${it.players > 1 ? 's' : ''}`}
							tone="success"
						/>
					)}
				</Stack>
				<Text variant="caption" tone="muted" numberOfLines={1}>
					{it.mapName}
					{it.zoneInstanceId !== null
						? ` (instance ${it.zoneInstanceId})`
						: ''}
				</Text>
				<Text variant="caption" tone="faint">
					{it.address}:{it.port} · {it.ageMinutes}m old
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
							{ backgroundColor: stateColor(it.state) },
						]}
					/>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{it.name}
					</Text>
				</Stack>
				<Stack direction="row" gap="sm" wrap>
					<Badge label={it.state} tone={stateTone(it.state)} />
					{it.players > 0 && (
						<Badge
							label={`${it.players} player${it.players > 1 ? 's' : ''}`}
							tone="success"
						/>
					)}
				</Stack>
				<Text variant="caption" tone="muted">
					{it.mapName}
				</Text>
				<Text variant="caption" tone="faint">
					{it.address}:{it.port}
				</Text>
				<Text variant="caption" tone="faint">
					Age: {it.ageMinutes}m
				</Text>
				{it.zoneInstanceId !== null && (
					<Text variant="caption" tone="faint">
						Zone Instance: {it.zoneInstanceId}
					</Text>
				)}
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Name" value={it.name} />
			<Fact label="State" value={it.state.toUpperCase()} />
			<Fact label="Map" value={it.mapName} />
			<Fact label="Address" value={`${it.address}:${it.port}`} />
			<Fact label="Players" value={String(it.players)} />
			<Fact label="Age" value={`${it.ageMinutes} minutes`} />
			{it.zoneInstanceId !== null && (
				<Fact label="Zone Instance" value={String(it.zoneInstanceId)} />
			)}
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

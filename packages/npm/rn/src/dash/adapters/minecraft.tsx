import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { BadgeTone } from '../_ui';
import { createStreamSource } from '../createStreamSource';
import type { StreamLens, StreamStore } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServerStatus = 'online' | 'offline' | 'unknown';

interface RawServer {
	name: string;
	host: string;
	port: number;
	players?: number;
	max_players?: number;
	version?: string;
	motd?: string;
	status: string;
	last_check?: string;
}

export interface MinecraftServerItem {
	id: string;
	name: string;
	host: string;
	port: number;
	players: number;
	maxPlayers: number;
	version: string;
	motd: string;
	status: ServerStatus;
	lastCheck: string;
}

export interface MinecraftStreamOptions {
	/** Returns a fresh bearer token (Supabase access token). */
	getToken: () => Promise<string | null>;
	/** Origin for the proxy. '' (relative) on web, absolute URL on mobile. */
	baseUrl?: string;
	pollMs?: number;
	/** List of servers to monitor */
	servers?: Array<{ name: string; host: string; port: number }>;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeStatus(status: string): ServerStatus {
	const s = status.toLowerCase();
	if (s.includes('online') || s.includes('up')) return 'online';
	if (s.includes('offline') || s.includes('down')) return 'offline';
	return 'unknown';
}

function normalize(raw: RawServer): MinecraftServerItem {
	return {
		id: raw.name,
		name: raw.name,
		host: raw.host,
		port: raw.port,
		players: raw.players ?? 0,
		maxPlayers: raw.max_players ?? 0,
		version: raw.version ?? 'Unknown',
		motd: raw.motd ?? '',
		status: normalizeStatus(raw.status),
		lastCheck: raw.last_check ?? new Date().toISOString(),
	};
}

// ---------------------------------------------------------------------------
// Stream Source
// ---------------------------------------------------------------------------

export function createMinecraftStream(
	opts: MinecraftStreamOptions,
): StreamStore<MinecraftServerItem> {
	const {
		getToken,
		baseUrl = '',
		pollMs = 30_000,
		servers = [
			{ name: 'velocity', host: 'velocity.kbve.com', port: 25565 },
			{ name: 'lobby', host: 'lobby.kbve.com', port: 25565 },
			{ name: 'worldedit', host: 'worldedit.kbve.com', port: 25565 },
			{ name: 'survival', host: 'survival.kbve.com', port: 25565 },
		],
	} = opts;

	return createStreamSource<MinecraftServerItem, MinecraftServerItem>({
		key: 'minecraft:servers',
		pollMs,
		cacheTtlMs: 60_000,
		id: (it) => it.id,
		signature: (it) =>
			`${it.status}|${it.players}|${it.maxPlayers}|${it.version}`,
		normalize: (x) => x as MinecraftServerItem, // Normalized in fetch
		fetch: async ({ signal }) => {
			const token = await getToken();
			if (!token) throw new Error('Not authenticated');

			// Fetch status for each server in parallel
			const results = await Promise.allSettled(
				servers.map(async (srv) => {
					try {
						const res = await fetch(
							`${baseUrl}/api/v1/rcon/mc/${srv.name}/status`,
							{
								headers: {
									Authorization: `Bearer ${token}`,
								},
								signal,
							},
						);

						if (!res.ok) {
							return normalize({
								name: srv.name,
								host: srv.host,
								port: srv.port,
								status: 'offline',
								last_check: new Date().toISOString(),
							});
						}

						const json = (await res.json()) as {
							players?: number;
							max_players?: number;
							version?: string;
							motd?: string;
						};

						return normalize({
							name: srv.name,
							host: srv.host,
							port: srv.port,
							players: json.players,
							max_players: json.max_players,
							version: json.version,
							motd: json.motd,
							status: 'online',
							last_check: new Date().toISOString(),
						});
					} catch {
						return normalize({
							name: srv.name,
							host: srv.host,
							port: srv.port,
							status: 'offline',
							last_check: new Date().toISOString(),
						});
					}
				}),
			);

			return results
				.filter(
					(r): r is PromiseFulfilledResult<MinecraftServerItem> =>
						r.status === 'fulfilled',
				)
				.map((r) => r.value)
				.sort((a, b) => {
					// Sort: online > offline, then by players descending
					if (a.status !== b.status) {
						if (a.status === 'online') return -1;
						if (b.status === 'online') return 1;
					}
					return b.players - a.players;
				});
		},
	});
}

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

function statusTone(status: ServerStatus): BadgeTone {
	if (status === 'online') return 'success';
	if (status === 'offline') return 'neutral';
	return 'neutral';
}

function statusColor(status: ServerStatus): string {
	if (status === 'online') return tokens.color.success;
	if (status === 'offline') return tokens.color.textFaint;
	return tokens.color.textFaint;
}

export const minecraftLens: StreamLens<MinecraftServerItem> = {
	searchText: (it) => `${it.name} ${it.host} ${it.version} ${it.motd}`,
	group: (it) => (it.status === 'online' ? 'Online' : 'Offline'),
	filters: [
		{
			id: 'online',
			label: 'Online',
			tone: 'success',
			predicate: (it) => it.status === 'online',
		},
		{
			id: 'offline',
			label: 'Offline',
			tone: 'neutral',
			predicate: (it) => it.status === 'offline',
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
			id: 'online',
			label: 'Online',
			tone: 'success',
			value: items.filter((i) => i.status === 'online').length,
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
					{ backgroundColor: statusColor(it.status) },
				]}
			/>
			<Stack gap="xs" style={styles.rowContent}>
				<Stack direction="row" align="center" gap="xs" wrap>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{it.name}
					</Text>
					<Badge
						label={it.status.toUpperCase()}
						tone={statusTone(it.status)}
					/>
					{it.players > 0 && (
						<Badge
							label={`${it.players}/${it.maxPlayers}`}
							tone="success"
						/>
					)}
				</Stack>
				{it.motd && (
					<Text variant="caption" tone="muted" numberOfLines={1}>
						{it.motd}
					</Text>
				)}
				<Text variant="caption" tone="faint">
					{it.host}:{it.port} · {it.version}
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
							{ backgroundColor: statusColor(it.status) },
						]}
					/>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{it.name}
					</Text>
				</Stack>
				<Stack direction="row" gap="sm" wrap>
					<Badge
						label={it.status.toUpperCase()}
						tone={statusTone(it.status)}
					/>
					{it.players > 0 && (
						<Badge
							label={`${it.players}/${it.maxPlayers} players`}
							tone="success"
						/>
					)}
				</Stack>
				{it.motd && (
					<Text variant="caption" tone="muted">
						{it.motd}
					</Text>
				)}
				<Text variant="caption" tone="faint">
					{it.host}:{it.port}
				</Text>
				<Text variant="caption" tone="faint">
					Version: {it.version}
				</Text>
				<Text variant="caption" tone="faint">
					Last check: {new Date(it.lastCheck).toLocaleTimeString()}
				</Text>
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Name" value={it.name} />
			<Fact label="Status" value={it.status.toUpperCase()} />
			<Fact label="Host" value={`${it.host}:${it.port}`} />
			<Fact label="Version" value={it.version} />
			<Fact label="Players" value={`${it.players} / ${it.maxPlayers}`} />
			{it.motd && <Fact label="MOTD" value={it.motd} />}
			<Fact
				label="Last Check"
				value={new Date(it.lastCheck).toLocaleString()}
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

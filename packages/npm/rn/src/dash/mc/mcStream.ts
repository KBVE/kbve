import { createStreamSource } from '../createStreamSource';
import type { StreamStore } from '../types';
import { MC_SERVER_ORDER } from './labels';

export interface McPlayer {
	name: string;
	uuid: string | null;
	skinUrl: string | null;
	server: string;
}

export interface McServerItem {
	id: string;
	name: string;
	online: number;
	max: number;
	reachable: boolean;
	players: McPlayer[];
	cachedAt: number;
}

export interface RawMcPlayerList {
	online: number;
	max: number;
	players: {
		name: string;
		uuid: string | null;
		skin_url: string | null;
		server: string;
	}[];
	servers: {
		server: string;
		online: number;
		max: number;
		reachable: boolean;
	}[];
	cached_at: number;
}

export function mapPlayerList(raw: RawMcPlayerList): McServerItem[] {
	const rank = (s: string) => {
		const i = MC_SERVER_ORDER.indexOf(s);
		return i === -1 ? MC_SERVER_ORDER.length : i;
	};
	return (raw.servers ?? [])
		.map((s) => ({
			id: s.server,
			name: s.server,
			online: s.online,
			max: s.max,
			reachable: s.reachable,
			players: (raw.players ?? [])
				.filter((p) => p.server === s.server)
				.map((p) => ({
					name: p.name,
					uuid: p.uuid,
					skinUrl: p.skin_url,
					server: p.server,
				})),
			cachedAt: raw.cached_at,
		}))
		.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

export interface McStreamOptions {
	baseUrl?: string;
	pollMs?: number;
}

export function createMcStream(
	opts: McStreamOptions = {},
): StreamStore<McServerItem> {
	const { baseUrl = '', pollMs = 15_000 } = opts;
	return createStreamSource<McServerItem, McServerItem>({
		key: 'mc:servers',
		pollMs,
		cacheTtlMs: 60_000,
		id: (it) => it.id,
		signature: (it) =>
			`${it.reachable}|${it.online}|${it.max}|${it.players
				.map((p) => p.name)
				.join(',')}`,
		normalize: (x) => x,
		fetch: async ({ signal }) => {
			const res = await fetch(`${baseUrl}/api/v1/mc/players`, { signal });
			if (!res.ok) throw new Error(`MC status error: ${res.status}`);
			const json = (await res.json()) as RawMcPlayerList;
			return mapPlayerList(json);
		},
	});
}

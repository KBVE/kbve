import type { ServerCard, SortOption } from './types';
import { CATEGORIES } from './types';
import { listServers } from './discordshEdge';

// ── Category mapping ────────────────────────────────────────────────
// The DB uses 1-based integer category IDs matching CATEGORIES array order.

const CATEGORY_TO_INT = new Map(
	CATEGORIES.map((c, i) => [c.id, i + 1] as const),
);

// ── Data fetching ───────────────────────────────────────────────────
// Fetches from the edge function (server-side pagination).
// Falls back to static JSON if the edge call fails.

export async function fetchServers(opts?: {
	category?: string;
	sort?: SortOption;
	page?: number;
	limit?: number;
}): Promise<{ servers: ServerCard[]; total: number }> {
	try {
		const result = await listServers({
			limit: opts?.limit ?? 24,
			page: opts?.page ?? 1,
			sort: opts?.sort ?? 'votes',
			category: opts?.category
				? (CATEGORY_TO_INT.get(opts.category) ?? null)
				: null,
		});

		if (result.success) {
			return {
				servers: (result.servers as ServerCard[]) ?? [],
				total: (result.total as number) ?? 0,
			};
		}
		console.warn(
			'[fetchServers] Edge error, falling back to static JSON:',
			result.error,
		);
	} catch (err) {
		console.warn(
			'[fetchServers] Edge unreachable, falling back to static JSON:',
			err,
		);
	}

	return fetchServersStatic(opts);
}

// Static JSON fallback for development / offline
async function fetchServersStatic(opts?: {
	category?: string;
	sort?: SortOption;
	page?: number;
	limit?: number;
}): Promise<{ servers: ServerCard[]; total: number }> {
	const res = await fetch('/data/servers.json');
	let servers: ServerCard[] = await res.json();

	if (opts?.category) {
		servers = servers.filter((s) => s.categories.includes(opts.category!));
	}

	const sort = opts?.sort ?? 'votes';
	servers.sort((a, b) => {
		switch (sort) {
			case 'votes':
				return b.vote_count - a.vote_count;
			case 'members':
				return b.member_count - a.member_count;
			default:
				return b.vote_count - a.vote_count;
		}
	});

	const page = opts?.page ?? 1;
	const limit = opts?.limit ?? 24;
	const start = (page - 1) * limit;
	const total = servers.length;

	return {
		servers: servers.slice(start, start + limit),
		total,
	};
}

// ── Helpers ─────────────────────────────────────────────────────────

export function buildInviteUrl(code: string): string {
	return `https://discord.gg/${code}`;
}

export function formatMemberCount(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
	return count.toString();
}

import type { ServerCard, SortOption } from './types';

// ── Data fetching ───────────────────────────────────────────────────
// Phase 1: loads from static JSON.
// Phase 2: swap to getSupa().client.rpc('discordsh_list_servers', {...})

export async function fetchServers(opts?: {
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

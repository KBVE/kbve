import type { ServerCard, SortOption } from './types';
import { CATEGORIES } from './types';
import { listServers as listServersAxum } from './discordshEdge';

// ── Category mapping ────────────────────────────────────────────────
// The DB uses 1-based integer category IDs matching CATEGORIES array order.

const CATEGORY_TO_INT = new Map(
	CATEGORIES.map((c, i) => [c.id, i + 1] as const),
);

// ── Data fetching waterfall ─────────────────────────────────────────
// 1. IndexedDB cache (5min TTL)
// 2. Axum backend /api/servers/list
// 3. Supabase edge function (future fallback)
// 4. Static JSON (offline/dev)

export async function fetchServers(opts?: {
	category?: string;
	sort?: SortOption;
	page?: number;
	limit?: number;
}): Promise<{ servers: ServerCard[]; total: number }> {
	const category = opts?.category;
	const sort = opts?.sort ?? 'votes';
	const page = opts?.page ?? 1;
	const limit = opts?.limit ?? 24;

	// Layer 1: Axum backend (caching handled by TanStack Query)
	try {
		const result = await listServersAxum({
			limit,
			page,
			sort,
			category: category ? (CATEGORY_TO_INT.get(category) ?? null) : null,
		});

		if (result.success) {
			const data = {
				servers: (result.servers as ServerCard[]) ?? [],
				total: (result.total as number) ?? 0,
			};

			// Empty success (no rows yet / dev server) → keep falling back
			if (data.servers.length > 0) {
				console.info('[fetchServers] Fetched from Axum backend');
				return data;
			}
			console.warn(
				'[fetchServers] Axum returned 0 servers, falling back',
			);
		} else {
			console.warn(
				'[fetchServers] Axum error, falling back:',
				result.error,
			);
		}
	} catch (err) {
		console.warn('[fetchServers] Axum unreachable, falling back:', err);
	}

	// Layer 3: Supabase edge (future — currently skipped)
	// TODO: Add edge function fallback when needed

	// Layer 4: Static JSON fallback
	console.info('[fetchServers] Falling back to static JSON');
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
	// Scheme is pinned and the code is encoded — API data can never break
	// out of the discord.gg path.
	return `https://discord.gg/${encodeURIComponent(code)}`;
}

/** Allow only http(s) image URLs from API data; anything else is dropped. */
export function safeImageUrl(
	url: string | null | undefined,
): string | undefined {
	if (!url) return undefined;
	try {
		const parsed = new URL(url, window.location.origin);
		if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
			return parsed.href;
		}
	} catch {
		// fall through
	}
	return undefined;
}

export function formatMemberCount(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
	return count.toString();
}

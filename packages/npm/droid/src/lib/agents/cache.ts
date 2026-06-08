import {
	GUILDS_CACHE_KEY,
	GUILDS_CACHE_TTL_MS,
	TOKENS_CACHE_KEY,
	TOKENS_CACHE_TTL_MS,
} from './constants';
import type { AgentTokenRow, DiscordGuild } from './types';

export function parseJwtPayload(jwt: string): Record<string, unknown> | null {
	try {
		const parts = jwt.split('.');
		if (parts.length < 2) return null;
		const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
		const padded = b64 + '==='.slice((b64.length + 3) % 4);
		const json = atob(padded);
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function extractJwtOwnedGuildIds(jwt: string): string[] {
	const payload = parseJwtPayload(jwt);
	if (!payload || !Array.isArray(payload['owned_guilds'])) return [];
	return payload['owned_guilds'].filter(
		(g): g is string => typeof g === 'string' && /^[0-9]{17,20}$/.test(g),
	);
}

interface CachedGuildsBlob {
	user_id: string;
	guilds: DiscordGuild[];
	cached_at: number;
}

export function loadCachedGuilds(userId: string): DiscordGuild[] | null {
	try {
		const raw = localStorage.getItem(GUILDS_CACHE_KEY);
		if (!raw) return null;
		const blob = JSON.parse(raw) as CachedGuildsBlob;
		if (blob.user_id !== userId) return null;
		if (Date.now() - blob.cached_at > GUILDS_CACHE_TTL_MS) return null;
		if (!Array.isArray(blob.guilds)) return null;
		return blob.guilds;
	} catch {
		return null;
	}
}

export function saveCachedGuilds(userId: string, guilds: DiscordGuild[]): void {
	try {
		const blob: CachedGuildsBlob = {
			user_id: userId,
			guilds,
			cached_at: Date.now(),
		};
		localStorage.setItem(GUILDS_CACHE_KEY, JSON.stringify(blob));
	} catch {
		/* non-fatal */
	}
}

interface CachedTokensBlob {
	user_id: string;
	tokens_by_guild: Record<
		string,
		{ tokens: AgentTokenRow[]; cached_at: number }
	>;
}

export function loadCachedTokens(
	userId: string,
	guildId: string,
): AgentTokenRow[] | null {
	try {
		const raw = localStorage.getItem(TOKENS_CACHE_KEY);
		if (!raw) return null;
		const blob = JSON.parse(raw) as CachedTokensBlob;
		if (blob.user_id !== userId) return null;
		const entry = blob.tokens_by_guild?.[guildId];
		if (!entry) return null;
		if (Date.now() - entry.cached_at > TOKENS_CACHE_TTL_MS) return null;
		return entry.tokens;
	} catch {
		return null;
	}
}

export function saveCachedTokens(
	userId: string,
	guildId: string,
	tokens: AgentTokenRow[],
): void {
	try {
		const raw = localStorage.getItem(TOKENS_CACHE_KEY);
		let blob: CachedTokensBlob;
		try {
			blob = raw
				? (JSON.parse(raw) as CachedTokensBlob)
				: { user_id: userId, tokens_by_guild: {} };
		} catch {
			blob = { user_id: userId, tokens_by_guild: {} };
		}
		if (blob.user_id !== userId) {
			blob = { user_id: userId, tokens_by_guild: {} };
		}
		blob.tokens_by_guild[guildId] = { tokens, cached_at: Date.now() };
		localStorage.setItem(TOKENS_CACHE_KEY, JSON.stringify(blob));
	} catch {
		/* non-fatal */
	}
}

export function invalidateCachedTokens(userId: string, guildId: string): void {
	try {
		const raw = localStorage.getItem(TOKENS_CACHE_KEY);
		if (!raw) return;
		const blob = JSON.parse(raw) as CachedTokensBlob;
		if (blob.user_id !== userId) return;
		if (blob.tokens_by_guild?.[guildId]) {
			delete blob.tokens_by_guild[guildId];
			localStorage.setItem(TOKENS_CACHE_KEY, JSON.stringify(blob));
		}
	} catch {
		/* non-fatal */
	}
}

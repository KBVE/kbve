/**
 * Game auth + net-config glue shared by KBVE Phaser games (arpg, cryptothrone,
 * …). The wire layer (net/protocol/game-client) stays auth-agnostic; this module
 * resolves a player's session into the `{ jwt, username, wsUrl }` a game client
 * needs to connect to its server-authoritative WebSocket.
 *
 * laser holds zero hard deps, so the Supabase client is INJECTED — the game owns
 * the instance (and its url + anon key); laser owns the logic. Anything exposing
 * `getSession(): Promise<{ access_token } | null>` satisfies the contract, so a
 * game can pass a raw supabase-js client or its own AuthBridge wrapper.
 */

import { RealmChatClient } from '../net/realm-chat-client';

/** Minimal session shape this module reads — a supabase-js Session subset. */
export interface GameSession {
	access_token: string;
}

/** The session source a game injects (supabase-js client or an AuthBridge). */
export interface SessionSource {
	getSession(): Promise<GameSession | null>;
}

/** Resolved connection config a game client connects with. */
export interface GameNetConfig {
	wsUrl: string;
	jwt: string;
	username: string;
}

/**
 * Pull the canonical `kbve_username` claim from a Supabase JWT (injected by the
 * GoTrue custom-access-token hook). Manual base64url decode — no jwt dep.
 */
export function usernameFromToken(token: string): string {
	try {
		const payload = token.split('.')[1];
		const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
		const claims = JSON.parse(json) as { kbve_username?: string };
		return claims.kbve_username ?? '';
	} catch {
		return '';
	}
}

export interface NetConfigOptions {
	/** Where the player's session comes from (supabase client / AuthBridge). */
	source: SessionSource;
	/** Resolve the game server WebSocket URL (game-specific env + default). */
	resolveWsUrl: () => string;
}

/**
 * A per-game net-config holder: keeps the resolved config in a module-style
 * singleton and builds it from the injected session source. `buildNetConfig`
 * resolves to `null` when there is no session (server denies an empty JWT — the
 * game shows its sign-in gate rather than connecting).
 */
export function createNetConfig(opts: NetConfigOptions) {
	let current: GameNetConfig | null = null;

	return {
		get(): GameNetConfig | null {
			return current;
		},
		set(cfg: GameNetConfig): void {
			current = cfg;
		},
		clear(): void {
			current = null;
		},
		async build(): Promise<GameNetConfig | null> {
			const session = await opts.source.getSession();
			const jwt = session?.access_token ?? '';
			if (!jwt) return null;
			current = {
				wsUrl: opts.resolveWsUrl(),
				jwt,
				username: usernameFromToken(jwt),
			};
			return current;
		},
	};
}

export type GameNetConfigStore = ReturnType<typeof createNetConfig>;

/** Read a `PUBLIC_*` WS env var with a fallback — the common resolveWsUrl shape. */
export function makeWsResolver(
	envValue: unknown,
	fallback: string,
): () => string {
	return () => {
		const env = typeof envValue === 'string' ? envValue : undefined;
		return env && env.length > 0 ? env : fallback;
	};
}

/** Per-game realm-chat config — the only bits that differ between games. */
export interface ChatConfig {
	/** Game key registered in the irc-gateway GAME_PROFILES, e.g. "arpg". */
	game: string;
	/** Channel the gateway routes this game to, e.g. "#general". */
	channel: string;
	/** Resolve the gamechat URL (game-specific env + default). */
	resolveUrl: () => string;
}

/**
 * Build a `RealmChatClient` for a game from its `ChatConfig` and a session JWT.
 * Returns null when there's no token (the game shows its chat as offline rather
 * than connecting). The caller `.connect()`s and owns the lifecycle — the UI is
 * per-game; only the client + wire are shared.
 */
export function createChatClient(
	chat: ChatConfig,
	jwt: string | null | undefined,
): RealmChatClient | null {
	if (!jwt) return null;
	return new RealmChatClient({
		url: chat.resolveUrl(),
		jwt,
		game: chat.game,
		channel: chat.channel,
	});
}

import {
	createNetConfig,
	makeWsResolver,
	type GameNetConfig,
	type GameSession,
	type SessionSource,
} from '@kbve/laser';

// Auth is deliberately OFF the boot path. Single player must keep working with
// no session, no network and no Supabase bundle — the same build ships as a
// standalone (see the coi-serviceworker/itch notes in vite.config.ts), so
// anything required to reach the main menu would break that. Nothing here runs
// until the player asks for multiplayer.
//
// Two constraints come from cross-origin isolation, which the game needs for
// SharedArrayBuffer and which vite.config.ts sets as COOP: same-origin +
// COEP: require-corp:
//
//   - COOP severs window.opener, so an OAuth POPUP can never hand a session
//     back. Sign-in has to be the redirect flow. This is not a preference.
//   - COEP requires every cross-origin subresource to opt in via CORP/CORS.
//     Supabase's REST/auth calls are CORS fetches and are fine; provider logos
//     or avatars pulled no-cors would be blocked.

export const SUPABASE_URL = 'https://supabase.kbve.com';
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';

const DEFAULT_WS_URL = 'wss://game.herbmail.com/ws';

type SupabaseLike = {
	auth: {
		getSession(): Promise<{
			data: { session: { access_token: string } | null };
		}>;
		signInWithOAuth(opts: {
			provider: string;
			options?: { redirectTo?: string; skipBrowserRedirect?: boolean };
		}): Promise<unknown>;
		signOut(): Promise<unknown>;
	};
};

let clientPromise: Promise<SupabaseLike> | null = null;

/** Loads supabase-js on first use so the single-player bundle never pays for it. */
async function client(): Promise<SupabaseLike> {
	if (!clientPromise) {
		clientPromise = import('@supabase/supabase-js').then((m) =>
			m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
				auth: {
					persistSession: true,
					autoRefreshToken: true,
					// The redirect lands back on the game with the tokens in the
					// URL fragment; supabase-js consumes them on construction.
					detectSessionInUrl: true,
					flowType: 'pkce',
				},
			}),
		) as Promise<SupabaseLike>;
	}
	return clientPromise;
}

// laser owns the session -> {jwt, username, wsUrl} glue and stays dep-free by
// taking the client as an injected SessionSource rather than importing one.
const source: SessionSource = {
	async getSession(): Promise<GameSession | null> {
		const c = await client();
		const { data } = await c.auth.getSession();
		return data.session
			? { access_token: data.session.access_token }
			: null;
	},
};

const resolveWs = makeWsResolver(
	import.meta.env?.PUBLIC_HERBMAIL_WS_URL,
	DEFAULT_WS_URL,
);

export const netConfig = createNetConfig({ source, resolveWsUrl: resolveWs });

export type { GameNetConfig };

// Guests. The server admits an empty JWT and mints an identity for it, so a
// player can join without an account while the game is still being built.
//
// The `guest-` prefix is not decoration: it is the only thing separating a
// throwaway identity from a real account name in a nameplate, and a guest must
// never be able to present themselves as a signed-in player. The client picking
// its own name is a convenience, NOT a security boundary — the server has to
// re-derive the prefix for any empty-token connection and reject a claimed name
// that does not carry it, or impersonation is trivial. Nothing here can enforce
// that.
export const GUEST_PREFIX = 'guest-';
const GUEST_KEY = 'herbmail.guestName';

function randomSuffix(): string {
	const b = new Uint8Array(3);
	if (typeof crypto !== 'undefined' && crypto.getRandomValues)
		crypto.getRandomValues(b);
	else
		for (let i = 0; i < b.length; i++)
			b[i] = Math.floor(Math.random() * 256);
	return Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
}

let guestName: string | null = null;

/** A stable guest name. Memoised for this page load, and persisted so a
 * returning guest keeps their nameplate rather than becoming a new stranger.
 * The memo is what guarantees stability: without it, blocked storage (private
 * mode, or a node context) would mint a new name on every call and a guest's
 * nameplate could change mid-session. */
export function guestUsername(): string {
	if (guestName) return guestName;
	guestName = `${GUEST_PREFIX}${randomSuffix()}`;
	if (typeof localStorage === 'undefined') return guestName;
	try {
		const saved = localStorage.getItem(GUEST_KEY);
		if (saved && saved.startsWith(GUEST_PREFIX)) {
			guestName = saved;
			return guestName;
		}
		localStorage.setItem(GUEST_KEY, guestName);
	} catch {
		// Private mode or blocked storage: the memo still holds it for this load.
	}
	return guestName;
}

/** Why multiplayer cannot be entered yet, or null when it can. */
export type AuthGate = 'signed-out' | 'no-username' | null;

/**
 * Resolves the current multiplayer readiness. Returns the gate reason rather
 * than throwing so the menu can show the right screen: a signed-out player needs
 * the sign-in flow, a signed-in player missing the `kbve_username` claim needs
 * the username setup step, and only then is a connection worth attempting.
 */
export async function multiplayerGate(): Promise<AuthGate> {
	const cfg = await netConfig.build();
	if (!cfg) return 'signed-out';
	if (!cfg.username) return 'no-username';
	return null;
}

/**
 * Resolves what to connect with, falling back to a guest identity when allowed.
 *
 * A signed-in player is always preferred, but a session missing the
 * kbve_username claim is deliberately NOT promoted to guest silently — that
 * player has an account and should be sent to username setup, or they would
 * quietly lose their identity every time they play. Guest is for people who
 * never signed in.
 */
export async function resolveNetConfig(
	allowGuest = true,
): Promise<{ config: GameNetConfig | null; gate: AuthGate }> {
	const cfg = await netConfig.build().catch(() => null);
	if (cfg?.username) return { config: cfg, gate: null };
	if (cfg && !cfg.username) return { config: null, gate: 'no-username' };
	if (!allowGuest) return { config: null, gate: 'signed-out' };
	const guest: GameNetConfig = {
		wsUrl: netConfig.get()?.wsUrl ?? resolveWs(),
		jwt: '',
		username: guestUsername(),
	};
	netConfig.set(guest);
	return { config: guest, gate: null };
}

/**
 * Starts an OAuth sign-in. Always a full redirect: under COOP the popup variant
 * cannot return the session to this document.
 */
export async function signIn(provider = 'discord'): Promise<void> {
	const c = await client();
	await c.auth.signInWithOAuth({
		provider,
		options: {
			redirectTo:
				typeof window === 'undefined'
					? undefined
					: window.location.href,
			skipBrowserRedirect: false,
		},
	});
}

export async function signOut(): Promise<void> {
	const c = await client();
	await c.auth.signOut();
	netConfig.clear();
}

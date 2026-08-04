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

const DEFAULT_WS_URL = 'wss://herbmail.kbve.com/ws';

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

export const netConfig = createNetConfig({
	source,
	resolveWsUrl: makeWsResolver(
		import.meta.env?.PUBLIC_HERBMAIL_WS_URL,
		DEFAULT_WS_URL,
	),
});

export type { GameNetConfig };

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

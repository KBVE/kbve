import {
	DiscordSDK,
	patchUrlMappings,
	type Types,
} from '@discord/embedded-app-sdk';
import { mount } from './index';

/**
 * Discord Activity entry — the isolated Discord path. Runs entirely on the main
 * thread (the Activity iframe has no SharedWorkers): does the Discord OAuth
 * handshake, exchanges it for a game-server session via a backend endpoint, then
 * boots the same shadow-root game mount as the standalone embed.
 *
 * Build target: `build-discord` -> public/discord/discord.js, loaded by
 * public/discord/index.html (the Activity root URL configured in the Discord
 * developer portal).
 */
const CLIENT_ID = import.meta.env.PUBLIC_DISCORD_CLIENT_ID as
	| string
	| undefined;

// Backend bridge (P3b): exchanges the Discord OAuth code for a Discord
// access_token AND a game-server session {jwt, username}, linking the Discord
// user to a KBVE profile. The Activity iframe runs on *.discordsays.com, so
// every request — including same-origin backend calls — must carry the
// `/.proxy/` prefix: Discord strips it and applies the portal ROOT mapping
// (`/` -> the axum-cryptothrone host serving /api/*). Without it the fetch
// hits discordsays.com directly and never reaches the backend.
const SESSION_ENDPOINT = '/.proxy/api/discord/session';

// External hosts the game's plain `new WebSocket('wss://game.cryptothrone…')`
// calls reach. patchUrlMappings rewrites those real URLs through Discord's
// proxy transparently — net-config and the rest of the game stay unchanged.
// Each prefix must match a URL Mapping in the Discord developer portal:
//   /cryptothrone-game -> game.cryptothrone.com
//   /cryptothrone-chat -> chat.kbve.com
// (plus the ROOT mapping `/` -> the axum-cryptothrone host that serves the
// Activity + the session endpoint.)
const URL_MAPPINGS: { prefix: string; target: string }[] = [
	{ prefix: '/cryptothrone-game', target: 'game.cryptothrone.com' },
	{ prefix: '/cryptothrone-chat', target: 'chat.kbve.com' },
];

const AUTHORIZE_SCOPE: Types.OAuthScopes[] = ['identify', 'email'];

interface DiscordSession {
	access_token: string;
	jwt: string;
	username: string;
}

function errMsg(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	// Discord RPC rejects with a plain {code, message} object — surface it
	// instead of the useless "[object Object]" String() default.
	if (err && typeof err === 'object') {
		const o = err as Record<string, unknown>;
		if (typeof o.message === 'string') {
			return typeof o.code === 'number' || typeof o.code === 'string'
				? `${o.message} (code ${o.code})`
				: o.message;
		}
		try {
			return JSON.stringify(err);
		} catch {
			return String(err);
		}
	}
	return String(err);
}

function root(): HTMLElement | null {
	return document.getElementById('app');
}

/** Update the boot card's status line (and optional sub-line) in place so each
 * stage names itself instead of a frozen "Loading…". */
function setStatus(status: string, sub?: string): void {
	const el = root();
	if (!el) return;
	const statusEl = el.querySelector<HTMLElement>('.ct-boot-status');
	const subEl = el.querySelector<HTMLElement>('.ct-boot-sub');
	if (statusEl) {
		statusEl.textContent = status;
	} else {
		// Boot card was replaced (e.g. by an error) — rebuild it.
		el.innerHTML = `
			<div class="ct-boot">
				<span class="ct-spinner" aria-hidden="true"></span>
				<p class="ct-boot-status">${status}</p>
				<p class="ct-boot-sub">${sub ?? ''}</p>
			</div>`;
		return;
	}
	if (subEl && sub !== undefined) subEl.textContent = sub;
}

/** Swap the boot card for a legible error with a retry button. Retry reloads
 * the Activity iframe — the cleanest reset for the SDK/OAuth handshake, same
 * pattern the in-game ConnectionOverlay uses. */
function fail(msg: string, ...extra: unknown[]): void {
	console.error(`[Cryptothrone/Discord] ${msg}`, ...extra);
	const el = root();
	if (!el) return;
	el.innerHTML = `
		<div class="ct-boot">
			<svg class="ct-error-icon" width="32" height="32" viewBox="0 0 24 24"
				fill="none" stroke="currentColor" stroke-width="1.75"
				stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
				<line x1="12" y1="9" x2="12" y2="13" />
				<line x1="12" y1="17" x2="12.01" y2="17" />
			</svg>
			<p class="ct-error-title">Could not start the Activity</p>
			<p class="ct-error-msg"></p>
			<button type="button" class="ct-retry">Try again</button>
		</div>`;
	// Set message via textContent so error strings can't inject markup.
	const msgEl = el.querySelector<HTMLElement>('.ct-error-msg');
	if (msgEl) msgEl.textContent = msg;
	const retry = el.querySelector<HTMLButtonElement>('.ct-retry');
	retry?.addEventListener('click', () => window.location.reload());
}

/** Run a boot step, re-throwing with a labelled message so the error card
 * names which stage failed instead of a generic "boot failed". */
async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (err) {
		throw new Error(`${label}: ${errMsg(err)}`, { cause: err });
	}
}

/** Discord authorize with a silent-first strategy. `prompt:'none'` skips the
 * consent screen for users who already authorized the app, but Discord rejects
 * it for never-authorized users — fall back to authorize *without* `prompt`,
 * which opens the OAuth consent modal, so a first-time player isn't left at a
 * dead end. */
async function authorize(clientId: string, sdk: DiscordSDK): Promise<string> {
	try {
		const { code } = await sdk.commands.authorize({
			client_id: clientId,
			response_type: 'code',
			state: '',
			prompt: 'none',
			scope: AUTHORIZE_SCOPE,
		});
		return code;
	} catch (err) {
		console.warn(
			'[Cryptothrone/Discord] silent authorize failed, prompting for consent',
			errMsg(err),
		);
		setStatus(
			'Waiting for you to authorize…',
			'Approve access in Discord.',
		);
		const { code } = await step('Discord authorize', () =>
			sdk.commands.authorize({
				client_id: clientId,
				response_type: 'code',
				state: '',
				scope: AUTHORIZE_SCOPE,
			}),
		);
		return code;
	}
}

async function boot(): Promise<void> {
	if (!CLIENT_ID) {
		fail('Missing PUBLIC_DISCORD_CLIENT_ID at build time.');
		return;
	}

	patchUrlMappings(URL_MAPPINGS);

	setStatus('Linking to Cloud City…', 'Connecting to Discord.');
	const sdk = new DiscordSDK(CLIENT_ID);
	await step('Discord SDK ready', () => sdk.ready());

	setStatus('Linking to Cloud City…', 'Authorizing your Discord account.');
	const code = await authorize(CLIENT_ID, sdk);

	setStatus('Linking to Cloud City…', 'Setting up your game session.');
	const res = await step('session request', () =>
		fetch(SESSION_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code }),
		}),
	);
	if (!res.ok) {
		fail(`Session exchange failed (${res.status}).`);
		return;
	}
	const session = (await step('session parse', () =>
		res.json(),
	)) as DiscordSession;

	setStatus('Linking to Cloud City…', 'Entering the world.');
	await step('Discord authenticate', () =>
		sdk.commands.authenticate({ access_token: session.access_token }),
	);

	const el = root() ?? document.body;
	mount({
		el,
		jwt: session.jwt,
		username: session.username,
		height: '100vh',
	});
}

void boot().catch((err) => fail(`Boot failed — ${errMsg(err)}`, err));

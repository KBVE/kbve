import {
	DiscordSDK,
	patchUrlMappings,
	type Types,
} from '@discord/embedded-app-sdk';
import { mount } from './index';
import { setArpgAssetBase } from '../game/config';
import { setExternalOpener } from '../lib/external';

const CLIENT_ID = import.meta.env.PUBLIC_DISCORD_CLIENT_ID as
	| string
	| undefined;

// Portal URL Mappings. The Activity iframe proxies every request through
// *.discordsays.com; each external host needs a mapping so the SDK can rewrite
// it. The portal ROOT now maps / -> arpg.kbve.com/discord/arpg/, so the page +
// arpg.js load same-origin (relative), but everything else needs a mapping:
//   /arpg-game     -> arpg.kbve.com     (game WS, sibling of the /discord/arpg/ dir)
//   /arpg-assets   -> arpg.kbve.com     (sprite art at /assets/, served with CORS)
//   /arpg-session  -> kbve.com          (OAuth->Supabase JWT bridge on axum-kbve,
//                                         which holds DISCORD_CLIENT_SECRET; it stays
//                                         on kbve.com, now a cross-origin host)
//   /arpg-chat     -> chat.kbve.com     (realm chat WS, irc-gateway /gamechat)
//   /arpg-supabase -> supabase.kbve.com (Supabase auth/REST, if the client runs)
const URL_MAPPINGS: { prefix: string; target: string }[] = [
	{ prefix: '/arpg-game', target: 'arpg.kbve.com' },
	{ prefix: '/arpg-assets', target: 'arpg.kbve.com' },
	{ prefix: '/arpg-session', target: 'kbve.com' },
	{ prefix: '/arpg-chat', target: 'chat.kbve.com' },
	{ prefix: '/arpg-supabase', target: 'supabase.kbve.com' },
];
const PROXY_WS = `wss://${location.host}`;
const PROXY_HTTP = `https://${location.host}`;
const SESSION_ENDPOINT = '/.proxy/arpg-session/api/v1/discord/session';
const GAME_WS = `${PROXY_WS}/.proxy/arpg-game/ws`;
const CHAT_WS = `${PROXY_WS}/.proxy/arpg-chat/gamechat`;
const SUPABASE_URL = `${PROXY_HTTP}/.proxy/arpg-supabase`;
// Art base: the literal proxy path for the /arpg-assets mapping. We can't lean on
// patchUrlMappings to rewrite /arpg-assets here — it only patches JS network APIs
// (fetch/Image/WebSocket), NOT CSS `url()` (item atlas, panel border-image), which
// the browser resolves itself. So bake the real `/.proxy/...` path that the proxy
// serves directly; Phaser's JS loads resolve it too (the patch is a no-op on an
// already-proxied path). Mirrors GAME_WS/SESSION_ENDPOINT above.
const ASSET_BASE = '/.proxy/arpg-assets';

const KBVE_DISCORD_URL = 'https://discord.gg/kbve';
const KBVE_FEEDBACK_URL = 'https://kbve.com/contact/';

// Build version baked from version.toml (vite define). Compared at boot against
// the no-cache version.json served beside this bundle to catch a stale (CF- or
// webview-cached) build. Brand logo + version marker ship beside index.html, so
// they load same-origin on the static boot screen (no proxy mapping needed yet).
const ARPG_VERSION =
	(import.meta.env.PUBLIC_ARPG_VERSION as string | undefined) ?? 'dev';
const VERSION_ENDPOINT = './version.json';
const BRAND_LOGO = './rentearthlogo.webp';
const RELOAD_GUARD_KEY = 'arpg-stale-reload';

// HTTP statuses worth one automatic retry (with a fresh OAuth code): the session
// hop timed out or the service was briefly busy/unavailable, not a hard reject.
const TRANSIENT_STATUS = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

const delay = (ms: number): Promise<void> =>
	new Promise((r) => setTimeout(r, ms));
// Park forever — used after a reload is kicked off so the rest of boot can't run.
const haltBoot = (): Promise<never> => new Promise<never>(() => {});

/** Categorized session-exchange failure. `transient` ones get an auto-retry. */
class SessionError extends Error {
	constructor(
		readonly status: number,
		readonly stage: string | null,
		readonly transient: boolean,
		message: string,
	) {
		super(message);
	}
}

/** User-facing reason for a session failure — names the stage, never internals. */
function sessionMessage(status: number, stage: string | null): string {
	const at = stage ? ` at the "${stage}" step` : '';
	switch (status) {
		case 0:
			return 'Couldn’t reach the game session service — the connection timed out.';
		case 408:
		case 504:
			return `The game session service timed out${at}. This is usually temporary.`;
		case 502:
		case 503:
			return 'The game session service is briefly unavailable. Try again in a moment.';
		case 401:
			return 'Discord sign-in didn’t go through. Try authorizing again.';
		case 429:
			return 'Too many attempts right now — wait a moment and try again.';
		default:
			return status >= 500
				? 'The game session service hit an error setting up your session.'
				: `Couldn’t start your game session (status ${status}).`;
	}
}

const AUTHORIZE_SCOPE: Types.OAuthScopes[] = [
	'identify',
	'email',
	'rpc.activities.write',
];

interface DiscordSession {
	access_token: string;
	jwt: string;
	username: string;
}

function errMsg(err: unknown): string {
	if (err instanceof Error) return err.message;
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

let activeSdk: DiscordSDK | null = null;

function openExternal(url: string): void {
	if (activeSdk) {
		void activeSdk.commands.openExternalLink({ url }).catch(() => {});
		return;
	}
	window.open(url, '_blank', 'noopener,noreferrer');
}

function communityCta(): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'arpg-cta';

	const discord = document.createElement('button');
	discord.type = 'button';
	discord.className = 'arpg-cta-discord';
	discord.textContent = 'Join our Discord';
	discord.addEventListener('click', () => openExternal(KBVE_DISCORD_URL));

	const feedback = document.createElement('button');
	feedback.type = 'button';
	feedback.className = 'arpg-cta-feedback';
	feedback.textContent = 'Share feedback';
	feedback.addEventListener('click', () => openExternal(KBVE_FEEDBACK_URL));

	wrap.append(discord, feedback);
	return wrap;
}

// Rent Earth brand mark for the boot/sign-in/error screens. Self-hides if the
// logo asset is missing so a bad path never leaves a broken-image icon.
const BRAND_IMG = `<img class="arpg-brand" src="${BRAND_LOGO}" alt="Rent Earth" onerror="this.style.display='none'" />`;
const VERSION_TAG = `<p class="arpg-ver">v${ARPG_VERSION}</p>`;

function setStatus(status: string, sub?: string): void {
	const el = root();
	if (!el) return;
	const statusEl = el.querySelector<HTMLElement>('.arpg-boot-status');
	const subEl = el.querySelector<HTMLElement>('.arpg-boot-sub');
	if (statusEl) {
		statusEl.textContent = status;
	} else {
		el.innerHTML = `
			<div class="arpg-boot">
				${BRAND_IMG}
				<span class="arpg-spinner" aria-hidden="true"></span>
				<p class="arpg-boot-status">${status}</p>
				<p class="arpg-boot-sub">${sub ?? ''}</p>
				${VERSION_TAG}
			</div>`;
		return;
	}
	if (subEl && sub !== undefined) subEl.textContent = sub;
}

function fail(msg: string, ...extra: unknown[]): void {
	console.error(`[ARPG/Discord] ${msg}`, ...extra);
	const el = root();
	if (!el) return;
	el.innerHTML = `
		<div class="arpg-boot">
			${BRAND_IMG}
			<p class="arpg-error-title">Could not start the Activity</p>
			<p class="arpg-error-msg"></p>
			<button type="button" class="arpg-retry">Try again</button>
			${VERSION_TAG}
		</div>`;
	const msgEl = el.querySelector<HTMLElement>('.arpg-error-msg');
	if (msgEl) msgEl.textContent = msg;
	const retry = el.querySelector<HTMLButtonElement>('.arpg-retry');
	retry?.addEventListener('click', () => window.location.reload());
	el.querySelector('.arpg-boot')?.appendChild(communityCta());
}

async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (err) {
		throw new Error(`${label}: ${errMsg(err)}`, { cause: err });
	}
}

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
			'[ARPG/Discord] silent authorize failed, prompting for consent',
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

/**
 * Detect a stale (cache-pinned) build and reload once into the fresh one.
 *
 * The hashed bundle + no-cache index.html should prevent stale serves, but a
 * webview/proxy that ignores cache headers can still pin an old build. The
 * served version.json is always fresh (nginx no-cache); if it's newer than what
 * we were built with, this running copy is outdated — reload to pull the fresh
 * index.html → new hashed bundle. Guarded so a colo that keeps serving stale
 * can't loop. Fail-open on any network/parse error (never blocks a good boot).
 */
async function ensureFreshBuild(): Promise<void> {
	let latest: string | undefined;
	try {
		const res = await fetch(VERSION_ENDPOINT, { cache: 'no-store' });
		if (!res.ok) return;
		latest = ((await res.json()) as { version?: string }).version;
	} catch {
		return;
	}
	if (!latest || latest === ARPG_VERSION) {
		try {
			sessionStorage.removeItem(RELOAD_GUARD_KEY);
		} catch {
			/* sessionStorage unavailable — nothing to clear */
		}
		return;
	}

	let triedFor: string | null = null;
	try {
		triedFor = sessionStorage.getItem(RELOAD_GUARD_KEY);
	} catch {
		/* ignore */
	}
	if (triedFor === latest) {
		// Reload already attempted for this version and we're still stale.
		fail(
			`This Activity is running an outdated build (v${ARPG_VERSION}; latest is v${latest}) ` +
				`and the cache won’t refresh. Fully close the Activity and reopen it.`,
		);
		return haltBoot();
	}
	try {
		sessionStorage.setItem(RELOAD_GUARD_KEY, latest);
	} catch {
		/* ignore */
	}
	setStatus('Updating…', `Loading the latest version (v${latest}).`);
	await delay(600);
	window.location.reload();
	return haltBoot();
}

/** One session exchange. Throws SessionError (transient flagged) on failure. */
async function exchangeOnce(code: string): Promise<DiscordSession> {
	let res: Response;
	try {
		res = await fetch(SESSION_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code }),
		});
	} catch (err) {
		// No HTTP response: the proxy hop to the session host timed out or was
		// blocked. Transient — status 0 maps to the connection-timeout message.
		console.warn(
			'[ARPG/Discord] session request transport error',
			errMsg(err),
		);
		throw new SessionError(0, null, true, sessionMessage(0, null));
	}
	if (res.ok) return (await res.json()) as DiscordSession;
	// The bridge returns structured `{ error, stage }` JSON; a bare proxy/edge
	// timeout returns text. Read the stage when present (names where it stalled).
	const body = (await res.json().catch(() => null)) as {
		error?: string;
		stage?: string;
	} | null;
	const stage = body?.stage ?? null;
	const transient = TRANSIENT_STATUS.has(res.status);
	throw new SessionError(
		res.status,
		stage,
		transient,
		sessionMessage(res.status, stage),
	);
}

/**
 * Authorize + exchange, with one retry on a transient failure. Each attempt
 * mints a FRESH OAuth code (codes are single-use, so we must re-authorize rather
 * than replay the same code), and silent `prompt:'none'` keeps the retry
 * invisible to an already-consented user.
 */
async function authorizeAndExchange(
	clientId: string,
	sdk: DiscordSDK,
): Promise<DiscordSession> {
	for (let attempt = 1; attempt <= 2; attempt++) {
		setStatus('Entering the dungeon…', 'Authorizing your Discord account.');
		const code = await authorize(clientId, sdk);
		setStatus('Entering the dungeon…', 'Setting up your game session.');
		try {
			return await exchangeOnce(code);
		} catch (err) {
			if (err instanceof SessionError && err.transient && attempt === 1) {
				console.warn(
					`[ARPG/Discord] session attempt ${attempt} failed (${err.status}), retrying`,
					err.message,
				);
				setStatus(
					'Entering the dungeon…',
					'Session service was busy — retrying…',
				);
				await delay(900);
				continue;
			}
			throw err;
		}
	}
	// Unreachable: the loop either returns or throws.
	throw new SessionError(0, null, false, sessionMessage(0, null));
}

async function boot(): Promise<void> {
	if (!CLIENT_ID) {
		fail('Missing PUBLIC_DISCORD_CLIENT_ID at build time.');
		return;
	}

	setStatus('Entering the dungeon…', 'Checking for updates.');
	await ensureFreshBuild();

	patchUrlMappings(URL_MAPPINGS);
	// Route the game's site-root art through the /arpg-assets mapping so it loads
	// inside the proxied Activity iframe.
	setArpgAssetBase(ASSET_BASE);

	setStatus('Entering the dungeon…', 'Connecting to Discord.');
	const sdk = new DiscordSDK(CLIENT_ID);
	await step('Discord SDK ready', () => sdk.ready());
	activeSdk = sdk;
	// Let in-game UI (boot-screen ads, CTAs) open links through the Activity SDK
	// instead of a sandbox-blocked new tab.
	setExternalOpener(openExternal);

	void sdk.commands.encourageHardwareAcceleration().catch(() => {});

	const session = await authorizeAndExchange(CLIENT_ID, sdk);

	setStatus('Entering the dungeon…', 'Loading the world.');
	await step('Discord authenticate', () =>
		sdk.commands.authenticate({ access_token: session.access_token }),
	);

	const el = root() ?? document.body;
	el.innerHTML = '';
	mount({
		el,
		jwt: session.jwt,
		username: session.username,
		gameWs: GAME_WS,
		chatWs: CHAT_WS,
		supabaseUrl: SUPABASE_URL,
		height: '100vh',
	});
}

void boot().catch((err) => {
	// Categorized session failures already carry a player-facing message; show it
	// as-is. Discord's "Authorization request not found" means the sign-in
	// request expired mid-flow — tell the player to just retry. Everything else
	// falls back to the generic boot-failure line.
	if (err instanceof SessionError) {
		fail(err.message, err);
		return;
	}
	const msg = errMsg(err);
	if (/authorization request not found|expired/i.test(msg)) {
		fail(
			'Discord sign-in expired before it finished. Tap “Try again” to restart sign-in.',
			err,
		);
		return;
	}
	fail(`Boot failed — ${msg}`, err);
});

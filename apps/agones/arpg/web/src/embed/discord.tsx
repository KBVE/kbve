import {
	DiscordSDK,
	patchUrlMappings,
	type Types,
} from '@discord/embedded-app-sdk';
import { mount } from './index';
import { setArpgAssetBase } from '../game/config';

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
// Art base: the SDK rewrites /arpg-assets -> arpg.kbve.com, so
// /arpg-assets/assets/... reaches the vite app's art through the proxy.
const ASSET_BASE = '/arpg-assets';

const KBVE_DISCORD_URL = 'https://discord.gg/kbve';
const KBVE_FEEDBACK_URL = 'https://kbve.com/contact/';

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
				<span class="arpg-spinner" aria-hidden="true"></span>
				<p class="arpg-boot-status">${status}</p>
				<p class="arpg-boot-sub">${sub ?? ''}</p>
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
			<p class="arpg-error-title">Could not start the Activity</p>
			<p class="arpg-error-msg"></p>
			<button type="button" class="arpg-retry">Try again</button>
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

async function boot(): Promise<void> {
	if (!CLIENT_ID) {
		fail('Missing PUBLIC_DISCORD_CLIENT_ID at build time.');
		return;
	}

	patchUrlMappings(URL_MAPPINGS);
	// Route the game's site-root art through the /arpg-assets mapping so it loads
	// inside the proxied Activity iframe.
	setArpgAssetBase(ASSET_BASE);

	setStatus('Entering the dungeon…', 'Connecting to Discord.');
	const sdk = new DiscordSDK(CLIENT_ID);
	await step('Discord SDK ready', () => sdk.ready());
	activeSdk = sdk;

	void sdk.commands.encourageHardwareAcceleration().catch(() => {});

	setStatus('Entering the dungeon…', 'Authorizing your Discord account.');
	const code = await authorize(CLIENT_ID, sdk);

	setStatus('Entering the dungeon…', 'Setting up your game session.');
	const res = await step('session request', () =>
		fetch(SESSION_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code }),
		}),
	);
	if (!res.ok) {
		// Surface the bridge's structured `{ error }` reason instead of a bare
		// status. 502/503 are transient (Discord/DB upstream) — worth a retry;
		// 401 is the user's Discord auth; 500 is a server misconfig they can't fix.
		const reason = await res
			.json()
			.then((b: { error?: string }) => b?.error)
			.catch(() => null);
		const transient = res.status === 502 || res.status === 503;
		fail(
			`Session exchange failed (${res.status})${reason ? `: ${reason}` : ''}.` +
				(transient ? ' This is usually temporary — try again.' : ''),
		);
		return;
	}
	const session = (await step('session parse', () =>
		res.json(),
	)) as DiscordSession;

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

void boot().catch((err) => fail(`Boot failed — ${errMsg(err)}`, err));

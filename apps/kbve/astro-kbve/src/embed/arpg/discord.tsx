import {
	DiscordSDK,
	patchUrlMappings,
	type Types,
} from '@discord/embedded-app-sdk';
import { mount } from './index';

const CLIENT_ID = import.meta.env.PUBLIC_DISCORD_CLIENT_ID as
	| string
	| undefined;

// Same-origin backend on axum-kbve (kbve.com). Every Activity request must carry
// the /.proxy/ prefix; the SDK strips it and applies the portal mappings. The
// portal root maps / -> kbve.com/discord/arpg/, so axum-kbve serves the session
// at /discord/api/v1/discord/session too (see https.rs).
const SESSION_ENDPOINT = '/.proxy/api/v1/discord/session';

// The game WebSocket rides a portal URL Mapping: /arpg-game -> arpg.kbve.com.
// patchUrlMappings rewrites the game's wss://arpg.kbve.com/ws to the proxied
// host so the socket is allowed inside the Activity iframe.
const URL_MAPPINGS: { prefix: string; target: string }[] = [
	{ prefix: '/arpg-game', target: 'arpg.kbve.com' },
];
const GAME_WS = 'wss://arpg.kbve.com/.proxy/arpg-game/ws';

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
		fail(`Session exchange failed (${res.status}).`);
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
		height: '100vh',
	});
}

void boot().catch((err) => fail(`Boot failed — ${errMsg(err)}`, err));

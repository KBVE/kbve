import {
	DiscordSDK,
	patchUrlMappings,
	type Types,
} from '@discord/embedded-app-sdk';
import { mount } from './index';
import { startPresence } from './discord-presence';
import { KBVE_DISCORD_URL, KBVE_FEEDBACK_URL } from '../lib/kbve-links';

const CLIENT_ID = import.meta.env.PUBLIC_DISCORD_CLIENT_ID as
	| string
	| undefined;

const SESSION_ENDPOINT = '/.proxy/api/discord/session';

const URL_MAPPINGS: { prefix: string; target: string }[] = [
	{ prefix: '/cryptothrone-game', target: 'game.cryptothrone.com' },
	{ prefix: '/cryptothrone-chat', target: 'chat.kbve.com' },
];

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
	if (err instanceof Error) {
		return err.message;
	}
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
	wrap.className = 'ct-cta';

	const discord = document.createElement('button');
	discord.type = 'button';
	discord.className = 'ct-cta-discord';
	discord.textContent = 'Join our Discord';
	discord.addEventListener('click', () => openExternal(KBVE_DISCORD_URL));

	const feedback = document.createElement('button');
	feedback.type = 'button';
	feedback.className = 'ct-cta-feedback';
	feedback.textContent = 'Share feedback';
	feedback.addEventListener('click', () => openExternal(KBVE_FEEDBACK_URL));

	wrap.append(discord, feedback);
	return wrap;
}

function setStatus(status: string, sub?: string): void {
	const el = root();
	if (!el) return;
	const statusEl = el.querySelector<HTMLElement>('.ct-boot-status');
	const subEl = el.querySelector<HTMLElement>('.ct-boot-sub');
	if (statusEl) {
		statusEl.textContent = status;
	} else {
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
	const msgEl = el.querySelector<HTMLElement>('.ct-error-msg');
	if (msgEl) msgEl.textContent = msg;
	const retry = el.querySelector<HTMLButtonElement>('.ct-retry');
	retry?.addEventListener('click', () => window.location.reload());
	el.querySelector('.ct-boot')?.appendChild(communityCta());
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
	activeSdk = sdk;
	(
		window as unknown as { __ctOpenExternal?: (url: string) => void }
	).__ctOpenExternal = openExternal;

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

	startPresence(sdk);
}

void boot().catch((err) => fail(`Boot failed — ${errMsg(err)}`, err));

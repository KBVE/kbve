import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
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
// user to a KBVE profile. Routed through Discord's proxy.
const SESSION_ENDPOINT = '/.proxy/api/discord/session';

// Host mappings so the game's plain `new WebSocket('wss://game.cryptothrone…')`
// calls are transparently rewritten through Discord's proxy — net-config and
// the rest of the game stay unchanged. These prefixes must match the URL
// Mappings configured in the Discord developer portal.
const URL_MAPPINGS: { prefix: string; target: string }[] = [
	{ prefix: '/cryptothrone-game', target: 'game.cryptothrone.com' },
	{ prefix: '/cryptothrone-chat', target: 'chat.kbve.com' },
];

interface DiscordSession {
	access_token: string;
	jwt: string;
	username: string;
}

function fail(msg: string, ...extra: unknown[]): void {
	console.error(`[Cryptothrone/Discord] ${msg}`, ...extra);
	const root = document.getElementById('app');
	if (root) {
		root.textContent = `Could not start the Activity: ${msg}`;
	}
}

async function boot(): Promise<void> {
	if (!CLIENT_ID) {
		fail('missing PUBLIC_DISCORD_CLIENT_ID at build time');
		return;
	}

	patchUrlMappings(URL_MAPPINGS);

	const sdk = new DiscordSDK(CLIENT_ID);
	await sdk.ready();

	const { code } = await sdk.commands.authorize({
		client_id: CLIENT_ID,
		response_type: 'code',
		state: '',
		prompt: 'none',
		scope: ['identify', 'guilds'],
	});

	const res = await fetch(SESSION_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code }),
	});
	if (!res.ok) {
		fail(`session exchange failed (${res.status})`);
		return;
	}
	const session = (await res.json()) as DiscordSession;

	await sdk.commands.authenticate({ access_token: session.access_token });

	const el = document.getElementById('app') ?? document.body;
	mount({
		el,
		jwt: session.jwt,
		username: session.username,
		height: '100vh',
	});
}

void boot().catch((err) => fail('boot failed', err));

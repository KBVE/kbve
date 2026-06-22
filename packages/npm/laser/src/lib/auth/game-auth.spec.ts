import { describe, it, expect } from 'vitest';
import {
	usernameFromToken,
	makeWsResolver,
	createNetConfig,
	createChatClient,
	type SessionSource,
	type ChatConfig,
} from './game-auth';
import { RealmChatClient } from '../net/realm-chat-client';

/** Build an unsigned HS256-shaped JWT with the given payload (signature ignored
 *  by usernameFromToken — it only base64url-decodes the claims segment). */
function fakeJwt(payload: Record<string, unknown>): string {
	const b64u = (o: unknown) =>
		Buffer.from(JSON.stringify(o))
			.toString('base64')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	return `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u(payload)}.sig`;
}

describe('usernameFromToken', () => {
	it('pulls the kbve_username claim', () => {
		expect(usernameFromToken(fakeJwt({ kbve_username: 'neo' }))).toBe(
			'neo',
		);
	});

	it('returns empty string when the claim is absent', () => {
		expect(usernameFromToken(fakeJwt({ sub: 'x' }))).toBe('');
	});

	it('returns empty string for a malformed token', () => {
		expect(usernameFromToken('garbage')).toBe('');
		expect(usernameFromToken('')).toBe('');
		expect(usernameFromToken('a.b')).toBe('');
	});

	it('decodes base64url payloads (- and _ alphabet)', () => {
		// A username whose JSON base64 contains + and / forces the url-alphabet path.
		const name = 'a??b>>c';
		expect(usernameFromToken(fakeJwt({ kbve_username: name }))).toBe(name);
	});
});

describe('makeWsResolver', () => {
	it('returns the env value when set', () => {
		expect(makeWsResolver('wss://env/ws', 'wss://fallback/ws')()).toBe(
			'wss://env/ws',
		);
	});

	it('falls back when the env value is empty or non-string', () => {
		expect(makeWsResolver('', 'wss://fallback/ws')()).toBe(
			'wss://fallback/ws',
		);
		expect(makeWsResolver(undefined, 'wss://fallback/ws')()).toBe(
			'wss://fallback/ws',
		);
		expect(makeWsResolver(42, 'wss://fallback/ws')()).toBe(
			'wss://fallback/ws',
		);
	});
});

function sourceWith(token: string | null): SessionSource {
	return {
		getSession: async () => (token ? { access_token: token } : null),
	};
}

describe('createNetConfig', () => {
	const resolveWsUrl = () => 'wss://game/ws';

	it('builds a config from a session, deriving username from the jwt', async () => {
		const jwt = fakeJwt({ kbve_username: 'trinity' });
		const store = createNetConfig({
			source: sourceWith(jwt),
			resolveWsUrl,
		});
		const cfg = await store.build();
		expect(cfg).toEqual({
			wsUrl: 'wss://game/ws',
			jwt,
			username: 'trinity',
		});
		expect(store.get()).toEqual(cfg);
	});

	it('returns null when there is no session (no guest path)', async () => {
		const store = createNetConfig({
			source: sourceWith(null),
			resolveWsUrl,
		});
		expect(await store.build()).toBeNull();
		expect(store.get()).toBeNull();
	});

	it('set / get / clear round-trip', () => {
		const store = createNetConfig({
			source: sourceWith(null),
			resolveWsUrl,
		});
		const cfg = { wsUrl: 'wss://x/ws', jwt: 'j', username: 'u' };
		store.set(cfg);
		expect(store.get()).toEqual(cfg);
		store.clear();
		expect(store.get()).toBeNull();
	});

	it('a session without a username still builds (empty username)', async () => {
		const jwt = fakeJwt({ sub: 'no-name' });
		const store = createNetConfig({
			source: sourceWith(jwt),
			resolveWsUrl,
		});
		const cfg = await store.build();
		expect(cfg?.jwt).toBe(jwt);
		expect(cfg?.username).toBe('');
	});
});

describe('createChatClient', () => {
	const chat: ChatConfig = {
		game: 'arpg',
		channel: '#general',
		resolveUrl: () => 'wss://chat.kbve.com/gamechat',
	};

	it('builds a RealmChatClient when a jwt is present (no socket until connect)', () => {
		const client = createChatClient(chat, fakeJwt({ kbve_username: 'a' }));
		expect(client).toBeInstanceOf(RealmChatClient);
		// the constructor wires the state machine but opens no socket — the
		// pre-connect default is 'connecting' with zero attempts. ChatPanel owns
		// the explicit connect() call.
		expect(client?.getState()).toEqual({
			status: 'connecting',
			attempts: 0,
		});
	});

	it('returns null without a jwt', () => {
		expect(createChatClient(chat, null)).toBeNull();
		expect(createChatClient(chat, undefined)).toBeNull();
		expect(createChatClient(chat, '')).toBeNull();
	});
});

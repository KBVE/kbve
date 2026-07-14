import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	droidSignOut,
	readDroidSession,
	readDroidSessionFromIdb,
	subscribeDroidSession,
} from '../droidStorage';

function jwt(claims: Record<string, unknown>): string {
	const encode = (obj: unknown) =>
		btoa(JSON.stringify(obj))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	return `${encode({ alg: 'none' })}.${encode(claims)}.sig`;
}

const USER_ID = 'user-123';

function seedSession(overrides: Record<string, unknown> = {}) {
	const session = {
		access_token: jwt({ sub: USER_ID, kbve_username: 'claimname' }),
		refresh_token: 'refresh-1',
		expires_at: 1900000000,
		user: { id: USER_ID, email: 'a@kbve.com' },
		...overrides,
	};
	localStorage.setItem('sb-auth-token', JSON.stringify(session));
	return session;
}

async function seedIdb(key: string, value: unknown) {
	const db = new Dexie('sb-auth-v2');
	db.version(1).stores({ kv: 'key' });
	await db.table('kv').put({ key, value: JSON.stringify(value) });
	db.close();
}

afterEach(async () => {
	localStorage.clear();
	vi.restoreAllMocks();
	await Dexie.delete('sb-auth-v2');
});

describe('readDroidSession', () => {
	it('returns null when storage is empty', () => {
		expect(readDroidSession()).toBeNull();
	});

	it('maps a stored session with username from the jwt claim', () => {
		seedSession();
		const session = readDroidSession();
		expect(session?.user.id).toBe(USER_ID);
		expect(session?.user.email).toBe('a@kbve.com');
		expect(session?.user.username).toBe('claimname');
		expect(session?.refreshToken).toBe('refresh-1');
	});

	it('unwraps the legacy currentSession envelope', () => {
		const inner = {
			access_token: jwt({ sub: USER_ID }),
			user: { id: USER_ID },
		};
		localStorage.setItem(
			'sb-auth-token',
			JSON.stringify({ currentSession: inner }),
		);
		expect(readDroidSession()?.user.id).toBe(USER_ID);
	});

	it('prefers the droid profile cache username over the jwt claim', () => {
		seedSession();
		localStorage.setItem(
			'cache:profile:me',
			JSON.stringify({
				user_id: USER_ID,
				cached_at: 0,
				profile: { user_id: USER_ID, username: 'cachedname' },
			}),
		);
		expect(readDroidSession()?.user.username).toBe('cachedname');
	});

	it('ignores a profile cache for a different user', () => {
		seedSession();
		localStorage.setItem(
			'cache:profile:me',
			JSON.stringify({
				user_id: 'other-user',
				cached_at: 0,
				profile: { user_id: 'other-user', username: 'stranger' },
			}),
		);
		expect(readDroidSession()?.user.username).toBe('claimname');
	});

	it('returns null on malformed json', () => {
		localStorage.setItem('sb-auth-token', '{not json');
		expect(readDroidSession()).toBeNull();
	});
});

describe('readDroidSessionFromIdb', () => {
	it('returns null when the auth db is empty', async () => {
		expect(await readDroidSessionFromIdb()).toBeNull();
	});

	it('reads the shared-worker key', async () => {
		await seedIdb('sb-auth-token', {
			access_token: jwt({ sub: USER_ID, kbve_username: 'idbname' }),
			user: { id: USER_ID },
		});
		const session = await readDroidSessionFromIdb();
		expect(session?.user.id).toBe(USER_ID);
		expect(session?.user.username).toBe('idbname');
	});

	it('scans for the supabase-js default storage key', async () => {
		await seedIdb('sb-supabase-auth-token', {
			access_token: jwt({ sub: USER_ID }),
			user: { id: USER_ID, email: 'b@kbve.com' },
		});
		const session = await readDroidSessionFromIdb();
		expect(session?.user.id).toBe(USER_ID);
		expect(session?.user.email).toBe('b@kbve.com');
	});

	it('applies the profile cache username to idb sessions', async () => {
		await seedIdb('sb-supabase-auth-token', {
			access_token: jwt({ sub: USER_ID }),
			user: { id: USER_ID },
		});
		localStorage.setItem(
			'cache:profile:me',
			JSON.stringify({
				user_id: USER_ID,
				cached_at: 0,
				profile: { user_id: USER_ID, username: 'cachedname' },
			}),
		);
		expect((await readDroidSessionFromIdb())?.user.username).toBe(
			'cachedname',
		);
	});
});

describe('subscribeDroidSession', () => {
	it('emits on storage events for the session key', () => {
		const cb = vi.fn();
		const unsubscribe = subscribeDroidSession(cb);
		seedSession();
		window.dispatchEvent(
			new StorageEvent('storage', { key: 'sb-auth-token' }),
		);
		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb.mock.calls[0][0]?.user.id).toBe(USER_ID);
		unsubscribe();
		window.dispatchEvent(
			new StorageEvent('storage', { key: 'sb-auth-token' }),
		);
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('ignores unrelated storage keys', () => {
		const cb = vi.fn();
		const unsubscribe = subscribeDroidSession(cb);
		window.dispatchEvent(
			new StorageEvent('storage', { key: 'something-else' }),
		);
		expect(cb).not.toHaveBeenCalled();
		unsubscribe();
	});
});

describe('droidSignOut', () => {
	it('revokes the token and clears droid storage keys', async () => {
		const session = seedSession();
		localStorage.setItem('cache:profile:me', '{}');
		localStorage.setItem('cache:staff:perms', '{}');
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 204 }));
		await droidSignOut({
			supabaseUrl: 'https://supabase.kbve.com',
			anonKey: 'anon',
		});
		expect(fetchMock).toHaveBeenCalledWith(
			'https://supabase.kbve.com/auth/v1/logout',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: `Bearer ${session.access_token}`,
				}),
			}),
		);
		expect(localStorage.getItem('sb-auth-token')).toBeNull();
		expect(localStorage.getItem('cache:profile:me')).toBeNull();
		expect(localStorage.getItem('cache:staff:perms')).toBeNull();
	});

	it('still clears storage when signed out already', async () => {
		localStorage.setItem('cache:profile:me', '{}');
		const fetchMock = vi.spyOn(globalThis, 'fetch');
		await droidSignOut({
			supabaseUrl: 'https://supabase.kbve.com',
			anonKey: 'anon',
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(localStorage.getItem('cache:profile:me')).toBeNull();
	});
});

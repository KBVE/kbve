import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearStorage } from '../clearStorage';

async function seedIdb(name: string) {
	const db = new Dexie(name);
	db.version(1).stores({ kv: 'key' });
	await db.table('kv').put({ key: 'sb-auth-token', value: 'x' });
	db.close();
}

afterEach(async () => {
	localStorage.clear();
	sessionStorage.clear();
	vi.restoreAllMocks();
	await Dexie.delete('sb-auth-v2');
	await Dexie.delete('sb-auth');
});

describe('clearStorage', () => {
	it('clears localStorage', async () => {
		localStorage.setItem('cache:staff:perms', '{"bitmask":1}');
		await clearStorage();
		expect(localStorage.length).toBe(0);
	});

	it('clears sessionStorage', async () => {
		sessionStorage.setItem('k', 'v');
		await clearStorage();
		expect(sessionStorage.length).toBe(0);
	});

	it('deletes IndexedDB databases including the session store', async () => {
		await seedIdb('sb-auth-v2');
		await clearStorage();
		const names = (await indexedDB.databases()).map((d) => d.name);
		expect(names).not.toContain('sb-auth-v2');
	});

	it('falls back to known db names when databases() is unavailable', async () => {
		await seedIdb('sb-auth-v2');
		const spy = vi
			.spyOn(indexedDB, 'databases')
			.mockImplementation(() => {
				throw new Error('unsupported');
			});
		await clearStorage();
		spy.mockRestore();
		const names = (await indexedDB.databases()).map((d) => d.name);
		expect(names).not.toContain('sb-auth-v2');
	});

	it('resolves without throwing when APIs are missing', async () => {
		await expect(clearStorage()).resolves.toBeUndefined();
	});
});

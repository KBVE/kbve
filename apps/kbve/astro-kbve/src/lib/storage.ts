// src/lib/storage.ts
// Shared IndexedDB storage implementation for Supabase using Dexie
// This ensures the window client and SharedWorker share the same session storage

import Dexie, { type Table } from 'dexie';

interface AsyncStorage {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string): Promise<void>;
	removeItem(key: string): Promise<void>;
}

interface KVPair {
	key: string;
	value: string;
}

class AuthDB extends Dexie {
	kv!: Table<KVPair, string>;

	constructor() {
		super('sb-auth-v2');
		this.version(1).stores({
			kv: 'key',
		});
	}
}

export class IDBStorage implements AsyncStorage {
	private db: AuthDB;

	constructor() {
		this.db = new AuthDB();
	}

	async getItem(key: string): Promise<string | null> {
		try {
			const item = await this.db.kv.get(key);
			return item?.value ?? null;
		} catch (err) {
			console.error('[IDBStorage] getItem error:', err);
			return null;
		}
	}

	async setItem(key: string, value: string): Promise<void> {
		try {
			await this.db.kv.put({ key, value });
		} catch (err) {
			console.error('[IDBStorage] setItem error:', err);
			throw err;
		}
	}

	async removeItem(key: string): Promise<void> {
		try {
			await this.db.kv.delete(key);
		} catch (err) {
			console.error('[IDBStorage] removeItem error:', err);
			throw err;
		}
	}
}

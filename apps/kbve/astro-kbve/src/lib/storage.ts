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

/**
 * IndexedDB-backed storage with automatic in-memory fallback.
 * If IDB is unavailable (Safari private browsing, corrupted DB, etc.)
 * the storage degrades to a Map — session works for the tab lifetime
 * but won't persist across reloads.
 */
export class IDBStorage implements AsyncStorage {
	private db: AuthDB | null = null;
	private memFallback: Map<string, string> | null = null;
	private initPromise: Promise<void>;

	constructor() {
		this.initPromise = this.tryOpenDB();
	}

	private async tryOpenDB(): Promise<void> {
		try {
			const db = new AuthDB();
			await db.open();
			this.db = db;
		} catch (err) {
			console.warn(
				'[IDBStorage] IndexedDB unavailable, using in-memory fallback:',
				err,
			);
			this.memFallback = new Map();
		}
	}

	private async ready(): Promise<void> {
		await this.initPromise;
	}

	async getItem(key: string): Promise<string | null> {
		await this.ready();
		if (this.memFallback) return this.memFallback.get(key) ?? null;
		try {
			const item = await this.db!.kv.get(key);
			return item?.value ?? null;
		} catch (err) {
			console.error('[IDBStorage] getItem error:', err);
			return null;
		}
	}

	async setItem(key: string, value: string): Promise<void> {
		await this.ready();
		if (this.memFallback) {
			this.memFallback.set(key, value);
			return;
		}
		try {
			await this.db!.kv.put({ key, value });
		} catch (err) {
			console.error('[IDBStorage] setItem error:', err);
			throw err;
		}
	}

	async removeItem(key: string): Promise<void> {
		await this.ready();
		if (this.memFallback) {
			this.memFallback.delete(key);
			return;
		}
		try {
			await this.db!.kv.delete(key);
		} catch (err) {
			console.error('[IDBStorage] removeItem error:', err);
			throw err;
		}
	}

	async clearAll(): Promise<void> {
		await this.ready();
		if (this.memFallback) {
			this.memFallback.clear();
			return;
		}
		await this.db!.kv.clear();
	}

	close(): void {
		if (this.db) this.db.close();
		this.db = null;
	}
}

import Dexie, { type Table } from 'dexie';

interface KVPair {
	key: string;
	value: string;
}

class AuthDB extends Dexie {
	kv!: Table<KVPair, string>;

	constructor() {
		super('sb-auth-v2');
		this.version(1).stores({ kv: 'key' });
	}
}

/**
 * IndexedDB-backed storage with automatic in-memory fallback.
 * If IDB is unavailable (Safari private browsing, corrupted DB, etc.)
 * the storage degrades to a Map — session works for the tab lifetime
 * but won't persist across reloads.
 */
export class IDBStorage {
	private db: AuthDB | null = null;
	private memFallback: Map<string, string> | null = null;
	private initPromise: Promise<void>;

	constructor() {
		this.initPromise = this.tryOpenDB();
	}

	private async tryOpenDB(): Promise<void> {
		try {
			const db = new AuthDB();
			// Force an actual IDB open to detect permission errors early
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
		} catch {
			return null;
		}
	}

	async setItem(key: string, value: string): Promise<void> {
		await this.ready();
		if (this.memFallback) {
			this.memFallback.set(key, value);
			return;
		}
		await this.db!.kv.put({ key, value });
	}

	async removeItem(key: string): Promise<void> {
		await this.ready();
		if (this.memFallback) {
			this.memFallback.delete(key);
			return;
		}
		await this.db!.kv.delete(key);
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

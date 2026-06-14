import type { ServerCard } from './types';

// ── Cache layer for Discord servers via IndexedDB ───────────────────

const CACHE_DB_NAME = 'DiscordSHCache';
const CACHE_DB_VERSION = 1;
const SERVERS_STORE = 'servers';
const META_STORE = 'meta';

// Cache TTL: 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedServersBlob {
	servers: ServerCard[];
	total: number;
	category: string | null;
	sort: string;
	page: number;
	limit: number;
	cached_at: number;
}

interface MetaRecord {
	key: string;
	value: unknown;
}

// ── IndexedDB wrapper ────────────────────────────────────────────────

class ServerCacheDB {
	private db: IDBDatabase | null = null;

	async open(): Promise<IDBDatabase> {
		if (this.db) return this.db;

		return new Promise((resolve, reject) => {
			const req = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

			req.onerror = () => reject(req.error);
			req.onsuccess = () => {
				this.db = req.result;
				resolve(req.result);
			};

			req.onupgradeneeded = (e) => {
				const db = (e.target as IDBOpenDBRequest).result;

				// Store for paginated server lists
				if (!db.objectStoreNames.contains(SERVERS_STORE)) {
					const store = db.createObjectStore(SERVERS_STORE, {
						keyPath: 'cache_key',
					});
					store.createIndex('cached_at', 'cached_at', { unique: false });
				}

				// Store for metadata (last fetch timestamp, version, etc.)
				if (!db.objectStoreNames.contains(META_STORE)) {
					db.createObjectStore(META_STORE, { keyPath: 'key' });
				}
			};
		});
	}

	async getCachedServers(
		category: string | null,
		sort: string,
		page: number,
		limit: number,
	): Promise<CachedServersBlob | null> {
		try {
			const db = await this.open();
			const key = buildCacheKey(category, sort, page, limit);

			return new Promise((resolve, reject) => {
				const tx = db.transaction([SERVERS_STORE], 'readonly');
				const store = tx.objectStore(SERVERS_STORE);
				const req = store.get(key);

				req.onsuccess = () => {
					const blob = req.result as CachedServersBlob | undefined;
					if (!blob) {
						resolve(null);
						return;
					}

					// Check TTL
					if (Date.now() - blob.cached_at > CACHE_TTL_MS) {
						resolve(null);
						return;
					}

					resolve(blob);
				};
				req.onerror = () => reject(req.error);
			});
		} catch (err) {
			console.warn('[serverCache] getCachedServers error:', err);
			return null;
		}
	}

	async setCachedServers(
		category: string | null,
		sort: string,
		page: number,
		limit: number,
		servers: ServerCard[],
		total: number,
	): Promise<void> {
		try {
			const db = await this.open();
			const key = buildCacheKey(category, sort, page, limit);

			const blob: CachedServersBlob & { cache_key: string } = {
				cache_key: key,
				servers,
				total,
				category,
				sort,
				page,
				limit,
				cached_at: Date.now(),
			};

			return new Promise((resolve, reject) => {
				const tx = db.transaction([SERVERS_STORE], 'readwrite');
				const store = tx.objectStore(SERVERS_STORE);
				const req = store.put(blob);

				req.onsuccess = () => resolve();
				req.onerror = () => reject(req.error);
			});
		} catch (err) {
			console.warn('[serverCache] setCachedServers error:', err);
		}
	}

	async clearCache(): Promise<void> {
		try {
			const db = await this.open();
			return new Promise((resolve, reject) => {
				const tx = db.transaction([SERVERS_STORE], 'readwrite');
				const store = tx.objectStore(SERVERS_STORE);
				const req = store.clear();

				req.onsuccess = () => resolve();
				req.onerror = () => reject(req.error);
			});
		} catch (err) {
			console.warn('[serverCache] clearCache error:', err);
		}
	}

	async setMeta(key: string, value: unknown): Promise<void> {
		try {
			const db = await this.open();
			return new Promise((resolve, reject) => {
				const tx = db.transaction([META_STORE], 'readwrite');
				const store = tx.objectStore(META_STORE);
				const req = store.put({ key, value });

				req.onsuccess = () => resolve();
				req.onerror = () => reject(req.error);
			});
		} catch (err) {
			console.warn('[serverCache] setMeta error:', err);
		}
	}

	async getMeta(key: string): Promise<unknown | null> {
		try {
			const db = await this.open();
			return new Promise((resolve, reject) => {
				const tx = db.transaction([META_STORE], 'readonly');
				const store = tx.objectStore(META_STORE);
				const req = store.get(key);

				req.onsuccess = () => {
					const record = req.result as MetaRecord | undefined;
					resolve(record?.value ?? null);
				};
				req.onerror = () => reject(req.error);
			});
		} catch (err) {
			console.warn('[serverCache] getMeta error:', err);
			return null;
		}
	}
}

function buildCacheKey(
	category: string | null,
	sort: string,
	page: number,
	limit: number,
): string {
	return `${category ?? 'all'}:${sort}:${page}:${limit}`;
}

// ── Singleton instance ───────────────────────────────────────────────

const cacheDB = new ServerCacheDB();

// ── Public API ───────────────────────────────────────────────────────

export async function getCachedServers(opts: {
	category?: string;
	sort?: string;
	page?: number;
	limit?: number;
}): Promise<{ servers: ServerCard[]; total: number } | null> {
	const category = opts.category ?? null;
	const sort = opts.sort ?? 'votes';
	const page = opts.page ?? 1;
	const limit = opts.limit ?? 24;

	const blob = await cacheDB.getCachedServers(category, sort, page, limit);
	if (!blob) return null;

	return {
		servers: blob.servers,
		total: blob.total,
	};
}

export async function setCachedServers(
	opts: {
		category?: string;
		sort?: string;
		page?: number;
		limit?: number;
	},
	servers: ServerCard[],
	total: number,
): Promise<void> {
	const category = opts.category ?? null;
	const sort = opts.sort ?? 'votes';
	const page = opts.page ?? 1;
	const limit = opts.limit ?? 24;

	await cacheDB.setCachedServers(category, sort, page, limit, servers, total);
}

export async function clearServerCache(): Promise<void> {
	await cacheDB.clearCache();
}

export async function setCacheMeta(key: string, value: unknown): Promise<void> {
	await cacheDB.setMeta(key, value);
}

export async function getCacheMeta(key: string): Promise<unknown | null> {
	return cacheDB.getMeta(key);
}

import { createWorkerPool } from '../worker/pool';
import type { KVStore } from './types';

// Web cache is owned by the Worker (single Dexie/IndexedDB writer for the tab).
// kvStore delegates to the shared pool rather than opening its own Dexie on the
// main thread — otherwise main + worker would both write the same db and race.
const pool = createWorkerPool();

export const kvStore: KVStore = {
	get: (key) => pool.cacheGet(key),
	set: (key, value) => pool.cacheSet(key, value),
	remove: (key) => pool.cacheRemove(key),
	keys: () => pool.cacheKeys(),
	clear: () => pool.cacheClear(),
};

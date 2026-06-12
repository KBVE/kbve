import Dexie, { type Table } from 'dexie';

export const CACHE_DB_NAME = 'kbve-cache-v1';

export interface CacheRecord {
	key: string;
	value: string;
	ts: number;
}

export class CacheDB extends Dexie {
	cache!: Table<CacheRecord, string>;

	constructor() {
		super(CACHE_DB_NAME);
		this.version(1).stores({
			cache: 'key, ts',
		});
	}
}

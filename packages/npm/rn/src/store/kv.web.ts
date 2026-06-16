import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { KVStore } from './types';

interface Row {
	key: string;
	value: unknown;
}

class KbveDb extends Dexie {
	kv!: Table<Row, string>;
	constructor() {
		super('kbve');
		this.version(1).stores({ kv: 'key' });
	}
}

const db = new KbveDb();

export const kvStore: KVStore = {
	async get(key) {
		const row = await db.kv.get(key);
		return row ? (row.value as never) : null;
	},
	async set(key, value) {
		await db.kv.put({ key, value });
	},
	async remove(key) {
		await db.kv.delete(key);
	},
	async keys() {
		return (await db.kv.toCollection().primaryKeys()) as string[];
	},
	async clear() {
		await db.kv.clear();
	},
};

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

export class IDBStorage {
	private db: AuthDB;

	constructor() {
		this.db = new AuthDB();
	}

	async getItem(key: string): Promise<string | null> {
		try {
			const item = await this.db.kv.get(key);
			return item?.value ?? null;
		} catch {
			return null;
		}
	}

	async setItem(key: string, value: string): Promise<void> {
		await this.db.kv.put({ key, value });
	}

	async removeItem(key: string): Promise<void> {
		await this.db.kv.delete(key);
	}
}

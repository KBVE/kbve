import * as Comlink from 'comlink';
import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { PoolRequestInit, PoolResponse } from './types';

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

const api = {
	async request<T>(
		url: string,
		init?: PoolRequestInit,
	): Promise<PoolResponse<T>> {
		try {
			const res = await fetch(url, {
				method: init?.method ?? 'GET',
				headers: init?.headers,
				body: init?.body,
			});
			const data = (await res.json().catch(() => null)) as T | null;
			return {
				ok: res.ok,
				status: res.status,
				data,
				error: res.ok ? null : `HTTP ${res.status}`,
			};
		} catch (e) {
			return {
				ok: false,
				status: 0,
				data: null,
				error: e instanceof Error ? e.message : 'request failed',
			};
		}
	},
	async cacheGet<T>(key: string): Promise<T | null> {
		const row = await db.kv.get(key);
		return row ? (row.value as T) : null;
	},
	async cacheSet<T>(key: string, value: T): Promise<void> {
		await db.kv.put({ key, value });
	},
	async cacheRemove(key: string): Promise<void> {
		await db.kv.delete(key);
	},
	async cacheKeys(): Promise<string[]> {
		return (await db.kv.toCollection().primaryKeys()) as string[];
	},
	async cacheClear(): Promise<void> {
		await db.kv.clear();
	},
};

Comlink.expose(api);

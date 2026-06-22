import * as Comlink from 'comlink';
import Dexie from 'dexie';
import type { Table } from 'dexie';
import { request as coreRequest } from '@kbve/core';
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
		return coreRequest<T>(url, {
			method: init?.method,
			headers: init?.headers,
			body: init?.body,
		});
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

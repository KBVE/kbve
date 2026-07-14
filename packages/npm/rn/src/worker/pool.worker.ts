import * as Comlink from 'comlink';
import Dexie from 'dexie';
import type { Table } from 'dexie';
import { request as coreRequest } from '@kbve/core';
import type { PoolRawResponse, PoolRequestInit, PoolResponse } from './types';

const RAW_TIMEOUT_MS = 20000;
const STRIP_HEADERS = new Set(['content-encoding', 'content-length']);

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
	async fetchRaw(
		url: string,
		init?: PoolRequestInit,
	): Promise<PoolRawResponse> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), RAW_TIMEOUT_MS);
		try {
			const res = await fetch(url, {
				method: init?.method ?? 'GET',
				headers: init?.headers,
				body: init?.body,
				signal: controller.signal,
			});
			const body = await res.text();
			const headers: Record<string, string> = {};
			res.headers.forEach((value, key) => {
				if (!STRIP_HEADERS.has(key.toLowerCase())) headers[key] = value;
			});
			return {
				status: res.status,
				statusText: res.statusText,
				headers,
				body,
			};
		} finally {
			clearTimeout(timer);
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

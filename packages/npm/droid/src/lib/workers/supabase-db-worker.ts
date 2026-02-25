/// <reference lib="webworker" />
// Database worker for Supabase operations (used in worker pool)

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Dexie, { type Table } from 'dexie';

type WorkerMessage =
	| { id: string; type: 'ping'; payload?: unknown }
	| {
			id: string;
			type: 'init';
			payload: {
				url: string;
				anonKey: string;
				options?: Record<string, unknown>;
			};
	  }
	| {
			id: string;
			type: 'from.select';
			payload: {
				table: string;
				columns?: string;
				match?: Record<string, unknown>;
				limit?: number;
			};
	  }
	| {
			id: string;
			type: 'from.insert';
			payload: {
				table: string;
				data: Record<string, unknown> | Record<string, unknown>[];
			};
	  }
	| {
			id: string;
			type: 'from.update';
			payload: {
				table: string;
				data: Record<string, unknown>;
				match: Record<string, unknown>;
			};
	  }
	| {
			id: string;
			type: 'from.upsert';
			payload: {
				table: string;
				data: Record<string, unknown> | Record<string, unknown>[];
			};
	  }
	| {
			id: string;
			type: 'from.delete';
			payload: { table: string; match: Record<string, unknown> };
	  }
	| {
			id: string;
			type: 'rpc';
			payload: { fn: string; args?: Record<string, unknown> };
	  };

declare const self: DedicatedWorkerGlobalScope;

let client: SupabaseClient | null = null;
let workerId: number | null = null;

// IDB-backed namespaced storage using Dexie 4
interface KVPair {
	key: string;
	value: string;
}

class StateDB extends Dexie {
	kv!: Table<KVPair>;

	constructor() {
		super('sb-auth-v2');
		this.version(1).stores({
			kv: 'key',
		});
	}
}

const db = new StateDB();

/**
 * Namespaced storage adapter for worker isolation
 *
 * - Reads: shared auth state from SharedWorker
 * - Writes: worker-namespaced keys to prevent conflicts
 */
function createWorkerStorage(id: number) {
	return {
		async getItem(key: string): Promise<string | null> {
			try {
				const workerKey = `worker:${id}:${key}`;
				let item = await db.kv.get(workerKey);
				if (!item) {
					const authKey = `auth:${key}`;
					item = await db.kv.get(authKey);
				}
				return item?.value ?? null;
			} catch (err) {
				console.error(`[DB Worker ${id}] getItem error:`, err);
				return null;
			}
		},
		async setItem(key: string, value: string): Promise<void> {
			const workerKey = `worker:${id}:${key}`;
			await db.kv.put({ key: workerKey, value });
		},
		async removeItem(key: string): Promise<void> {
			const workerKey = `worker:${id}:${key}`;
			await db.kv.delete(workerKey);
		},
	};
}

console.log('[DB Worker] Initializing...');

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
	const msg = e.data;
	const { id, type, payload } = msg;

	try {
		switch (type) {
			case 'ping': {
				respond(id, { ok: true, data: 'pong' });
				break;
			}
			case 'init': {
				const { url, anonKey, options } = payload;

				if (self.name && self.name.includes('db-worker-')) {
					workerId = parseInt(self.name.split('db-worker-')[1], 10);
				} else {
					workerId = Math.floor(Math.random() * 1000);
				}

				console.log(`[DB Worker] Assigned ID: ${workerId}`);
				const workerStorage = createWorkerStorage(workerId);

				const authOverrides =
					options?.auth && typeof options.auth === 'object'
						? (options.auth as Record<string, unknown>)
						: {};

				client = createClient(url, anonKey, {
					...options,
					auth: {
						...authOverrides,
						storage: workerStorage,
						storageKey: 'sb-auth-token',
						autoRefreshToken: true,
						persistSession: true,
						detectSessionInUrl: false,
					},
				});

				const {
					data: { session },
					error,
				} = await client.auth.getSession();
				if (error) console.error('[DB Worker] Session error:', error);

				respond(id, {
					ok: true,
					data: { session, user: session?.user || null },
				});
				break;
			}
			case 'from.select': {
				if (!client) throw new Error('Client not initialized');
				const { table, columns, match, limit } = payload;
				let query = client.from(table).select(columns || '*');
				if (match) {
					for (const [key, value] of Object.entries(match)) {
						query = query.eq(key, value);
					}
				}
				if (limit) query = query.limit(limit);
				const { data, error } = await query;
				if (error) throw error;
				respond(id, { ok: true, data });
				break;
			}
			case 'from.insert': {
				if (!client) throw new Error('Client not initialized');
				const { table, data } = payload;
				const { data: result, error } = await client
					.from(table)
					.insert(data)
					.select();
				if (error) throw error;
				respond(id, { ok: true, data: result });
				break;
			}
			case 'from.update': {
				if (!client) throw new Error('Client not initialized');
				const { table, data, match } = payload;
				let query = client.from(table).update(data);
				for (const [key, value] of Object.entries(match)) {
					query = query.eq(key, value);
				}
				const { data: result, error } = await query.select();
				if (error) throw error;
				respond(id, { ok: true, data: result });
				break;
			}
			case 'from.upsert': {
				if (!client) throw new Error('Client not initialized');
				const { table, data } = payload;
				const { data: result, error } = await client
					.from(table)
					.upsert(data)
					.select();
				if (error) throw error;
				respond(id, { ok: true, data: result });
				break;
			}
			case 'from.delete': {
				if (!client) throw new Error('Client not initialized');
				const { table, match } = payload;
				let query = client.from(table).delete();
				for (const [key, value] of Object.entries(match)) {
					query = query.eq(key, value);
				}
				const { data: result, error } = await query.select();
				if (error) throw error;
				respond(id, { ok: true, data: result });
				break;
			}
			case 'rpc': {
				if (!client) throw new Error('Client not initialized');
				const { fn, args } = payload;
				const { data, error } = await client.rpc(fn, args || {});
				if (error) throw error;
				respond(id, { ok: true, data });
				break;
			}
			default:
				respond(id, {
					ok: false,
					error: `Unknown message type: ${type}`,
				});
		}
	} catch (err: unknown) {
		console.error(`[DB Worker] Error handling ${type}:`, err);
		respond(id, {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		});
	}
};

function respond(
	id: string,
	response: { ok: true; data?: unknown } | { ok: false; error: string },
) {
	self.postMessage({ id, ...response });
}

console.log('[DB Worker] Ready');

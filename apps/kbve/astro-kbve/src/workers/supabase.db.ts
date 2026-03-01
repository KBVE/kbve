/// <reference lib="webworker" />
// src/workers/supabase.db.ts
// Database worker for Supabase operations (used in worker pool)

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Dexie, { type Table } from 'dexie';

type WorkerMessage =
	| { id: string; type: 'ping'; payload?: any }
	| {
			id: string;
			type: 'init';
			payload: { url: string; anonKey: string; options?: any };
	  }
	| {
			id: string;
			type: 'from.select';
			payload: {
				table: string;
				columns?: string;
				match?: Record<string, any>;
				limit?: number;
			};
	  }
	| {
			id: string;
			type: 'from.insert';
			payload: {
				table: string;
				data: Record<string, any> | Record<string, any>[];
			};
	  }
	| {
			id: string;
			type: 'from.update';
			payload: {
				table: string;
				data: Record<string, any>;
				match: Record<string, any>;
			};
	  }
	| {
			id: string;
			type: 'from.upsert';
			payload: {
				table: string;
				data: Record<string, any> | Record<string, any>[];
			};
	  }
	| {
			id: string;
			type: 'from.delete';
			payload: { table: string; match: Record<string, any> };
	  }
	| {
			id: string;
			type: 'rpc';
			payload: { fn: string; args?: Record<string, any> };
	  };

type WorkerResponse =
	| { id: string; ok: true; data?: any }
	| { id: string; ok: false; error: string };

type WorkerResponseBody =
	| { ok: true; data?: any }
	| { ok: false; error: string };

// Supabase client instance
let client: SupabaseClient | null = null;
let workerId: number | null = null;

// Simple Dexie storage for this worker
interface KVPair {
	key: string;
	value: string;
}

class StateDB extends Dexie {
	kv!: Table<KVPair, string>;

	constructor() {
		super('sb-auth-v2');
		this.version(1).stores({
			kv: 'key',
		});
	}
}

const db = new StateDB();

/**
 * Create a namespaced storage adapter for this worker
 *
 * Namespace strategy:
 * - Reads: 'auth:*' keys (shared auth state from SharedWorker/WebSocket worker)
 * - Writes: 'worker:{id}:*' keys (isolated per worker, no conflicts)
 * - Reads: 'cache:*' keys (optional shared cache)
 *
 * This prevents write conflicts while allowing shared read access to auth state
 */
function createWorkerStorage(id: number) {
	return {
		async getItem(key: string): Promise<string | null> {
			try {
				// Try worker-specific key first
				const workerKey = `worker:${id}:${key}`;
				let item = await db.kv.get(workerKey);

				// Fall back to auth key for shared auth state
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
			try {
				// Always write to worker-namespaced key to avoid conflicts
				const workerKey = `worker:${id}:${key}`;
				await db.kv.put({ key: workerKey, value });
			} catch (err) {
				console.error(`[DB Worker ${id}] setItem error:`, err);
				throw err;
			}
		},
		async removeItem(key: string): Promise<void> {
			try {
				// Remove from worker-namespaced key
				const workerKey = `worker:${id}:${key}`;
				await db.kv.delete(workerKey);
			} catch (err) {
				console.error(`[DB Worker ${id}] removeItem error:`, err);
				throw err;
			}
		},
	};
}

// Initialize worker
console.log('[DB Worker] Initializing...');

// Handle incoming messages
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

				console.log('[DB Worker] Initializing Supabase client');

				// Derive worker ID from name if available (set by WorkerPool)
				if (self.name && self.name.includes('db-worker-')) {
					workerId = parseInt(self.name.split('db-worker-')[1], 10);
				} else {
					// Fallback: use random ID (shouldn't happen with WorkerPool)
					workerId = Math.floor(Math.random() * 1000);
				}

				console.log(`[DB Worker] Assigned ID: ${workerId}`);

				// Create namespaced storage for this worker
				const storage = createWorkerStorage(workerId);

				client = createClient(url, anonKey, {
					...options,
					auth: {
						...(options?.auth || {}),
						storage,
						storageKey: 'sb-auth-token',
						autoRefreshToken: true,
						persistSession: true,
						detectSessionInUrl: false,
					},
				});

				// Get initial session
				const {
					data: { session },
					error,
				} = await client.auth.getSession();

				if (error) {
					console.error('[DB Worker] Session error:', error);
				}

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

				if (limit) {
					query = query.limit(limit);
				}

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
	} catch (err: any) {
		console.error(`[DB Worker] Error handling ${type}:`, err);
		respond(id, { ok: false, error: err.message || String(err) });
	}
};

function respond(id: string, response: WorkerResponseBody) {
	self.postMessage({ id, ...response });
}

console.log('[DB Worker] Ready');

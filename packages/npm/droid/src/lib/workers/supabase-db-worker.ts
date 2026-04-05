/// <reference lib="webworker" />
// Database worker for Supabase operations (used in worker pool)
// Uses in-memory storage — the SharedWorker is the single auth writer to IndexedDB.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

/**
 * In-memory storage for DB workers.
 * DB workers only need the access token to make authenticated API calls.
 * The SharedWorker is the single writer to IndexedDB (sb-auth-v2).
 */
const memoryStore = new Map<string, string>();
const memoryStorage = {
	async getItem(key: string): Promise<string | null> {
		return memoryStore.get(key) ?? null;
	},
	async setItem(key: string, value: string): Promise<void> {
		memoryStore.set(key, value);
	},
	async removeItem(key: string): Promise<void> {
		memoryStore.delete(key);
	},
};

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

				const authOverrides =
					options?.['auth'] && typeof options['auth'] === 'object'
						? (options['auth'] as Record<string, unknown>)
						: {};

				client = createClient(url, anonKey, {
					...options,
					auth: {
						...authOverrides,
						storage: memoryStorage,
						storageKey: 'sb-auth-token',
						// DB pool workers are stateless (memoryStorage) — token
						// refresh is handled by the SharedWorker which owns the
						// IDB-backed session. Disabling here avoids SDK-internal
						// callbacks that produce non-cloneable objects.
						autoRefreshToken: false,
						persistSession: false,
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
		console.error('[DB Worker] Error handling %s:', String(type), err);
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
	// JSON round-trip strips non-cloneable SDK internals (functions, circular
	// refs) that would cause DataCloneError in postMessage.
	let safe: typeof response;
	try {
		safe = JSON.parse(JSON.stringify(response));
	} catch {
		safe = { ok: false, error: 'Response contained non-serializable data' };
	}
	self.postMessage({ id, ...safe });
}

console.log('[DB Worker] Ready');

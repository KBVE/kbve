/// <reference lib="webworker" />
// Supabase SharedWorker: Handles auth, realtime, and WebSocket connections
// Shared across tabs via MessagePort

import {
	createClient,
	type SupabaseClient,
	type RealtimePostgresChangesFilter,
	REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
} from '@supabase/supabase-js';
import Dexie, { type Table } from 'dexie';
import { getWorkerCommunication } from '../gateway/WorkerCommunication';

type RealtimeSubscribeParams = {
	event: string;
	schema: string;
	table?: string;
	filter?: string;
};

type Req =
	| {
			id: string;
			type: 'init';
			payload: {
				url: string;
				anonKey: string;
				options?: Record<string, unknown>;
			};
	  }
	| { id: string; type: 'getSession' }
	| {
			id: string;
			type: 'signInWithPassword';
			payload: { email: string; password: string };
	  }
	| { id: string; type: 'signOut' }
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
	  }
	| {
			id: string;
			type: 'realtime.subscribe';
			payload: { key: string; params: RealtimeSubscribeParams };
	  }
	| { id: string; type: 'realtime.unsubscribe'; payload: { key: string } }
	| { id: string; type: 'ws.connect'; payload?: { wsUrl?: string } }
	| { id: string; type: 'ws.disconnect' }
	| { id: string; type: 'ws.send'; payload: { data: unknown } }
	| { id: string; type: 'ws.status' };

type Res =
	| { id: string; ok: true; data?: unknown }
	| { id: string; ok: false; error: string };

const ports = new Set<MessagePort>();

/** Post to all connected ports, removing dead ones on failure */
function safeBroadcast(msg: unknown) {
	for (const p of ports) {
		try {
			p.postMessage(msg);
		} catch {
			ports.delete(p);
		}
	}
}

// ---- IDB-backed auth storage using Dexie 4 ----
interface KVPair {
	key: string;
	value: string;
}

class AuthDB extends Dexie {
	kv!: Table<KVPair>;

	constructor() {
		super('sb-auth-v2');
		this.version(1).stores({
			kv: 'key',
		});
	}
}

class IDBStorage {
	private db: AuthDB;

	constructor() {
		this.db = new AuthDB();
	}

	async getItem(key: string): Promise<string | null> {
		try {
			const item = await this.db.kv.get(key);
			return item?.value ?? null;
		} catch (err) {
			console.error('[Worker IDBStorage] getItem error:', err);
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

// ---- Supabase management ----
let client: SupabaseClient | null = null;
const storage = new IDBStorage();
const comm = getWorkerCommunication();
const subscriptions = new Map<
	string,
	{ unsubscribe: () => Promise<void> | void }
>();

// ---- WebSocket management ----
let ws: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsReconnectAttempts = 0;
const WS_MAX_RECONNECT_ATTEMPTS = 5;
const WS_RECONNECT_DELAY_MS = 3000;

// ---- Heartbeat management ----
let wsHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let wsLastPongTime = 0;
const WS_HEARTBEAT_INTERVAL_MS = 30000;
const WS_HEARTBEAT_TIMEOUT_MS = 60000;

function getWebSocketUrl(customUrl?: string): string {
	if (customUrl) return customUrl;
	if (typeof location !== 'undefined') {
		const isLocalhost =
			location.hostname === 'localhost' ||
			location.hostname === '127.0.0.1';
		const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const port = isLocalhost ? '4321' : location.port;
		const host = location.hostname;
		return `${protocol}//${host}${port ? ':' + port : ''}/ws`;
	}
	return 'ws://localhost:4321/ws';
}

async function connectWebSocket(wsUrl?: string) {
	if (
		ws &&
		(ws.readyState === WebSocket.CONNECTING ||
			ws.readyState === WebSocket.OPEN)
	) {
		return;
	}

	if (!client) throw new Error('Supabase client not initialized');

	const {
		data: { session },
		error,
	} = await client.auth.getSession();
	if (error || !session?.access_token) {
		throw new Error('No active session');
	}

	const url = getWebSocketUrl(wsUrl);
	const authenticatedUrl = `${url}?token=${encodeURIComponent(session.access_token)}`;

	console.log('[SharedWorker] Connecting to WebSocket:', url);
	ws = new WebSocket(authenticatedUrl);

	ws.onopen = () => {
		wsReconnectAttempts = 0;
		wsLastPongTime = Date.now();
		startHeartbeat();

		safeBroadcast({ type: 'ws.status', status: 'connected', url });
		comm.broadcast({
			type: 'ws.status',
			data: { status: 'connected', url },
		});
	};

	ws.onmessage = (event) => {
		try {
			const message = JSON.parse(event.data);
			if (message.type === 'pong') {
				wsLastPongTime = Date.now();
				return;
			}
			safeBroadcast({ type: 'ws.message', data: message });
			comm.broadcast({ type: 'ws.message', data: message });
		} catch (error) {
			console.error(
				'[SharedWorker] Failed to parse WebSocket message:',
				error,
			);
		}
	};

	ws.onerror = () => {
		safeBroadcast({
			type: 'ws.status',
			status: 'error',
			error: 'WebSocket connection error',
		});
	};

	ws.onclose = (event) => {
		ws = null;
		stopHeartbeat();

		safeBroadcast({
			type: 'ws.status',
			status: 'disconnected',
			code: event.code,
			reason: event.reason,
		});

		if (
			event.code !== 1000 &&
			wsReconnectAttempts < WS_MAX_RECONNECT_ATTEMPTS
		) {
			wsReconnectAttempts++;
			wsReconnectTimer = setTimeout(() => {
				connectWebSocket(wsUrl).catch(() => {
					/* reconnect best-effort */
				});
			}, WS_RECONNECT_DELAY_MS);
		}
	};
}

function startHeartbeat() {
	stopHeartbeat();
	wsHeartbeatTimer = setInterval(() => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			stopHeartbeat();
			return;
		}
		if (
			wsLastPongTime > 0 &&
			Date.now() - wsLastPongTime > WS_HEARTBEAT_TIMEOUT_MS
		) {
			console.warn('[SharedWorker] Heartbeat timeout');
			stopHeartbeat();
			ws.close(1001, 'Heartbeat timeout');
			return;
		}
		try {
			ws.send(JSON.stringify({ type: 'ping' }));
		} catch (error) {
			console.error('[SharedWorker] Failed to send heartbeat:', error);
		}
	}, WS_HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
	if (wsHeartbeatTimer) {
		clearInterval(wsHeartbeatTimer);
		wsHeartbeatTimer = null;
	}
}

function disconnectWebSocket() {
	if (wsReconnectTimer) {
		clearTimeout(wsReconnectTimer);
		wsReconnectTimer = null;
	}
	stopHeartbeat();
	if (ws) {
		ws.close(1000, 'Requested by client');
		ws = null;
		wsReconnectAttempts = 0;
		safeBroadcast({ type: 'ws.status', status: 'disconnected' });
	}
}

function sendWebSocketMessage(data: unknown) {
	if (!ws || ws.readyState !== WebSocket.OPEN)
		throw new Error('WebSocket not connected');
	const message = typeof data === 'string' ? data : JSON.stringify(data);
	ws.send(message);
}

function getWebSocketStatus() {
	if (!ws) return { status: 'disconnected', readyState: null };
	const readyStateMap: Record<number, string> = {
		[WebSocket.CONNECTING]: 'connecting',
		[WebSocket.OPEN]: 'connected',
		[WebSocket.CLOSING]: 'closing',
		[WebSocket.CLOSED]: 'disconnected',
	};
	return {
		status: readyStateMap[ws.readyState] || 'unknown',
		readyState: ws.readyState,
	};
}

async function ensureClient(
	url: string,
	anonKey: string,
	options: Record<string, unknown> = {},
) {
	if (client) return client;

	try {
		new URL(url);
	} catch {
		throw new Error(`Invalid Supabase URL: ${url}`);
	}

	client = createClient(url, anonKey, {
		auth: {
			storage,
			persistSession: true,
			autoRefreshToken: true,
		},
		realtime: { params: { eventsPerSecond: 5 } },
		...options,
	});

	client.auth.onAuthStateChange(async (_event, session) => {
		safeBroadcast({ type: 'auth', session });
		comm.broadcast({ type: 'auth', data: { session } });
	});

	return client;
}

function reply(port: MessagePort, msg: Res) {
	port.postMessage(msg);
}

(self as unknown as SharedWorkerGlobalScope).onconnect = (
	evt: MessageEvent,
) => {
	const port = evt.ports[0];
	ports.add(port);

	port.onmessage = async (e: MessageEvent<Req>) => {
		const m = e.data;
		try {
			switch (m.type) {
				case 'init': {
					const c = await ensureClient(
						m.payload.url,
						m.payload.anonKey,
						m.payload.options,
					);
					const { data, error } = await c.auth.getSession();
					if (error) throw error;
					reply(port, {
						id: m.id,
						ok: true,
						data: { session: data.session },
					});
					break;
				}
				case 'getSession': {
					if (!client) throw new Error('Not initialized');
					const { data, error } = await client.auth.getSession();
					if (error) throw error;
					reply(port, { id: m.id, ok: true, data });
					break;
				}
				case 'signInWithPassword': {
					if (!client) throw new Error('Not initialized');
					const { email, password } = m.payload;
					const { data, error } =
						await client.auth.signInWithPassword({
							email,
							password,
						});
					if (error) throw error;
					reply(port, { id: m.id, ok: true, data });
					break;
				}
				case 'signOut': {
					if (!client) throw new Error('Not initialized');
					const { error } = await client.auth.signOut();
					if (error) throw error;
					reply(port, { id: m.id, ok: true });
					break;
				}
				case 'from.select': {
					if (!client) throw new Error('Not initialized');
					let query = client
						.from(m.payload.table)
						.select(m.payload.columns ?? '*');
					if (m.payload.match) query = query.match(m.payload.match);
					if (m.payload.limit) query = query.limit(m.payload.limit);
					const { data, error } = await query;
					if (error) throw error;
					reply(port, { id: m.id, ok: true, data });
					break;
				}
				case 'from.insert': {
					if (!client) throw new Error('Not initialized');
					const { data, error } = await client
						.from(m.payload.table)
						.insert(m.payload.data)
						.select();
					if (error) throw error;
					reply(port, { id: m.id, ok: true, data });
					break;
				}
				case 'from.update': {
					if (!client) throw new Error('Not initialized');
					const { data, error } = await client
						.from(m.payload.table)
						.update(m.payload.data)
						.match(m.payload.match)
						.select();
					if (error) throw error;
					reply(port, { id: m.id, ok: true, data });
					break;
				}
				case 'from.upsert': {
					if (!client) throw new Error('Not initialized');
					const { data, error } = await client
						.from(m.payload.table)
						.upsert(m.payload.data)
						.select();
					if (error) throw error;
					reply(port, { id: m.id, ok: true, data });
					break;
				}
				case 'from.delete': {
					if (!client) throw new Error('Not initialized');
					const { data, error } = await client
						.from(m.payload.table)
						.delete()
						.match(m.payload.match)
						.select();
					if (error) throw error;
					reply(port, { id: m.id, ok: true, data });
					break;
				}
				case 'rpc': {
					if (!client) throw new Error('Not initialized');
					const { fn, args } = m.payload;
					const { data, error } = await client.rpc(fn, args ?? {});
					if (error) throw error;
					reply(port, { id: m.id, ok: true, data });
					break;
				}
				case 'realtime.subscribe': {
					if (!client) throw new Error('Not initialized');
					const { key, params } = m.payload;
					const channel = client
						.channel(key)
						.on(
							'postgres_changes',
							params as RealtimePostgresChangesFilter<`${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT}`>,
							(payload: unknown) => {
								safeBroadcast({
									type: 'realtime',
									key,
									payload,
								});
							},
						);
					await channel.subscribe();
					subscriptions.set(key, {
						unsubscribe: async () => {
							await channel.unsubscribe();
						},
					});
					reply(port, { id: m.id, ok: true });
					break;
				}
				case 'realtime.unsubscribe': {
					const sub = subscriptions.get(m.payload.key);
					if (sub) {
						await sub.unsubscribe();
						subscriptions.delete(m.payload.key);
					}
					reply(port, { id: m.id, ok: true });
					break;
				}
				case 'ws.connect': {
					await connectWebSocket(m.payload?.wsUrl);
					reply(port, {
						id: m.id,
						ok: true,
						data: getWebSocketStatus(),
					});
					break;
				}
				case 'ws.disconnect': {
					disconnectWebSocket();
					reply(port, { id: m.id, ok: true });
					break;
				}
				case 'ws.send': {
					sendWebSocketMessage(m.payload.data);
					reply(port, { id: m.id, ok: true });
					break;
				}
				case 'ws.status': {
					reply(port, {
						id: m.id,
						ok: true,
						data: getWebSocketStatus(),
					});
					break;
				}
				default: {
					const _exhaustive: never = m;
					reply(port, {
						id: (_exhaustive as unknown as { id: string }).id,
						ok: false,
						error: 'Unknown message type',
					});
				}
			}
		} catch (err: unknown) {
			reply(port, {
				id: m.id,
				ok: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	};

	port.start();
	port.postMessage({ type: 'ready' });
};

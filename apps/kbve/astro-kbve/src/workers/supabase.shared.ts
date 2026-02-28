/// <reference lib="webworker" />
// src/workers/supabase.shared.ts
/* eslint-disable no-restricted-globals */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Dexie, { type Table } from 'dexie';
import { getWorkerCommunication } from '../lib/gateway/WorkerCommunication';

type Req =
	| {
			id: string;
			type: 'init';
			payload: { url: string; anonKey: string; options?: any };
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
	  }
	| {
			id: string;
			type: 'realtime.subscribe';
			payload: { key: string; params: any };
	  }
	| { id: string; type: 'realtime.unsubscribe'; payload: { key: string } }
	| { id: string; type: 'ws.connect'; payload?: { wsUrl?: string } }
	| { id: string; type: 'ws.disconnect' }
	| { id: string; type: 'ws.send'; payload: { data: any } }
	| { id: string; type: 'ws.status' };

type Res =
	| { id: string; ok: true; data?: any }
	| { id: string; ok: false; error: string };

const ports = new Set<MessagePort>();

// ---- Storage backed by IndexedDB using Dexie (works in workers) ----
interface AsyncStorage {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string): Promise<void>;
	removeItem(key: string): Promise<void>;
}

interface KVPair {
	key: string;
	value: string;
}

class AuthDB extends Dexie {
	kv!: Table<KVPair, string>;

	constructor() {
		super('sb-auth-v2');
		this.version(1).stores({
			kv: 'key',
		});
	}
}

class IDBStorage implements AsyncStorage {
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
		try {
			await this.db.kv.put({ key, value });
		} catch (err) {
			console.error('[Worker IDBStorage] setItem error:', err);
			throw err;
		}
	}

	async removeItem(key: string): Promise<void> {
		try {
			await this.db.kv.delete(key);
		} catch (err) {
			console.error('[Worker IDBStorage] removeItem error:', err);
			throw err;
		}
	}
}

// ---- Supabase management ----
let client: SupabaseClient | null = null;
const storage = new IDBStorage();

// ---- Shared communication layer ----
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
let wsLastPongTime: number = 0;
const WS_HEARTBEAT_INTERVAL_MS = 30000; // Send ping every 30 seconds
const WS_HEARTBEAT_TIMEOUT_MS = 60000; // Disconnect if no pong for 60 seconds

function getWebSocketUrl(customUrl?: string): string {
	if (customUrl) return customUrl;

	// Determine WebSocket URL based on current environment
	// Use location if available (in SharedWorker context)
	if (typeof location !== 'undefined') {
		const isLocalhost =
			location.hostname === 'localhost' ||
			location.hostname === '127.0.0.1';
		const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const port = isLocalhost ? '4321' : location.port;
		const host = location.hostname;
		return `${protocol}//${host}${port ? ':' + port : ''}/ws`;
	}

	// Fallback to localhost
	return 'ws://localhost:4321/ws';
}

async function connectWebSocket(wsUrl?: string) {
	if (
		ws &&
		(ws.readyState === WebSocket.CONNECTING ||
			ws.readyState === WebSocket.OPEN)
	) {
		console.log('[SharedWorker] WebSocket already connected or connecting');
		return;
	}

	try {
		// Get access token from current session
		if (!client) {
			throw new Error(
				'Supabase client not initialized - call init first',
			);
		}

		const {
			data: { session },
			error,
		} = await client.auth.getSession();
		if (error || !session?.access_token) {
			throw new Error('No active session - user must be authenticated');
		}

		const url = getWebSocketUrl(wsUrl);
		const accessToken = session.access_token;

		// WebSocket API doesn't support custom headers, so pass token as query parameter
		const authenticatedUrl = `${url}?token=${encodeURIComponent(accessToken)}`;
		console.log('[SharedWorker] Connecting to WebSocket:', url);

		// Create WebSocket connection with token in URL
		ws = new WebSocket(authenticatedUrl);

		ws.onopen = () => {
			console.log(
				'[SharedWorker] WebSocket connected and authenticated via query parameter',
			);
			wsReconnectAttempts = 0;
			wsLastPongTime = Date.now();

			// Start heartbeat
			startHeartbeat();

			// Broadcast connection status to all tabs
			for (const p of ports) {
				p.postMessage({
					type: 'ws.status',
					status: 'connected',
					url,
				});
			}

			// Broadcast to worker pool via BroadcastChannel
			comm.broadcast({
				type: 'ws.status',
				data: { status: 'connected', url },
			});
		};

		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);
				console.log('[SharedWorker] WebSocket message:', message);

				// Handle pong response
				if (message.type === 'pong') {
					wsLastPongTime = Date.now();
					console.log('[SharedWorker] ♥ Pong received');
					return; // Don't broadcast heartbeat messages to tabs
				}

				// Broadcast message to all connected tabs
				for (const p of ports) {
					p.postMessage({
						type: 'ws.message',
						data: message,
					});
				}

				// Broadcast to worker pool via BroadcastChannel
				comm.broadcast({
					type: 'ws.message',
					data: message,
				});
			} catch (error) {
				console.error(
					'[SharedWorker] Failed to parse WebSocket message:',
					error,
				);
			}
		};

		ws.onerror = (error) => {
			console.error('[SharedWorker] WebSocket error:', error);

			// Broadcast error to all tabs
			for (const p of ports) {
				p.postMessage({
					type: 'ws.status',
					status: 'error',
					error: 'WebSocket connection error',
				});
			}
		};

		ws.onclose = (event) => {
			console.log(
				'[SharedWorker] WebSocket closed:',
				event.code,
				event.reason,
			);
			ws = null;

			// Stop heartbeat
			stopHeartbeat();

			// Broadcast disconnection to all tabs
			for (const p of ports) {
				p.postMessage({
					type: 'ws.status',
					status: 'disconnected',
					code: event.code,
					reason: event.reason,
				});
			}

			// Attempt reconnection if not a normal closure
			if (
				event.code !== 1000 &&
				wsReconnectAttempts < WS_MAX_RECONNECT_ATTEMPTS
			) {
				wsReconnectAttempts++;
				console.log(
					`[SharedWorker] Attempting WebSocket reconnection (${wsReconnectAttempts}/${WS_MAX_RECONNECT_ATTEMPTS})...`,
				);

				wsReconnectTimer = setTimeout(() => {
					connectWebSocket(wsUrl).catch((err) => {
						console.error(
							'[SharedWorker] WebSocket reconnection failed:',
							err,
						);
					});
				}, WS_RECONNECT_DELAY_MS);
			}
		};
	} catch (error) {
		console.error('[SharedWorker] Failed to connect WebSocket:', error);
		throw error;
	}
}

function startHeartbeat() {
	stopHeartbeat(); // Clear any existing timer

	wsHeartbeatTimer = setInterval(() => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			stopHeartbeat();
			return;
		}

		// Check if we've received a pong recently
		const now = Date.now();
		if (
			wsLastPongTime > 0 &&
			now - wsLastPongTime > WS_HEARTBEAT_TIMEOUT_MS
		) {
			console.warn(
				'[SharedWorker] No pong received for 60s, connection appears dead',
			);
			stopHeartbeat();
			ws.close(1001, 'Heartbeat timeout');
			return;
		}

		// Send ping
		try {
			ws.send(JSON.stringify({ type: 'ping' }));
			console.log('[SharedWorker] Heartbeat ping sent');
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
		console.log('[SharedWorker] Disconnecting WebSocket');
		ws.close(1000, 'Requested by client');
		ws = null;
		wsReconnectAttempts = 0;

		// Broadcast disconnection to all tabs
		for (const p of ports) {
			p.postMessage({
				type: 'ws.status',
				status: 'disconnected',
			});
		}
	}
}

function sendWebSocketMessage(data: any) {
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		throw new Error('WebSocket not connected');
	}

	const message = typeof data === 'string' ? data : JSON.stringify(data);
	console.log('[SharedWorker] Sending WebSocket message:', message);
	ws.send(message);
}

function getWebSocketStatus() {
	if (!ws) {
		return { status: 'disconnected', readyState: null };
	}

	const readyStateMap = {
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

async function ensureClient(url: string, anonKey: string, options: any = {}) {
	if (client) return client;

	// Validate URL format
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
			// If you use PKCE/OAuth in your app UI, keep those flows in the page.
		},
		realtime: { params: { eventsPerSecond: 5 } },
		...options,
	});

	// Broadcast session updates to all tabs
	client.auth.onAuthStateChange(async (_event, session) => {
		for (const p of ports) {
			p.postMessage({ type: 'auth', session });
		}

		// Broadcast to worker pool via BroadcastChannel
		comm.broadcast({
			type: 'auth',
			data: { session },
		});
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
					const q = client
						.from(m.payload.table)
						.select(m.payload.columns ?? '*');
					let query = q;
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

					// Example: Postgres changes
					const channel = client
						.channel(key)
						.on('postgres_changes', params, (payload) => {
							// fan out to every connected port
							for (const p of ports) {
								p.postMessage({
									type: 'realtime',
									key,
									payload,
								});
							}
						});

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
						id: (_exhaustive as any).id,
						ok: false,
						error: 'Unknown message type',
					});
				}
			}
		} catch (err: any) {
			reply(port, {
				id: m.id,
				ok: false,
				error: String(err?.message ?? err),
			});
		}
	};

	port.start();
	port.postMessage({ type: 'ready' });

	port.onmessageerror = () => {
		ports.delete(port);
	};
	port.close = () => {
		ports.delete(port);
	};
};

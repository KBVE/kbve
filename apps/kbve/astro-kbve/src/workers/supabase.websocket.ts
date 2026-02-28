/// <reference lib="webworker" />
// src/workers/supabase.websocket.ts
// Dedicated WebSocket worker for mobile/Android (replaces SharedWorker role)

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getWorkerCommunication } from '../lib/gateway/WorkerCommunication';

type WorkerMessage =
	| { id: string; type: 'ping'; payload?: any }
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
			type: 'realtime.subscribe';
			payload: { key: string; params: any };
	  }
	| { id: string; type: 'realtime.unsubscribe'; payload: { key: string } }
	| { id: string; type: 'ws.connect'; payload?: { wsUrl?: string } }
	| { id: string; type: 'ws.disconnect' }
	| { id: string; type: 'ws.send'; payload: { data: any } }
	| { id: string; type: 'ws.status' };

type WorkerResponse =
	| { id: string; ok: true; data?: any }
	| { id: string; ok: false; error: string };

declare const self: DedicatedWorkerGlobalScope;

// Supabase client
let client: SupabaseClient | null = null;

// WebSocket connection
let ws: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsReconnectAttempts = 0;
const WS_MAX_RECONNECT_ATTEMPTS = 5;
const WS_RECONNECT_DELAY_MS = 3000;

// Heartbeat
let wsHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let wsLastPongTime: number = 0;
const WS_HEARTBEAT_INTERVAL_MS = 30000;
const WS_HEARTBEAT_TIMEOUT_MS = 60000;

// Realtime subscriptions
const subscriptions = new Map<
	string,
	{ unsubscribe: () => Promise<void> | void }
>();

// Shared communication layer
const comm = getWorkerCommunication();

console.log('[WebSocket Worker] Initializing...');

// Determine WebSocket URL
function getWebSocketUrl(customUrl?: string): string {
	if (customUrl) return customUrl;

	// In dedicated worker, we don't have location, so use default
	// The URL should be passed from main thread
	return 'ws://localhost:4321/ws';
}

// Connect to WebSocket
async function connectWebSocket(wsUrl?: string) {
	if (
		ws &&
		(ws.readyState === WebSocket.CONNECTING ||
			ws.readyState === WebSocket.OPEN)
	) {
		console.log('[WebSocket Worker] Already connected or connecting');
		return;
	}

	try {
		if (!client) {
			throw new Error('Supabase client not initialized');
		}

		const {
			data: { session },
			error,
		} = await client.auth.getSession();
		if (error || !session?.access_token) {
			throw new Error('No active session');
		}

		const url = getWebSocketUrl(wsUrl);
		const authenticatedUrl = `${url}?token=${encodeURIComponent(session.access_token)}`;

		console.log('[WebSocket Worker] Connecting to:', url);

		ws = new WebSocket(authenticatedUrl);

		ws.onopen = () => {
			console.log('[WebSocket Worker] Connected');
			wsReconnectAttempts = 0;
			wsLastPongTime = Date.now();

			startHeartbeat();

			// Broadcast status via BroadcastChannel
			comm.broadcast({
				type: 'ws.status',
				data: { status: 'connected', url },
			});

			// Also send to main thread
			self.postMessage({
				type: 'ws.status',
				status: 'connected',
				url,
			});
		};

		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);

				// Handle pong
				if (message.type === 'pong') {
					wsLastPongTime = Date.now();
					console.log('[WebSocket Worker] ♥ Pong received');
					return;
				}

				console.log('[WebSocket Worker] Message:', message);

				// Broadcast to all workers via BroadcastChannel
				comm.broadcast({
					type: 'ws.message',
					data: message,
				});

				// Also send to main thread
				self.postMessage({
					type: 'ws.message',
					data: message,
				});
			} catch (error) {
				console.error(
					'[WebSocket Worker] Failed to parse message:',
					error,
				);
			}
		};

		ws.onerror = (error) => {
			console.error('[WebSocket Worker] Error:', error);

			comm.broadcast({
				type: 'ws.status',
				data: { status: 'error', error: 'Connection error' },
			});

			self.postMessage({
				type: 'ws.status',
				status: 'error',
				error: 'Connection error',
			});
		};

		ws.onclose = (event) => {
			console.log('[WebSocket Worker] Closed:', event.code, event.reason);
			ws = null;

			stopHeartbeat();

			comm.broadcast({
				type: 'ws.status',
				data: {
					status: 'disconnected',
					code: event.code,
					reason: event.reason,
				},
			});

			self.postMessage({
				type: 'ws.status',
				status: 'disconnected',
				code: event.code,
				reason: event.reason,
			});

			// Attempt reconnection
			if (
				event.code !== 1000 &&
				wsReconnectAttempts < WS_MAX_RECONNECT_ATTEMPTS
			) {
				wsReconnectAttempts++;
				console.log(
					`[WebSocket Worker] Reconnecting (${wsReconnectAttempts}/${WS_MAX_RECONNECT_ATTEMPTS})...`,
				);

				wsReconnectTimer = setTimeout(() => {
					connectWebSocket(wsUrl).catch((err) => {
						console.error(
							'[WebSocket Worker] Reconnection failed:',
							err,
						);
					});
				}, WS_RECONNECT_DELAY_MS);
			}
		};
	} catch (error) {
		console.error('[WebSocket Worker] Connection failed:', error);
		throw error;
	}
}

function startHeartbeat() {
	stopHeartbeat();

	wsHeartbeatTimer = setInterval(() => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			stopHeartbeat();
			return;
		}

		const now = Date.now();
		if (
			wsLastPongTime > 0 &&
			now - wsLastPongTime > WS_HEARTBEAT_TIMEOUT_MS
		) {
			console.warn('[WebSocket Worker] Heartbeat timeout');
			stopHeartbeat();
			ws.close(1001, 'Heartbeat timeout');
			return;
		}

		try {
			ws.send(JSON.stringify({ type: 'ping' }));
			console.log('[WebSocket Worker] Heartbeat ping sent');
		} catch (error) {
			console.error(
				'[WebSocket Worker] Failed to send heartbeat:',
				error,
			);
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
		console.log('[WebSocket Worker] Disconnecting');
		ws.close(1000, 'Client request');
		ws = null;
		wsReconnectAttempts = 0;

		comm.broadcast({
			type: 'ws.status',
			data: { status: 'disconnected' },
		});

		self.postMessage({
			type: 'ws.status',
			status: 'disconnected',
		});
	}
}

function sendWebSocketMessage(data: any) {
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		throw new Error('WebSocket not connected');
	}

	const message = typeof data === 'string' ? data : JSON.stringify(data);
	console.log('[WebSocket Worker] Sending:', message);
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

				console.log('[WebSocket Worker] Initializing Supabase client');

				const storage = {
					getItem: (key: string) => comm.getState(key),
					setItem: (key: string, value: string) =>
						comm.setState(key, value),
					removeItem: (key: string) => comm.removeState(key),
				};

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

				// Broadcast auth state changes
				client.auth.onAuthStateChange(async (_event, session) => {
					comm.broadcast({
						type: 'auth',
						data: { session },
					});

					self.postMessage({ type: 'auth', session });
				});

				const {
					data: { session },
					error,
				} = await client.auth.getSession();

				if (error) {
					console.error('[WebSocket Worker] Session error:', error);
				}

				respond(id, {
					ok: true,
					data: { session, user: session?.user || null },
				});
				break;
			}

			case 'getSession': {
				if (!client) throw new Error('Client not initialized');

				const { data, error } = await client.auth.getSession();
				if (error) throw error;

				respond(id, { ok: true, data });
				break;
			}

			case 'signInWithPassword': {
				if (!client) throw new Error('Client not initialized');

				const { email, password } = payload;
				const { data, error } = await client.auth.signInWithPassword({
					email,
					password,
				});
				if (error) throw error;

				respond(id, { ok: true, data });
				break;
			}

			case 'signOut': {
				if (!client) throw new Error('Client not initialized');

				const { error } = await client.auth.signOut();
				if (error) throw error;

				respond(id, { ok: true });
				break;
			}

			case 'realtime.subscribe': {
				if (!client) throw new Error('Client not initialized');

				const { key, params } = payload;

				const channel = client
					.channel(key)
					.on('postgres_changes', params, (payload) => {
						// Broadcast to all workers
						comm.broadcast({
							type: 'realtime',
							key,
							payload,
						});

						// Also send to main thread
						self.postMessage({ type: 'realtime', key, payload });
					});

				await channel.subscribe();
				subscriptions.set(key, {
					unsubscribe: async () => {
						await channel.unsubscribe();
					},
				});

				respond(id, { ok: true });
				break;
			}

			case 'realtime.unsubscribe': {
				const sub = subscriptions.get(payload.key);
				if (sub) {
					await sub.unsubscribe();
					subscriptions.delete(payload.key);
				}

				respond(id, { ok: true });
				break;
			}

			case 'ws.connect': {
				await connectWebSocket(payload?.wsUrl);
				respond(id, { ok: true, data: getWebSocketStatus() });
				break;
			}

			case 'ws.disconnect': {
				disconnectWebSocket();
				respond(id, { ok: true });
				break;
			}

			case 'ws.send': {
				sendWebSocketMessage(payload.data);
				respond(id, { ok: true });
				break;
			}

			case 'ws.status': {
				respond(id, { ok: true, data: getWebSocketStatus() });
				break;
			}

			default:
				respond(id, {
					ok: false,
					error: `Unknown message type: ${type}`,
				});
		}
	} catch (err: any) {
		console.error(`[WebSocket Worker] Error handling ${type}:`, err);
		respond(id, { ok: false, error: err.message || String(err) });
	}
};

function respond(id: string, response: Omit<WorkerResponse, 'id'>) {
	self.postMessage({ id, ...response });
}

console.log('[WebSocket Worker] Ready');

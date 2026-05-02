import { expose } from 'comlink';

interface SharedWorkerGlobalScope extends Worker {
	onconnect: (event: MessageEvent) => void;
}
declare const self: SharedWorkerGlobalScope;

let ws: WebSocket | null = null;

// ---------------------------------------------------------------------------
// Transport channels
//
// `kbve_ws_data`   — raw WebSocket payloads for the db-worker to persist.
//                    Payload: { type: 'ws.store', format, data, ts }
//
// `kbve_ws_events` — status + message events for UI consumers (chat service,
//                    presence, overlays, etc.).
//                    Payload:
//                      { type: 'status',  status: string }
//                      { type: 'message', format: 'text',   data: string }
//                      { type: 'message', format: 'binary', data: Uint8Array }
//
// Keeping persistence and UI on separate channels means each consumer only
// sees what it cares about, and a new subscriber (e.g. cross-tab presence)
// drops in without filtering db-bound payloads.
//
// Historical note: an earlier design exposed onMessage(cb) / onStatus(cb)
// through Comlink. That failed with DataCloneError because Comlink forwards
// method args via postMessage, and functions are not structured-cloneable.
// If a future strategy wants a different transport (SharedArrayBuffer,
// MessagePort, proxied-Comlink callbacks), add it alongside — don't remove
// the BroadcastChannel path, it's the fallback that works everywhere.
// ---------------------------------------------------------------------------
const dbChannel =
	typeof BroadcastChannel !== 'undefined'
		? new BroadcastChannel('kbve_ws_data')
		: null;

const eventsChannel =
	typeof BroadcastChannel !== 'undefined'
		? new BroadcastChannel('kbve_ws_events')
		: null;

// Heartbeat
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastPongTime = 0;
const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 60000;

// Reconnect
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let lastUrl: string | null = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;

function startHeartbeat() {
	stopHeartbeat();
	heartbeatTimer = setInterval(() => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			stopHeartbeat();
			return;
		}
		if (
			lastPongTime > 0 &&
			Date.now() - lastPongTime > HEARTBEAT_TIMEOUT_MS
		) {
			console.warn('[WS] Heartbeat timeout — closing connection');
			stopHeartbeat();
			ws.close(1001, 'Heartbeat timeout');
			return;
		}
		try {
			ws.send(JSON.stringify({ type: 'ping' }));
		} catch (err) {
			console.error('[WS] Failed to send heartbeat:', err);
		}
	}, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
	if (heartbeatTimer) {
		clearInterval(heartbeatTimer);
		heartbeatTimer = null;
	}
}

function broadcastStatus(
	status: string,
	detail?: { code?: number; reason?: string; wasClean?: boolean },
) {
	eventsChannel?.postMessage({ type: 'status', status, ...detail });
}

function attemptReconnect() {
	if (!lastUrl || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			console.error(
				`[WS] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached`,
			);
			broadcastStatus('failed');
		}
		return;
	}

	reconnectAttempts++;
	console.log(
		`[WS] Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`,
	);
	broadcastStatus('reconnecting');

	reconnectTimer = setTimeout(() => {
		if (lastUrl) wsInstanceAPI.connect(lastUrl);
	}, RECONNECT_DELAY_MS);
}

// ---------------------------------------------------------------------------
// WebSocket API exposed via Comlink
//
// Only commands that carry structured-cloneable data cross this bridge
// (strings, typed arrays). Event subscription is deliberately NOT here —
// it lives on the BroadcastChannel side to avoid DataCloneError when a
// caller passes a raw function.
// ---------------------------------------------------------------------------
const wsInstanceAPI = {
	async connect(url: string) {
		if (ws && ws.readyState === WebSocket.OPEN) return;

		// Clean up any existing connection
		if (ws) {
			ws.onclose = null;
			ws.close();
			ws = null;
		}

		lastUrl = url;
		const safeUrl = url.replace(/(token=)[^&]+/i, '$1<redacted>');
		console.log('[WS] Connecting to', safeUrl);
		ws = new WebSocket(url);
		ws.binaryType = 'arraybuffer';

		ws.onopen = () => {
			console.log('[WS] Connected:', safeUrl);
			reconnectAttempts = 0;
			lastPongTime = Date.now();
			startHeartbeat();
			broadcastStatus('connected');
		};

		ws.onmessage = (e) => {
			try {
				// Handle JSON pong responses
				if (typeof e.data === 'string') {
					try {
						const parsed = JSON.parse(e.data);
						if (parsed.type === 'pong') {
							lastPongTime = Date.now();
							return;
						}
					} catch {
						// Not JSON, pass through
					}
				}

				// Fan out to db-worker (persistence pipeline).
				// Structured-cloneable payloads only — strings and
				// Uint8Array are both safe across BroadcastChannel.
				if (dbChannel) {
					if (typeof e.data === 'string') {
						dbChannel.postMessage({
							type: 'ws.store',
							format: 'text',
							data: e.data,
							ts: Date.now(),
						});
					} else if (e.data instanceof ArrayBuffer) {
						dbChannel.postMessage({
							type: 'ws.store',
							format: 'binary',
							data: new Uint8Array(e.data),
							ts: Date.now(),
						});
					}
				}

				// Fan out to UI consumers (chat service, presence, etc.).
				// Same structured-cloneable constraint applies.
				if (eventsChannel) {
					if (typeof e.data === 'string') {
						eventsChannel.postMessage({
							type: 'message',
							format: 'text',
							data: e.data,
						});
					} else if (e.data instanceof ArrayBuffer) {
						eventsChannel.postMessage({
							type: 'message',
							format: 'binary',
							data: new Uint8Array(e.data),
						});
					}
				}
			} catch (err) {
				console.error('[WS] Failed to forward message', err);
			}
		};

		ws.onerror = (e) => {
			console.error('[WS] Error event:', e);
			broadcastStatus('error', {
				reason: 'WebSocket error event (no detail in browser API)',
			});
		};

		ws.onclose = (event) => {
			console.log(
				`[WS] Disconnected code=${event.code} reason="${event.reason}" wasClean=${event.wasClean}`,
			);
			ws = null;
			stopHeartbeat();
			broadcastStatus('disconnected', {
				code: event.code,
				reason: event.reason,
				wasClean: event.wasClean,
			});

			if (event.code !== 1000) {
				attemptReconnect();
			}
		};
	},

	async send(payload: Uint8Array) {
		if (ws?.readyState === WebSocket.OPEN) {
			// Cast narrows Uint8Array<ArrayBufferLike> to BufferSource for
			// WebSocket.send. Newer TS DOM lib parameterizes Uint8Array over
			// ArrayBuffer | SharedArrayBuffer, but send() only accepts
			// ArrayBuffer-backed views. Every caller here posts a freshly
			// encoded payload (Uint8Array from TextEncoder or similar), so
			// the backing buffer is always a plain ArrayBuffer.
			ws.send(payload as BufferSource);
		} else {
			console.warn('[WS] Tried to send while disconnected');
		}
	},

	async close() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		stopHeartbeat();
		reconnectAttempts = 0;
		lastUrl = null;
		ws?.close(1000, 'Client request');
		ws = null;
		broadcastStatus('disconnected');
	},

	async getStatus(): Promise<string> {
		if (!ws) return 'disconnected';
		const map: Record<number, string> = {
			[WebSocket.CONNECTING]: 'connecting',
			[WebSocket.OPEN]: 'connected',
			[WebSocket.CLOSING]: 'closing',
			[WebSocket.CLOSED]: 'disconnected',
		};
		return map[ws.readyState] || 'unknown';
	},
};

export type WSInstance = typeof wsInstanceAPI;

const ports = new Set<MessagePort>();

self.onconnect = (event: MessageEvent) => {
	const port = event.ports[0];
	const isFirst = ports.size === 0;
	ports.add(port);
	port.start();
	port.postMessage({ type: isFirst ? 'first-connect' : 'reconnect' });
	port.addEventListener('message', (e: MessageEvent) => {
		if (e.data?.type === 'close') ports.delete(port);
	});
	expose(wsInstanceAPI, port);
};

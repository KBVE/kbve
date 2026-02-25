import { expose } from 'comlink';

interface SharedWorkerGlobalScope extends Worker {
	onconnect: (event: MessageEvent) => void;
}
declare const self: SharedWorkerGlobalScope;

let ws: WebSocket | null = null;
let onMessageCallback: ((data: string | ArrayBuffer) => void) | null = null;
let onStatusCallback: ((status: string) => void) | null = null;

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

function broadcastStatus(status: string) {
	onStatusCallback?.(status);
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

// --- WebSocket API ---
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
		ws = new WebSocket(url);
		ws.binaryType = 'arraybuffer';

		ws.onopen = () => {
			console.log('[WS] Connected:', url);
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

				if (e.data instanceof ArrayBuffer) {
					onMessageCallback?.(e.data);
				} else {
					onMessageCallback?.(e.data);
				}
			} catch (err) {
				console.error('[WS] Failed to forward message', err);
			}
		};

		ws.onerror = (e) => {
			console.error('[WS] Error:', e);
			broadcastStatus('error');
		};

		ws.onclose = (event) => {
			console.log('[WS] Disconnected:', event.code, event.reason);
			ws = null;
			stopHeartbeat();
			broadcastStatus('disconnected');

			// Auto-reconnect on abnormal closure
			if (event.code !== 1000) {
				attemptReconnect();
			}
		};
	},

	async send(payload: Uint8Array) {
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(payload);
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

	onMessage(callback: (data: string | ArrayBuffer) => void) {
		onMessageCallback = callback;
	},

	onStatus(callback: (status: string) => void) {
		onStatusCallback = callback;
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

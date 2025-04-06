importScripts('/js/metrics-parser.js');
importScripts('/js/websockets.js');

const subscriptions = new Map(); // topic -> Set of ports
const pollers = {};              // topic -> interval ID
let socket = null;

// --- Utility: Broadcast to all ports subscribed to a topic ---
function broadcast(topic, payload) {
	const ports = subscriptions.get(topic);
	if (!ports) return;

	for (const port of ports) {
		port.postMessage({ topic, payload });
	}
}

// --- Subscription Management ---
function subscribe(port, topic) {
	if (!subscriptions.has(topic)) {
		subscriptions.set(topic, new Set());

		if (topic !== 'websocket') {
			startPolling(topic);
		}
	}
	subscriptions.get(topic).add(port);

	if (topic === 'websocket' && !socket) {
		handlers.connect_websocket(); // Auto-connect WebSocket
	}
}

function unsubscribe(port, topic) {
	const set = subscriptions.get(topic);
	if (set) {
		set.delete(port);
		if (set.size === 0) {
			if (topic !== 'websocket') {
				stopPolling(topic);
			}
			// Optional: handlers.close_websocket() if no websocket subscribers
		}
	}
}

// --- Polling for topics like "metrics" ---
function startPolling(topic) {
	const handlerFn = handlers[`fetch_${topic}`];

	if (!handlerFn) {
		console.warn(`No polling handler for topic "${topic}"`);
		return;
	}

	pollers[topic] = setInterval(async () => {
		try {
			const data = await handlerFn();
			broadcast(topic, data);
		} catch (err) {
			console.warn(`Polling error on topic "${topic}":`, err);
		}
	}, 3000);
}

function stopPolling(topic) {
	clearInterval(pollers[topic]);
	delete pollers[topic];
}

// --- One-off request and WebSocket handlers ---
const handlers = {
	fetch_metrics: async () => {
		const res = await fetch('/metrics');
		const text = await res.text();
		return parsePrometheusMetrics(text);
	},

	connect_websocket: async () => {
		if (socket && socket.readyState <= 1) return true;

		socket = new WebSocket(getWebSocketURL('/ws'));

		socket.addEventListener('open', () => {
			console.log('[SharedWorker WebSocket] Connected');
			broadcast('websocket', { status: 'connected' });
		});

		socket.addEventListener('message', (event) => {
			let message;
			try {
				message = JSON.parse(event.data);
			} catch {
				console.warn('[WebSocket] Invalid JSON message:', event.data);
				return;
			}
			broadcast('websocket', message);
		});

		socket.addEventListener('close', () => {
			console.warn('[WebSocket] Disconnected');
			broadcast('websocket', { status: 'disconnected' });
			socket = null;

			// Optional: auto-reconnect
			setTimeout(() => handlers.connect_websocket(), 3000);
		});

		socket.addEventListener('error', (e) => {
			console.error('[WebSocket] Error:', e);
			broadcast('websocket', { status: 'error', error: e.message });
		});

		return true;
	},

	send_websocket: async (payload) => {
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			throw new Error('WebSocket is not connected');
		}
		socket.send(JSON.stringify(payload));
		return true;
	},

	close_websocket: async () => {
		if (socket) {
			socket.close();
			socket = null;
			return true;
		}
		return false;
	},
};

// --- Port Communication Handling ---
self.onconnect = function (e) {
	const port = e.ports[0];

	port.onmessage = async (event) => {
		const { type, topic, requestId, payload } = event.data;

		if (type === 'subscribe') {
			subscribe(port, topic);
		} else if (type === 'unsubscribe') {
			unsubscribe(port, topic);
		} else if (requestId && handlers[type]) {
			try {
				const result = await handlers[type](payload);
				port.postMessage({ type: `${type}_result`, payload: result, requestId });
			} catch (error) {
				port.postMessage({ type: `${type}_error`, error: error.message, requestId });
			}
		} else if (requestId) {
			port.postMessage({
				type: `${type}_error`,
				error: `Unknown request type: ${type}`,
				requestId,
			});
		}
	};

	port.start();
};

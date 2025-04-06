console.log('[SharedWorker] 🧠 Script loaded');

const subscriptions = new Map();
const pollers = {};
let socket = null;
const reconnectInterval = 3000;

// --- Util: Recreate getWebSocketURL
function getWebSocketURL(path = '/ws') {
	const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${protocol}//${location.host}${path}`;
}

// --- Metrics parser from metrics-parser.js
function parsePrometheusMetrics(text, limit = 6) {
	return text
		.split('\n')
		.filter(line => line && !line.startsWith('#'))
		.slice(0, limit)
		.map(line => {
			const [key, value] = line.trim().split(/\s+/);
			return { key, value };
		});
}

// --- Broadcast to all ports subscribed to a topic
function broadcast(topic, payload) {
	const ports = subscriptions.get(topic);
	if (!ports) return;

	for (const port of ports) {
		port.postMessage({ topic, payload });
	}
}

// --- Subscription Management
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
			// Optional: handlers.close_websocket()
		}
	}
}

// --- Polling setup
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

// --- WebSocket + Metrics handlers
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

		socket.addEventListener('message', (e) => {
			let message;
			try {
				message = JSON.parse(e.data);
			} catch {
				console.warn('[WebSocket] Invalid JSON message:', e.data);
				return;
			}
			broadcast('websocket', message);
		});

		socket.addEventListener('close', () => {
			console.warn('[WebSocket] Disconnected');
			broadcast('websocket', { status: 'disconnected' });
			socket = null;
			setTimeout(() => handlers.connect_websocket(), reconnectInterval);
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

// --- Handle new connections from any tab
self.onconnect = function (e) {
	console.log('[SharedWorker] 🔌 New connection');
	const port = e.ports[0];

	port.onmessage = async (msg) => {
		const { type, topic, requestId, payload } = msg.data;
		console.log('[SharedWorker] Message received:', type, requestId);

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

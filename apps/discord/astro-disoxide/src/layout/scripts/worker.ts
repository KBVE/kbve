import type { PanelRequest, PanelState, DiscordServer } from 'src/env';

interface SharedWorkerGlobalScope extends Worker {
	onconnect: (event: MessageEvent) => void;
}
declare var self: SharedWorkerGlobalScope;

console.log('[SharedWorker] 🧠 Script loaded');

type Topic = 'metrics' | 'websocket' | 'panel' | 'db';

let currentPanel: PanelState | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

type PortSet = Set<MessagePort>;
export type PrometheusMetric = {
	key: string;
	value: number;
};

type FetchHandlerMap = {
	metrics: () => Promise<PrometheusMetric[]>;
	//websocket: never;
};

type WorkerHandlers = {
	// polling fetches
	fetch_metrics: () => Promise<PrometheusMetric[]>;

	// websocket controls
	connect_websocket: () => Promise<boolean>;
	send_websocket: (payload: any) => Promise<boolean>;
	close_websocket: () => Promise<boolean>;

	// panel
	panel: (payload: PanelRequest) => Promise<PanelState>;

	// db
	db_get: (key: string) => Promise<any>;
	db_set: (args: { key: string; value: any }) => Promise<boolean>;
	db_delete: (key: string) => Promise<boolean>;
	db_list: () => Promise<any[]>;
};

type HandlerType = keyof WorkerHandlers;

type FetchHandler<T extends Topic> = T extends keyof FetchHandlerMap
	? FetchHandlerMap[T]
	: () => Promise<any>;

const subscriptions: Map<Topic, PortSet> = new Map();
const pollers: Partial<Record<Topic, ReturnType<typeof setInterval>>> = {};
let socket: WebSocket | null = null;
const reconnectInterval = 3000;

function getAPIBaseURL(): string {
	const isAstroDev = location.port === '4321';
	return isAstroDev ? 'http://localhost:3000' : '';
}

// --- Util: DB

function getDB(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open('shared-worker-store', 1);

		request.onupgradeneeded = (event) => {
			const db = request.result;
			if (!db.objectStoreNames.contains('panel')) {
				db.createObjectStore('panel');
			}
			if (!db.objectStoreNames.contains('custom')) {
				db.createObjectStore('custom');
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

	return dbPromise;
}

// --- Util: Recreate getWebSocketURL
function getWebSocketURL(path: string = '/ws'): string {
	const isDevAstro = location.port === '4321';
	const isHttps = location.protocol === 'https:';
	const protocol = isHttps ? 'wss:' : 'ws:';

	if (isDevAstro) {
		// We're in Astro dev mode, so we want to connect to the WS dev server
		return `ws://localhost:3000${path}`;
	}

	// In production (or any other non-dev-astro case)
	return `${protocol}//${location.host}${path}`;
}

// --- Metrics parser from metrics-parser.js
function parsePrometheusMetrics(
	text: string,
	limit: number = 6,
): PrometheusMetric[] {
	return text
		.split('\n')
		.filter((line) => line && !line.startsWith('#'))
		.slice(0, limit)
		.map((line) => {
			const [key, valueStr] = line.trim().split(/\s+/);
			const value = parseFloat(valueStr);
			return { key, value };
		});
}

// --- Broadcast to all ports subscribed to a topic
function broadcast(topic: Topic, payload: any): void {
	const ports = subscriptions.get(topic);
	if (!ports) return;

	for (const port of ports) {
		port.postMessage({ topic, payload });
	}
}

// --- Subscription Management
function subscribe(port: MessagePort, topic: Topic): void {
	if (!subscriptions.has(topic)) {
		subscriptions.set(topic, new Set());

		if (`fetch_${topic}` in handlers) {
			startPolling(topic as keyof FetchHandlerMap);
		}
	}

	subscriptions.get(topic)!.add(port);

	if (topic === 'websocket' && !socket) {
		void handlers.connect_websocket();
	}
}

function unsubscribe(port: MessagePort, topic: Topic): void {
	const set = subscriptions.get(topic);
	if (set) {
		set.delete(port);

		if (set.size === 0) {
			if (`fetch_${topic}` in handlers) {
				stopPolling(topic as keyof FetchHandlerMap);
			} else if (topic === 'websocket') {
				void handlers.close_websocket();
			}

			subscriptions.delete(topic);
		}
	}
}

// --- Polling setup

function startPolling<T extends keyof FetchHandlerMap>(topic: T): void {
	const handlerFn = handlers[`fetch_${topic}`] as FetchHandler<T>;

	if (typeof handlerFn !== 'function') {
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

function stopPolling<T extends keyof FetchHandlerMap>(topic: T): void {
	const interval = pollers[topic];
	if (interval) {
		clearInterval(interval);
		delete pollers[topic];
	}
}

// --- WebSocket + Metrics handlers
const handlers: WorkerHandlers = {
	fetch_metrics: async () => {
		const res = await fetch(`${getAPIBaseURL()}/metrics`);
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
			setTimeout(
				() => void handlers.connect_websocket(),
				reconnectInterval,
			);
		});

		socket.addEventListener('error', (e) => {
			const error = e as ErrorEvent;
			console.error('[WebSocket] Error:', error);
			broadcast('websocket', { status: 'error', error: error.message });
		});

		return true;
	},

	send_websocket: async (payload: any) => {
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

	panel: async (payload: PanelRequest): Promise<PanelState> => {
		if (payload.type === 'open') {
			currentPanel = {
				open: true,
				id: payload.id,
				payload: payload.payload,
			};
		} else if (payload.type === 'close') {
			currentPanel = { open: false, id: payload.id };
		} else if (payload.type === 'toggle') {
			const isSame = currentPanel?.id === payload.id;
			const isOpen = isSame ? !currentPanel?.open : true;

			currentPanel = {
				open: isOpen,
				id: payload.id,
				payload: payload.payload,
			};
		}

		if (currentPanel) broadcast('panel', currentPanel);
		return currentPanel!;
	},

	// DB

	db_get: async (key) => {
		const db = await getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction('custom', 'readonly');
			const store = tx.objectStore('custom');
			const request = store.get(key);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	},
	
	db_set: async ({ key, value }) => {
		const db = await getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction('custom', 'readwrite');
			const store = tx.objectStore('custom');
			const request = store.put(value, key);
	
			request.onsuccess = () => {
				resolve(true);
				if (subscriptions.has('db')) {
					broadcast('db', { key, value });
				}
			};
	
			request.onerror = () => reject(request.error);
		});
	},
	
	db_delete: async (key) => {
		const db = await getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction('custom', 'readwrite');
			const store = tx.objectStore('custom');
			const request = store.delete(key);
			request.onsuccess = () => {
				resolve(true);
				if (subscriptions.has('db')) {
					broadcast('db', { key, deleted: true });
				}
			};
			request.onerror = () => reject(request.error);
		});
	},

	db_list: async () => {
		const db = await getDB();
		return new Promise((resolve, reject) => {
		  const tx = db.transaction('custom', 'readonly');
		  const store = tx.objectStore('custom');
		  const request = store.getAll();
		  request.onsuccess = () => resolve(request.result);
		  request.onerror = () => reject(request.error);
		});
	  },
};

// --- Prepopulate DB

async function initializeDBIfEmpty() {
	const db = await getDB();
	const tx = db.transaction('custom', 'readonly');
	const store = tx.objectStore('custom');
	const countRequest = store.count();

	countRequest.onsuccess = async () => {
		if (countRequest.result === 0) {
			console.log('[SharedWorker DB] Seeding initial server data...');

			const now = Date.now();
			const servers: Record<string, DiscordServer> = {};

			for (let i = 1; i <= 20; i++) {
				const server: DiscordServer = {
					server_id: `server-${i}`,
					owner_id: `owner-${i}`,
					lang: i % 3,
					status: i % 2 === 0 ? 1 : 0,
					invite: `https://discord.gg/fakeinvite${i}`,
					name: `Server ${i}`,
					summary: `This is the summary for server ${i}.`,
					description: `Server ${i} is a vibrant community focused on discussion and events.`,
					website: i % 2 === 0 ? `https://server${i}.com` : null,
					logo: `https://api.dicebear.com/7.x/bottts/svg?seed=server${i}`,
					banner: null,
					video: null,
					categories: (i % 5) + 1,
					updated_at: new Date(now - i * 3600_000).toISOString(),
				};

				servers[`server:${server.server_id}`] = server;
			}

			const writeTx = db.transaction('custom', 'readwrite');
			const writeStore = writeTx.objectStore('custom');

			for (const [key, value] of Object.entries(servers)) {
				writeStore.put(value, key);
			}

			console.log('[SharedWorker DB] Seed complete with 20 servers');
		}
	};
}



// --- Handle new connections from any tab
self.onconnect = function (e) {
	console.log('[SharedWorker] New connection');
	const port = e.ports[0];

	initializeDBIfEmpty();

	port.onmessage = async (msg) => {
		const { type, topic, requestId, payload } = msg.data as {
			type: string;
			topic?: Topic;
			requestId?: string;
			payload?: any;
		};

		console.log('[SharedWorker] Message received:', type, requestId);

		if (type === 'subscribe') {
			subscribe(port, topic as Topic);
		} else if (type === 'unsubscribe') {
			unsubscribe(port, topic as Topic);
		} else if (requestId && (type as HandlerType) in handlers) {
			try {
				const result = await handlers[type as HandlerType](payload);
				port.postMessage({
					type: `${type}_result`,
					payload: result,
					requestId,
				});
			} catch (error: any) {
				port.postMessage({
					type: `${type}_error`,
					error: error.message,
					requestId,
				});
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

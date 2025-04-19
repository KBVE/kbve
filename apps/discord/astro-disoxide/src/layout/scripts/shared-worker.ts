import type {
	PanelRequest,
	PanelState,
	DiscordServer,
	KnownStore
} from 'src/env';
const knownStores = ['jsonservers', 'htmlservers', 'meta', 'panel'] as const;

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
	db_get: (args: { store: KnownStore; key: string }) => Promise<any>;
	db_set: (args: {
		store: KnownStore;
		key: string;
		value: any;
	}) => Promise<boolean>;
	db_delete: (args: { store: KnownStore; key: string }) => Promise<boolean>;
	db_list: (args: { store: KnownStore }) => Promise<any[]>;

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

async function getObjectStore<T = any>(
	storeName: KnownStore,
	mode: IDBTransactionMode = 'readonly',
): Promise<IDBObjectStore> {
	const db = await getDB();

	if (!db.objectStoreNames.contains(storeName)) {
		throw new Error(`Object store "${storeName}" does not exist`);
	}

	const tx = db.transaction(storeName, mode);
	return tx.objectStore(storeName);
}

function getDB(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open('shared-worker-store', 1);

		request.onupgradeneeded = () => {
			const db = request.result;

			for (const store of knownStores) {
				if (!db.objectStoreNames.contains(store)) {
					console.log(`[DB Init] Creating store: ${store}`);
					db.createObjectStore(store);
				}
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
			console.log('[Panel] Closing panel:', payload.id);
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
	db_get: async (args) => {
		console.log('[db_get handler] raw args:', args);

		const { store, key } = args;

		if (typeof store !== 'string' || typeof key !== 'string') {
			console.error('[db_get] Invalid store or key:', { store, key });
			throw new Error(
				`[db_get] Invalid store or key: store=${store}, key=${key}`,
			);
		}

		const objStore = await getObjectStore(store, 'readonly');
		return new Promise((resolve, reject) => {
			const request = objStore.get(key);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	},

	db_set: async ({ store, key, value }) => {
		const objStore = await getObjectStore(store, 'readwrite');
		return new Promise((resolve, reject) => {
			const req = objStore.put(value, key);
			req.onsuccess = () => resolve(true);
			req.onerror = () => reject(req.error);
		});
	},

	db_delete: async ({ store, key }) => {
		const objStore = await getObjectStore(store, 'readwrite');
		return new Promise((resolve, reject) => {
			const req = objStore.delete(key);
			req.onsuccess = () => resolve(true);
			req.onerror = () => reject(req.error);
		});
	},

	db_list: async ({ store }) => {
		const objStore = await getObjectStore(store, 'readonly');
		return new Promise((resolve, reject) => {
			const req = objStore.getAll();
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}
};

// --- Prepopulate DB

async function ensureDatabaseReady(): Promise<IDBDatabase> {
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open('shared-worker-store', 1);

			request.onupgradeneeded = () => {
				const db = request.result;
				for (const store of knownStores) {
					if (!db.objectStoreNames.contains(store)) {
						console.log(`[DB Init] Creating store: ${store}`);
						db.createObjectStore(store);
					}
				}
			};

			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	const db = await dbPromise;

	if (!db || db.close === undefined) {
		throw new Error('IndexedDB connection is invalid or closing');
	}

	return db;
}

function renderHtmlForServer(server: DiscordServer): string {
	return `
		<div class="flex flex-col gap-2 p-2">
			<img src="${server.logo}" alt="${server.name}" class="w-12 h-12 rounded-full" />
			<h3 class="text-lg font-bold">${server.name}</h3>
			<p class="text-sm opacity-70">${server.summary}</p>
			<a href="${server.invite}" class="text-purple-400 underline text-xs">Join</a>
		</div>
	`.trim();
}

async function initializeDBIfEmpty() {
	console.log('[Worker] Checking if database needs seeding...');
	const db = await ensureDatabaseReady();
	const tx = db.transaction('meta', 'readonly');
	const metaStore = tx.objectStore('meta');

	const seeded: boolean = await new Promise((resolve, reject) => {
		const checkRequest = metaStore.get('db_seeded');
		checkRequest.onsuccess = () => resolve(checkRequest.result === true);
		checkRequest.onerror = () => reject(checkRequest.error);
	});

	if (seeded) {
		console.log('[Worker] DB already seeded');
		return;
	}

	await seedInitialServerData();
}


async function seedInitialServerData() {
	console.log('[SharedWorker DB] Seeding initial server data...');

	const now = Date.now();
	const servers: DiscordServer[] = [];

	for (let i = 1; i <= 20; i++) {
		servers.push({
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
		});
	}

	const db = await ensureDatabaseReady();
	const tx = db.transaction(['jsonservers', 'htmlservers', 'meta'], 'readwrite');
	const jsonStore = tx.objectStore('jsonservers');
	const htmlStore = tx.objectStore('htmlservers');
	const metaWrite = tx.objectStore('meta');

	for (const server of servers) {
		jsonStore.put(server, server.server_id);
		htmlStore.put(renderHtmlForServer(server), server.server_id);
	}

	metaWrite.put(true, 'db_seeded');

	await new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve(true);
		tx.onerror = () => reject(tx.error);
	});

	console.log('[SharedWorker DB] Seed complete with 20 servers + HTML');
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

	port.onmessageerror = () => {
		console.warn('[SharedWorker] Port closed or errored.');
	};
	port.start();
};



// Strategy for desktop browsers with SharedWorker support

import type {
	ISupabaseStrategy,
	SelectOptions,
	SessionResponse,
	WebSocketStatus,
} from '../types';
import { WorkerPool } from '../WorkerPool';
import { getWorkerCommunication } from '../WorkerCommunication';

/** Union of all possible messages arriving on the SharedWorker port. */
interface SharedWorkerEvent {
	id?: string;
	type?: string;
	ok?: boolean;
	data?: unknown;
	error?: string;
	key?: string;
	payload?: unknown;
}

/**
 * SharedWorkerStrategy: Uses SharedWorker for WebSocket + DB Worker Pool
 *
 * Architecture:
 * - SharedWorker handles WebSocket, auth, and realtime (cross-tab sharing)
 * - Worker pool (3 workers) handles database operations (parallel execution)
 * - BroadcastChannel connects SharedWorker to worker pool
 *
 * Best for: Desktop Chrome, Firefox, Edge
 */
export class SharedWorkerStrategy implements ISupabaseStrategy {
	private worker?: SharedWorker;
	private port?: MessagePort;
	private workerPool?: WorkerPool;
	private pending = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (reason?: unknown) => void;
		}
	>();
	private listeners = new Map<string, Set<(p: unknown) => void>>();
	private comm = getWorkerCommunication();
	private sharedWorkerUrl: string | URL;
	private dbWorkerUrl: string | URL;
	private poolSize: number;

	constructor(
		sharedWorkerUrl: string | URL,
		dbWorkerUrl: string | URL,
		poolSize = 3,
	) {
		this.sharedWorkerUrl = sharedWorkerUrl;
		this.dbWorkerUrl = dbWorkerUrl;
		this.poolSize = poolSize;

		if (typeof window === 'undefined') return;
		if (!('SharedWorker' in window)) {
			throw new Error('SharedWorker not supported');
		}
	}

	async init(
		url: string,
		anonKey: string,
		options?: Record<string, unknown>,
	): Promise<SessionResponse> {
		console.log('[SharedWorkerStrategy] Initializing...');

		this.worker = new SharedWorker(this.sharedWorkerUrl, {
			type: 'module',
			name: 'supabase-shared',
		});
		this.port = this.worker.port;
		this.port.onmessage = (e: MessageEvent<SharedWorkerEvent>) =>
			this.onMessage(e.data);
		this.port.start();

		this.workerPool = new WorkerPool({
			size: this.poolSize,
			workerUrl: this.dbWorkerUrl,
		});
		await this.workerPool.init();

		const sharedWorkerInit = this.send<SessionResponse>('init', {
			url,
			anonKey,
			options,
		});

		const poolInitPromises = Array.from({ length: this.poolSize }, () =>
			this.workerPool?.send('init', { url, anonKey, options }),
		);

		await Promise.all([sharedWorkerInit, ...poolInitPromises]);

		console.log(
			`[SharedWorkerStrategy] Initialized (SharedWorker + ${this.poolSize} DB workers)`,
		);

		return sharedWorkerInit;
	}

	private onMessage(msg: SharedWorkerEvent) {
		if (msg?.type === 'ready' || msg?.type === 'auth') {
			this.emit(msg.type, msg);
			return;
		}
		if (msg?.type === 'realtime' && msg.key) {
			this.emit(`realtime:${msg.key}`, msg.payload);
			return;
		}
		if (msg?.type === 'ws.message') {
			this.emit('ws.message', msg.data);
			return;
		}
		if (msg?.type === 'ws.status') {
			this.emit('ws.status', msg);
			return;
		}

		const { id, ok, data, error } = msg ?? {};
		if (id && this.pending.has(id)) {
			const pending = this.pending.get(id);
			if (!pending) return;
			const { resolve, reject } = pending;
			this.pending.delete(id);
			ok ? resolve(data) : reject(new Error(error));
		}
	}

	private send<T>(type: string, payload?: unknown): Promise<T> {
		const id = crypto.randomUUID();
		return new Promise<T>((resolve, reject) => {
			if (!this.port)
				return reject(new Error('SharedWorker unavailable'));
			this.pending.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
			});
			this.port.postMessage({ id, type, payload });
		});
	}

	on(event: string, callback: (payload: unknown) => void): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)?.add(callback);

		return () => {
			const set = this.listeners.get(event);
			if (set) {
				set.delete(callback);
				if (set.size === 0) this.listeners.delete(event);
			}
		};
	}

	private emit(event: string, payload: unknown) {
		this.listeners.get(event)?.forEach((cb) => cb(payload));
	}

	// Auth (via SharedWorker)
	getSession(): Promise<SessionResponse> {
		return this.send<SessionResponse>('getSession');
	}

	signInWithPassword(
		email: string,
		password: string,
	): Promise<SessionResponse> {
		return this.send<SessionResponse>('signInWithPassword', {
			email,
			password,
		});
	}

	signOut(): Promise<void> {
		return this.send('signOut');
	}

	// Database (via worker pool)
	select(table: string, opts?: SelectOptions): Promise<unknown[]> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('from.select', { table, ...(opts ?? {}) });
	}

	insert(
		table: string,
		data: Record<string, unknown> | Record<string, unknown>[],
	): Promise<unknown[]> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('from.insert', { table, data });
	}

	update(
		table: string,
		data: Record<string, unknown>,
		match: Record<string, unknown>,
	): Promise<unknown[]> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('from.update', { table, data, match });
	}

	upsert(
		table: string,
		data: Record<string, unknown> | Record<string, unknown>[],
	): Promise<unknown[]> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('from.upsert', { table, data });
	}

	delete(table: string, match: Record<string, unknown>): Promise<unknown[]> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('from.delete', { table, match });
	}

	rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('rpc', { fn, args });
	}

	// Realtime (via SharedWorker)
	subscribePostgres(
		key: string,
		params: Record<string, unknown>,
		callback: (payload: unknown) => void,
	): () => void {
		const off = this.on(`realtime:${key}`, callback);
		this.send('realtime.subscribe', { key, params }).catch((e) => {
			off();
			console.error(e);
		});
		return () => {
			off();
			this.send('realtime.unsubscribe', { key }).catch(() => {
				/* best-effort */
			});
		};
	}

	// WebSocket (via SharedWorker)
	connectWebSocket(wsUrl?: string): Promise<WebSocketStatus> {
		return this.send<WebSocketStatus>('ws.connect', { wsUrl });
	}

	disconnectWebSocket(): Promise<void> {
		return this.send('ws.disconnect');
	}

	sendWebSocketMessage(data: unknown): Promise<void> {
		return this.send('ws.send', { data });
	}

	getWebSocketStatus(): Promise<WebSocketStatus> {
		return this.send<WebSocketStatus>('ws.status');
	}

	onWebSocketMessage(callback: (message: unknown) => void): () => void {
		return this.on('ws.message', callback);
	}

	onWebSocketStatus(callback: (status: WebSocketStatus) => void): () => void {
		return this.on('ws.status', (payload) =>
			callback(payload as WebSocketStatus),
		);
	}

	terminate() {
		this.workerPool?.terminate();
		this.comm.close();
		this.listeners.clear();
		this.pending.clear();
	}
}

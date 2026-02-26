// Strategy for browsers without SharedWorker (Android, Safari)

import type {
	BroadcastEvent,
	ISupabaseStrategy,
	SelectOptions,
	SessionResponse,
	WebSocketStatus,
} from '../types';
import { WorkerPool } from '../WorkerPool';
import { getWorkerCommunication } from '../WorkerCommunication';

/**
 * WebWorkerStrategy: Uses dedicated WebSocket worker + DB Worker Pool
 *
 * Architecture:
 * - Dedicated WebSocket worker handles WebSocket, auth, and realtime (no cross-tab)
 * - Worker pool (3 workers) handles database operations (parallel execution)
 * - BroadcastChannel connects WebSocket worker to worker pool
 *
 * Best for: Android, Safari, browsers without SharedWorker
 */
export class WebWorkerStrategy implements ISupabaseStrategy {
	private wsWorker?: Worker;
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
	private wsWorkerUrl: string | URL;
	private dbWorkerUrl: string | URL;
	private poolSize: number;

	constructor(
		wsWorkerUrl: string | URL,
		dbWorkerUrl: string | URL,
		poolSize = 3,
	) {
		this.wsWorkerUrl = wsWorkerUrl;
		this.dbWorkerUrl = dbWorkerUrl;
		this.poolSize = poolSize;

		if (typeof window === 'undefined') return;
		if (!('Worker' in window)) {
			throw new Error('Worker not supported');
		}
	}

	async init(
		url: string,
		anonKey: string,
		options?: Record<string, unknown>,
	): Promise<SessionResponse> {
		console.log('[WebWorkerStrategy] Initializing...');

		this.wsWorker = new Worker(this.wsWorkerUrl, {
			type: 'module',
			name: 'websocket-worker',
		});
		this.wsWorker.onmessage = (e) => this.onMessage(e.data);
		this.wsWorker.onerror = (err) =>
			console.error('[WebWorkerStrategy] WebSocket worker error:', err);

		this.workerPool = new WorkerPool({
			size: this.poolSize,
			workerUrl: this.dbWorkerUrl,
		});
		await this.workerPool.init();

		const wsWorkerInit = this.send<SessionResponse>('init', {
			url,
			anonKey,
			options,
		});

		const poolInitPromises = Array.from({ length: this.poolSize }, () =>
			this.workerPool?.send('init', { url, anonKey, options }),
		);

		await Promise.all([wsWorkerInit, ...poolInitPromises]);

		console.log(
			`[WebWorkerStrategy] Initialized (WebSocket worker + ${this.poolSize} DB workers)`,
		);

		return wsWorkerInit;
	}

	private onMessage(msg: unknown) {
		const message = msg as
			| (BroadcastEvent & {
					id?: string;
					ok?: boolean;
					data?: unknown;
					error?: string;
					key?: string;
			  })
			| null
			| undefined;
		if (message?.type === 'ready' || message?.type === 'auth') {
			this.emit(message.type, message);
			return;
		}
		if (message?.type === 'realtime' && message.key) {
			this.emit(`realtime:${message.key}`, message.payload);
			return;
		}
		if (message?.type === 'ws.message') {
			this.emit('ws.message', message.data);
			return;
		}
		if (message?.type === 'ws.status') {
			this.emit('ws.status', message);
			return;
		}

		const id = message?.id;
		const ok = message?.ok;
		const data = message?.data;
		const error = message?.error;
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
			if (!this.wsWorker)
				return reject(new Error('WebSocket worker unavailable'));
			this.pending.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
			});
			this.wsWorker.postMessage({ id, type, payload });
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

	// Auth (via WebSocket worker)
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

	// Realtime (via WebSocket worker)
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

	// WebSocket (via dedicated worker)
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
		return this.on('ws.status', callback as (payload: unknown) => void);
	}

	terminate() {
		this.wsWorker?.terminate();
		this.workerPool?.terminate();
		this.comm.close();
		this.listeners.clear();
		this.pending.clear();
	}
}

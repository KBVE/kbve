// Strategy for browsers without SharedWorker (Android, Safari)

import type {
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
	private listeners = new Map<string, Set<(p: any) => void>>();
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
		options?: any,
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
			this.workerPool!.send('init', { url, anonKey, options }),
		);

		await Promise.all([wsWorkerInit, ...poolInitPromises]);

		console.log(
			`[WebWorkerStrategy] Initialized (WebSocket worker + ${this.poolSize} DB workers)`,
		);

		return wsWorkerInit;
	}

	private onMessage(msg: any) {
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
			const { resolve, reject } = this.pending.get(id)!;
			this.pending.delete(id);
			ok ? resolve(data) : reject(new Error(error));
		}
	}

	private send<T>(type: string, payload?: any): Promise<T> {
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

	on(event: string, callback: (payload: any) => void): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback);

		return () => {
			const set = this.listeners.get(event);
			if (set) {
				set.delete(callback);
				if (set.size === 0) this.listeners.delete(event);
			}
		};
	}

	private emit(event: string, payload: any) {
		this.listeners.get(event)?.forEach((cb) => cb(payload));
	}

	// Auth (via WebSocket worker)
	getSession(): Promise<SessionResponse> {
		return this.send<SessionResponse>('getSession');
	}

	signInWithPassword(email: string, password: string): Promise<any> {
		return this.send('signInWithPassword', { email, password });
	}

	signOut(): Promise<void> {
		return this.send('signOut');
	}

	// Database (via worker pool)
	select(table: string, opts?: SelectOptions): Promise<any> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('from.select', { table, ...(opts ?? {}) });
	}

	insert(
		table: string,
		data: Record<string, any> | Record<string, any>[],
	): Promise<any> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('from.insert', { table, data });
	}

	update(
		table: string,
		data: Record<string, any>,
		match: Record<string, any>,
	): Promise<any> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('from.update', { table, data, match });
	}

	upsert(
		table: string,
		data: Record<string, any> | Record<string, any>[],
	): Promise<any> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('from.upsert', { table, data });
	}

	delete(table: string, match: Record<string, any>): Promise<any> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('from.delete', { table, match });
	}

	rpc(fn: string, args?: Record<string, any>): Promise<any> {
		if (!this.workerPool) throw new Error('Worker pool not initialized');
		return this.workerPool.send('rpc', { fn, args });
	}

	// Realtime (via WebSocket worker)
	subscribePostgres(
		key: string,
		params: any,
		callback: (payload: any) => void,
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

	sendWebSocketMessage(data: any): Promise<void> {
		return this.send('ws.send', { data });
	}

	getWebSocketStatus(): Promise<WebSocketStatus> {
		return this.send<WebSocketStatus>('ws.status');
	}

	onWebSocketMessage(callback: (message: any) => void): () => void {
		return this.on('ws.message', callback);
	}

	onWebSocketStatus(callback: (status: any) => void): () => void {
		return this.on('ws.status', callback);
	}

	terminate() {
		this.wsWorker?.terminate();
		this.workerPool?.terminate();
		this.comm.close();
		this.listeners.clear();
		this.pending.clear();
	}
}

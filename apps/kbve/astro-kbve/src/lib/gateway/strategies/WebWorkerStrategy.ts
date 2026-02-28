// src/lib/gateway/strategies/WebWorkerStrategy.ts
// Strategy for browsers without SharedWorker (Android, Safari)

import type {
	ISupabaseStrategy,
	SelectOptions,
	SessionResponse,
	WebSocketStatus,
} from '../types';
import { WorkerPool } from '../WorkerPool';
import { getWorkerCommunication } from '../WorkerCommunication';
import { DbWorkerUrl, WebSocketWorkerUrl } from '../workers';

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
		{ resolve: Function; reject: Function }
	>();
	private listeners = new Map<string, Set<(p: any) => void>>();
	private comm = getWorkerCommunication();

	constructor() {
		if (typeof window === 'undefined') return;
		if (!('Worker' in window)) {
			throw new Error('Worker not supported');
		}
	}

	/**
	 * Initialize WebSocket worker and DB worker pool
	 */
	async init(
		url: string,
		anonKey: string,
		options?: any,
	): Promise<SessionResponse> {
		console.log('[WebWorkerStrategy] Initializing...');

		// Initialize dedicated WebSocket worker using pre-bundled worker URL
		this.wsWorker = new Worker(WebSocketWorkerUrl, {
			type: 'module',
			name: 'websocket-worker',
		});
		this.wsWorker.onmessage = (e) => this.onMessage(e.data);
		this.wsWorker.onerror = (err) =>
			console.error('[WebWorkerStrategy] WebSocket worker error:', err);

		// Initialize DB worker pool with pre-bundled worker URL
		this.workerPool = new WorkerPool({
			size: 3,
			workerUrl: DbWorkerUrl,
		});
		await this.workerPool.init();

		// Initialize WebSocket worker
		const wsWorkerInit = this.send<SessionResponse>('init', {
			url,
			anonKey,
			options,
		});

		// Initialize each DB worker in the pool
		const poolInitPromises = [0, 1, 2].map(() =>
			this.workerPool!.send('init', { url, anonKey, options }),
		);

		await Promise.all([wsWorkerInit, ...poolInitPromises]);

		console.log(
			'[WebWorkerStrategy] Initialized (WebSocket worker + 3 DB workers)',
		);

		return wsWorkerInit;
	}

	/**
	 * Handle messages from WebSocket worker
	 */
	private onMessage(msg: any) {
		// Handle events (auth, realtime, WebSocket)
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

		// Handle response
		const { id, ok, data, error } = msg ?? {};
		if (id && this.pending.has(id)) {
			const { resolve, reject } = this.pending.get(id)!;
			this.pending.delete(id);
			ok ? resolve(data) : reject(new Error(error));
		}
	}

	/**
	 * Send message to WebSocket worker
	 */
	private send<T>(type: string, payload?: any): Promise<T> {
		const id = crypto.randomUUID();
		return new Promise<T>((resolve, reject) => {
			if (!this.wsWorker)
				return reject(new Error('WebSocket worker unavailable'));
			this.pending.set(id, { resolve, reject });
			this.wsWorker.postMessage({ id, type, payload });
		});
	}

	/**
	 * Event handling
	 */
	on(event: string, callback: (payload: any) => void): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback);

		return () => {
			const set = this.listeners.get(event);
			if (set) {
				set.delete(callback);
				if (set.size === 0) {
					this.listeners.delete(event);
				}
			}
		};
	}

	private emit(event: string, payload: any) {
		this.listeners.get(event)?.forEach((cb) => cb(payload));
	}

	/**
	 * Auth operations (via WebSocket worker)
	 */
	getSession(): Promise<SessionResponse> {
		return this.send<SessionResponse>('getSession');
	}

	signInWithPassword(email: string, password: string): Promise<any> {
		return this.send('signInWithPassword', { email, password });
	}

	signOut(): Promise<void> {
		return this.send('signOut');
	}

	/**
	 * Database operations (via worker pool for parallel execution)
	 */
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

	/**
	 * Realtime (via WebSocket worker)
	 */
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
			this.send('realtime.unsubscribe', { key }).catch(() => {});
		};
	}

	/**
	 * WebSocket (via dedicated WebSocket worker)
	 */
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

	/**
	 * Cleanup
	 */
	terminate() {
		this.wsWorker?.terminate();
		this.workerPool?.terminate();
		this.comm.close();
		this.listeners.clear();
		this.pending.clear();
	}
}

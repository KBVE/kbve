// src/lib/supabase-shared.ts
export class SupaShared {
	private worker?: SharedWorker;
	private port?: MessagePort;
	private pending = new Map<
		string,
		{ resolve: Function; reject: Function }
	>();
	private listeners = new Map<string, Set<(p: any) => void>>();

	constructor() {
		if (typeof window === 'undefined') return; // SSR guard
		if (!('SharedWorker' in window)) return; // Safari fallback handled by caller

		// Use Vite's native worker import syntax
		this.worker = new SharedWorker(
			new URL('../workers/supabase.shared.ts', import.meta.url),
			{ type: 'module' },
		);
		this.port = this.worker.port;
		this.port.onmessage = (e) => this.onMessage(e.data);
		this.port.start();
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
		// Handle WebSocket messages
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
			if (!this.port)
				return reject(new Error('SharedWorker unavailable'));
			this.pending.set(id, { resolve, reject });
			this.port.postMessage({ id, type, payload });
		});
	}

	on(event: string, cb: (payload: any) => void) {
		if (!this.listeners.has(event)) this.listeners.set(event, new Set());
		this.listeners.get(event)!.add(cb);
		return () => this.listeners.get(event)!.delete(cb);
	}
	private emit(event: string, payload: any) {
		this.listeners.get(event)?.forEach((cb) => cb(payload));
	}

	// API
	init(url: string, anonKey: string, options?: any) {
		return this.send<{ session: any }>('init', { url, anonKey, options });
	}
	getSession() {
		return this.send<{ session: any; user: any }>('getSession');
	}
	signInWithPassword(email: string, password: string) {
		return this.send('signInWithPassword', { email, password });
	}
	signOut() {
		return this.send('signOut');
	}
	select(
		table: string,
		opts?: {
			columns?: string;
			match?: Record<string, any>;
			limit?: number;
		},
	) {
		return this.send('from.select', { table, ...(opts ?? {}) });
	}
	insert(table: string, data: Record<string, any> | Record<string, any>[]) {
		return this.send('from.insert', { table, data });
	}
	update(
		table: string,
		data: Record<string, any>,
		match: Record<string, any>,
	) {
		return this.send('from.update', { table, data, match });
	}
	upsert(table: string, data: Record<string, any> | Record<string, any>[]) {
		return this.send('from.upsert', { table, data });
	}
	delete(table: string, match: Record<string, any>) {
		return this.send('from.delete', { table, match });
	}
	rpc(fn: string, args?: Record<string, any>) {
		return this.send('rpc', { fn, args });
	}
	subscribePostgres(key: string, params: any, cb: (payload: any) => void) {
		const off = this.on(`realtime:${key}`, cb);
		this.send('realtime.subscribe', { key, params }).catch((e) => {
			off();
			console.error(e);
		});
		return () => {
			off();
			this.send('realtime.unsubscribe', { key }).catch(() => {});
		};
	}

	// WebSocket methods
	connectWebSocket(wsUrl?: string) {
		return this.send<{ status: string; readyState: number | null }>(
			'ws.connect',
			{ wsUrl },
		);
	}
	disconnectWebSocket() {
		return this.send('ws.disconnect');
	}
	sendWebSocketMessage(data: any) {
		return this.send('ws.send', { data });
	}
	getWebSocketStatus() {
		return this.send<{ status: string; readyState: number | null }>(
			'ws.status',
		);
	}
	onWebSocketMessage(cb: (message: any) => void) {
		return this.on('ws.message', cb);
	}
	onWebSocketStatus(cb: (status: any) => void) {
		return this.on('ws.status', cb);
	}
}

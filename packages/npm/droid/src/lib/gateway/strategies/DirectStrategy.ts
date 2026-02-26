// Fallback strategy for browsers without worker support
// Runs everything on the main thread

import type {
	SupabaseClient,
	RealtimePostgresChangesFilter,
} from '@supabase/supabase-js';
import { REALTIME_POSTGRES_CHANGES_LISTEN_EVENT } from '@supabase/supabase-js';

import type {
	ISupabaseStrategy,
	SelectOptions,
	SessionResponse,
	WebSocketStatus,
} from '../types';

/**
 * DirectStrategy: Everything runs in main thread
 *
 * Architecture:
 * - No workers, all operations on main thread
 * - Uses Supabase client directly
 * - Implements same interface as worker strategies
 *
 * Best for: Browsers without Worker/BroadcastChannel support, or emergency fallback
 *
 * Note: Requires `@supabase/supabase-js` to be available at runtime.
 * This strategy dynamically imports it to avoid bundling Supabase in the main droid build.
 */
export class DirectStrategy implements ISupabaseStrategy {
	private client: SupabaseClient | null = null;
	private ws: WebSocket | null = null;
	private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private wsReconnectAttempts = 0;
	private wsHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private wsLastPongTime = 0;
	private subscriptions = new Map<
		string,
		{ unsubscribe: () => Promise<void> | void }
	>();
	private listeners = new Map<string, Set<(payload: unknown) => void>>();

	private readonly WS_MAX_RECONNECT_ATTEMPTS = 5;
	private readonly WS_RECONNECT_DELAY_MS = 3000;
	private readonly WS_HEARTBEAT_INTERVAL_MS = 30000;
	private readonly WS_HEARTBEAT_TIMEOUT_MS = 60000;

	async init(
		url: string,
		anonKey: string,
		options?: Record<string, unknown>,
	): Promise<SessionResponse> {
		console.log('[DirectStrategy] Initializing...');

		// Dynamic import to avoid bundling Supabase when not using DirectStrategy
		const { createClient } = await import('@supabase/supabase-js');

		const authOptions =
			options?.['auth'] && typeof options['auth'] === 'object'
				? (options['auth'] as Record<string, unknown>)
				: {};

		this.client = createClient(url, anonKey, {
			...options,
			auth: {
				...authOptions,
				autoRefreshToken: true,
				persistSession: true,
				detectSessionInUrl: false,
			},
		});

		this.client.auth.onAuthStateChange((_event, session) => {
			this.emit('auth', { session });
		});

		const {
			data: { session },
			error,
		} = await this.client.auth.getSession();

		if (error) {
			console.error('[DirectStrategy] Session error:', error);
		}

		console.log('[DirectStrategy] Initialized');

		return {
			session: session as SessionResponse['session'],
			user: (session?.user as unknown as Record<string, unknown>) || null,
		};
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
		this.listeners.get(event)?.forEach((cb) => {
			try {
				cb(payload);
			} catch (err) {
				console.error(
					`[DirectStrategy] Listener error for ${event}:`,
					err,
				);
			}
		});
	}

	// Auth
	async getSession(): Promise<SessionResponse> {
		if (!this.client) throw new Error('Client not initialized');
		const { data, error } = await this.client.auth.getSession();
		if (error) throw error;
		return data as unknown as SessionResponse;
	}

	async signInWithPassword(
		email: string,
		password: string,
	): Promise<SessionResponse> {
		if (!this.client) throw new Error('Client not initialized');
		const { data, error } = await this.client.auth.signInWithPassword({
			email,
			password,
		});
		if (error) throw error;
		return data as unknown as SessionResponse;
	}

	async signOut(): Promise<void> {
		if (!this.client) throw new Error('Client not initialized');
		const { error } = await this.client.auth.signOut();
		if (error) throw error;
	}

	// Database
	async select(table: string, opts?: SelectOptions): Promise<unknown[]> {
		if (!this.client) throw new Error('Client not initialized');
		let query = this.client.from(table).select(opts?.columns || '*');
		if (opts?.match) {
			for (const [key, value] of Object.entries(opts.match)) {
				query = query.eq(key, value);
			}
		}
		if (opts?.limit) query = query.limit(opts.limit);
		const { data, error } = await query;
		if (error) throw error;
		return data;
	}

	async insert(
		table: string,
		data: Record<string, unknown> | Record<string, unknown>[],
	): Promise<unknown[]> {
		if (!this.client) throw new Error('Client not initialized');
		const { data: result, error } = await this.client
			.from(table)
			.insert(data)
			.select();
		if (error) throw error;
		return result;
	}

	async update(
		table: string,
		data: Record<string, unknown>,
		match: Record<string, unknown>,
	): Promise<unknown[]> {
		if (!this.client) throw new Error('Client not initialized');
		let query = this.client.from(table).update(data);
		for (const [key, value] of Object.entries(match)) {
			query = query.eq(key, value);
		}
		const { data: result, error } = await query.select();
		if (error) throw error;
		return result;
	}

	async upsert(
		table: string,
		data: Record<string, unknown> | Record<string, unknown>[],
	): Promise<unknown[]> {
		if (!this.client) throw new Error('Client not initialized');
		const { data: result, error } = await this.client
			.from(table)
			.upsert(data)
			.select();
		if (error) throw error;
		return result;
	}

	async delete(
		table: string,
		match: Record<string, unknown>,
	): Promise<unknown[]> {
		if (!this.client) throw new Error('Client not initialized');
		let query = this.client.from(table).delete();
		for (const [key, value] of Object.entries(match)) {
			query = query.eq(key, value);
		}
		const { data: result, error } = await query.select();
		if (error) throw error;
		return result;
	}

	async rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
		if (!this.client) throw new Error('Client not initialized');
		const { data, error } = await this.client.rpc(fn, args || {});
		if (error) throw error;
		return data;
	}

	// Realtime
	subscribePostgres(
		key: string,
		params: Record<string, unknown>,
		callback: (payload: unknown) => void,
	): () => void {
		if (!this.client) throw new Error('Client not initialized');

		const channel = this.client
			.channel(key)
			.on(
				'postgres_changes',
				params as RealtimePostgresChangesFilter<`${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT}`>,
				(payload: unknown) => {
					this.emit(`realtime:${key}`, payload);
				},
			);

		channel.subscribe();
		this.subscriptions.set(key, {
			unsubscribe: async () => {
				await channel.unsubscribe();
			},
		});

		const off = this.on(`realtime:${key}`, callback);

		return () => {
			off();
			const sub = this.subscriptions.get(key);
			if (sub) {
				sub.unsubscribe();
				this.subscriptions.delete(key);
			}
		};
	}

	// WebSocket
	async connectWebSocket(wsUrl?: string): Promise<WebSocketStatus> {
		if (
			this.ws &&
			(this.ws.readyState === WebSocket.CONNECTING ||
				this.ws.readyState === WebSocket.OPEN)
		) {
			return this.getWebSocketStatus();
		}

		if (!this.client) throw new Error('Client not initialized');

		const {
			data: { session },
			error,
		} = await this.client.auth.getSession();
		if (error || !session?.access_token) {
			throw new Error('No active session');
		}

		const url = wsUrl || this.getDefaultWebSocketUrl();
		const authenticatedUrl = `${url}?token=${encodeURIComponent(session.access_token)}`;

		console.log('[DirectStrategy] Connecting to WebSocket:', url);
		this.ws = new WebSocket(authenticatedUrl);

		this.ws.onopen = () => {
			this.wsReconnectAttempts = 0;
			this.wsLastPongTime = Date.now();
			this.startHeartbeat();
			this.emit('ws.status', { status: 'connected', url });
		};

		this.ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data as string) as Record<
					string,
					unknown
				>;
				if (message['type'] === 'pong') {
					this.wsLastPongTime = Date.now();
					return;
				}
				this.emit('ws.message', message);
			} catch (error) {
				console.error(
					'[DirectStrategy] Failed to parse message:',
					error,
				);
			}
		};

		this.ws.onerror = () => {
			this.emit('ws.status', {
				status: 'error',
				error: 'Connection error',
			});
		};

		this.ws.onclose = (event) => {
			this.ws = null;
			this.stopHeartbeat();
			this.emit('ws.status', {
				status: 'disconnected',
				code: event.code,
				reason: event.reason,
			});

			if (
				event.code !== 1000 &&
				this.wsReconnectAttempts < this.WS_MAX_RECONNECT_ATTEMPTS
			) {
				this.wsReconnectAttempts++;
				this.wsReconnectTimer = setTimeout(() => {
					this.connectWebSocket(wsUrl).catch(() => {
						/* reconnect best-effort */
					});
				}, this.WS_RECONNECT_DELAY_MS);
			}
		};

		return this.getWebSocketStatus();
	}

	async disconnectWebSocket(): Promise<void> {
		if (this.wsReconnectTimer) {
			clearTimeout(this.wsReconnectTimer);
			this.wsReconnectTimer = null;
		}
		this.stopHeartbeat();
		if (this.ws) {
			this.ws.close(1000, 'Client request');
			this.ws = null;
			this.wsReconnectAttempts = 0;
			this.emit('ws.status', { status: 'disconnected' });
		}
	}

	async sendWebSocketMessage(data: unknown): Promise<void> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error('WebSocket not connected');
		}
		const message = typeof data === 'string' ? data : JSON.stringify(data);
		this.ws.send(message);
	}

	async getWebSocketStatus(): Promise<WebSocketStatus> {
		if (!this.ws) return { status: 'disconnected', readyState: null };
		const readyStateMap: Record<number, WebSocketStatus['status']> = {
			[WebSocket.CONNECTING]: 'connecting',
			[WebSocket.OPEN]: 'connected',
			[WebSocket.CLOSING]: 'disconnected',
			[WebSocket.CLOSED]: 'disconnected',
		};
		return {
			status: readyStateMap[this.ws.readyState] || 'disconnected',
			readyState: this.ws.readyState,
		};
	}

	onWebSocketMessage(callback: (message: unknown) => void): () => void {
		return this.on('ws.message', callback);
	}

	onWebSocketStatus(callback: (status: WebSocketStatus) => void): () => void {
		return this.on('ws.status', callback as (payload: unknown) => void);
	}

	// Helpers
	private getDefaultWebSocketUrl(): string {
		if (typeof window === 'undefined') return 'ws://localhost:4321/ws';
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const isLocalhost =
			window.location.hostname === 'localhost' ||
			window.location.hostname === '127.0.0.1';
		const port = isLocalhost ? '4321' : window.location.port;
		const host = window.location.hostname;
		return `${protocol}//${host}${port ? ':' + port : ''}/ws`;
	}

	private startHeartbeat() {
		this.stopHeartbeat();
		this.wsHeartbeatTimer = setInterval(() => {
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
				this.stopHeartbeat();
				return;
			}
			if (
				this.wsLastPongTime > 0 &&
				Date.now() - this.wsLastPongTime > this.WS_HEARTBEAT_TIMEOUT_MS
			) {
				console.warn('[DirectStrategy] Heartbeat timeout');
				this.stopHeartbeat();
				this.ws.close(1001, 'Heartbeat timeout');
				return;
			}
			try {
				this.ws.send(JSON.stringify({ type: 'ping' }));
			} catch (error) {
				console.error(
					'[DirectStrategy] Failed to send heartbeat:',
					error,
				);
			}
		}, this.WS_HEARTBEAT_INTERVAL_MS);
	}

	private stopHeartbeat() {
		if (this.wsHeartbeatTimer) {
			clearInterval(this.wsHeartbeatTimer);
			this.wsHeartbeatTimer = null;
		}
	}

	terminate() {
		this.disconnectWebSocket();
		this.subscriptions.forEach((sub) => sub.unsubscribe());
		this.subscriptions.clear();
		this.listeners.clear();
	}
}

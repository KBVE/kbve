// src/lib/gateway/types.ts
// Shared types for all gateway strategies

export interface SupabaseConfig {
	url: string;
	anonKey: string;
	options?: any;
}

export interface Session {
	access_token: string;
	refresh_token: string;
	user: any;
	expires_at?: number;
}

export interface SessionResponse {
	session: Session | null;
	user?: any;
}

export interface WebSocketStatus {
	status: 'connected' | 'disconnected' | 'connecting' | 'error';
	readyState: number | null;
	error?: string;
}

// Unified API that all strategies must implement
export interface ISupabaseStrategy {
	// Lifecycle
	init(url: string, anonKey: string, options?: any): Promise<SessionResponse>;

	// Event handling
	on(event: string, callback: (payload: any) => void): () => void;

	// Auth
	getSession(): Promise<SessionResponse>;
	signInWithPassword(email: string, password: string): Promise<any>;
	signOut(): Promise<void>;

	// Database
	select(table: string, opts?: SelectOptions): Promise<any>;
	insert(
		table: string,
		data: Record<string, any> | Record<string, any>[],
	): Promise<any>;
	update(
		table: string,
		data: Record<string, any>,
		match: Record<string, any>,
	): Promise<any>;
	upsert(
		table: string,
		data: Record<string, any> | Record<string, any>[],
	): Promise<any>;
	delete(table: string, match: Record<string, any>): Promise<any>;
	rpc(fn: string, args?: Record<string, any>): Promise<any>;

	// Realtime
	subscribePostgres(
		key: string,
		params: any,
		callback: (payload: any) => void,
	): () => void;

	// WebSocket
	connectWebSocket(wsUrl?: string): Promise<WebSocketStatus>;
	disconnectWebSocket(): Promise<void>;
	sendWebSocketMessage(data: any): Promise<void>;
	getWebSocketStatus(): Promise<WebSocketStatus>;
	onWebSocketMessage(callback: (message: any) => void): () => void;
	onWebSocketStatus(callback: (status: any) => void): () => void;
}

export interface SelectOptions {
	columns?: string;
	match?: Record<string, any>;
	limit?: number;
}

// Worker communication messages
export interface WorkerMessage {
	id: string;
	type: string;
	payload?: any;
}

export interface WorkerResponse {
	id: string;
	ok: boolean;
	data?: any;
	error?: string;
}

// BroadcastChannel event types
export interface BroadcastEvent {
	type: 'auth' | 'ws.message' | 'ws.status' | 'realtime' | 'ready';
	data?: any;
	key?: string;
	payload?: any;
}

// Strategy types
export type StrategyType = 'shared-worker' | 'web-worker' | 'direct';

// Browser capabilities
export interface BrowserCapabilities {
	hasSharedWorker: boolean;
	hasWorker: boolean;
	hasBroadcastChannel: boolean;
	isAndroid: boolean;
	isSafari: boolean;
}

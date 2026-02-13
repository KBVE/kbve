// Shared types for all gateway strategies

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  options?: Record<string, unknown>;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  user: Record<string, unknown>;
  expires_at?: number;
}

export interface SessionResponse {
  session: Session | null;
  user?: Record<string, unknown>;
}

export interface WebSocketStatus {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  readyState: number | null;
  error?: string;
}

// Unified API that all strategies must implement
export interface ISupabaseStrategy {
  // Lifecycle
  init(url: string, anonKey: string, options?: Record<string, unknown>): Promise<SessionResponse>;

  // Event handling
  on(event: string, callback: (payload: unknown) => void): () => void;

  // Auth
  getSession(): Promise<SessionResponse>;
  signInWithPassword(email: string, password: string): Promise<SessionResponse>;
  signOut(): Promise<void>;

  // Database
  select(table: string, opts?: SelectOptions): Promise<unknown[]>;
  insert(table: string, data: Record<string, unknown> | Record<string, unknown>[]): Promise<unknown[]>;
  update(table: string, data: Record<string, unknown>, match: Record<string, unknown>): Promise<unknown[]>;
  upsert(table: string, data: Record<string, unknown> | Record<string, unknown>[]): Promise<unknown[]>;
  delete(table: string, match: Record<string, unknown>): Promise<unknown[]>;
  rpc(fn: string, args?: Record<string, unknown>): Promise<unknown>;

  // Realtime
  subscribePostgres(key: string, params: Record<string, unknown>, callback: (payload: unknown) => void): () => void;

  // WebSocket
  connectWebSocket(wsUrl?: string): Promise<WebSocketStatus>;
  disconnectWebSocket(): Promise<void>;
  sendWebSocketMessage(data: unknown): Promise<void>;
  getWebSocketStatus(): Promise<WebSocketStatus>;
  onWebSocketMessage(callback: (message: unknown) => void): () => void;
  onWebSocketStatus(callback: (status: WebSocketStatus) => void): () => void;

  // Cleanup
  terminate(): void;
}

export interface SelectOptions {
  columns?: string;
  match?: Record<string, unknown>;
  limit?: number;
}

// Worker communication messages
export interface WorkerMessage {
  id: string;
  type: string;
  payload?: unknown;
}

export interface WorkerResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

// BroadcastChannel event types
export interface BroadcastEvent {
  type: 'auth' | 'ws.message' | 'ws.status' | 'realtime' | 'ready';
  data?: unknown;
  key?: string;
  payload?: unknown;
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

// Gateway configuration
export interface GatewayConfig {
  workerUrls?: {
    sharedWorker?: string | URL;
    dbWorker?: string | URL;
    webSocketWorker?: string | URL;
  };
  forceStrategy?: StrategyType;
  poolSize?: number;
}

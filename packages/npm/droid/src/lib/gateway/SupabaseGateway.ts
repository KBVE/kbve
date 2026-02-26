// Unified gateway for Supabase operations with automatic strategy selection

import type {
	ISupabaseStrategy,
	SelectOptions,
	SessionResponse,
	WebSocketStatus,
	StrategyType,
	GatewayConfig,
} from './types';
import {
	detectCapabilities,
	selectStrategy,
	logCapabilities,
	getStrategyDescription,
} from './capabilities';
import { SharedWorkerStrategy } from './strategies/SharedWorkerStrategy';
import { WebWorkerStrategy } from './strategies/WebWorkerStrategy';
import { DirectStrategy } from './strategies/DirectStrategy';

// Vite ?worker&url imports — bundles workers as JS and returns their URL
import defaultSharedWorkerUrl from '../workers/supabase-shared-worker?worker&url';
import defaultDbWorkerUrl from '../workers/supabase-db-worker?worker&url';

/**
 * SupabaseGateway: Unified interface for all Supabase operations
 *
 * Automatically selects the best strategy based on browser capabilities:
 * 1. SharedWorker + DB Worker Pool (desktop: Chrome, Firefox, Edge)
 * 2. WebSocket Worker + DB Worker Pool (Android, Safari)
 * 3. Direct/Main thread (fallback)
 *
 * All strategies implement the same interface, so application code is unchanged.
 */
export class SupabaseGateway implements ISupabaseStrategy {
	private strategy: ISupabaseStrategy;
	private strategyType: StrategyType;

	constructor(config: GatewayConfig = {}) {
		const capabilities = detectCapabilities();
		logCapabilities(capabilities);

		this.strategyType =
			config.forceStrategy || selectStrategy(capabilities);
		console.log(
			`[SupabaseGateway] Selected strategy: ${getStrategyDescription(this.strategyType)}`,
		);

		const poolSize = config.poolSize ?? 3;
		const workerUrls = config.workerUrls ?? {};

		switch (this.strategyType) {
			case 'shared-worker': {
				const sharedUrl =
					workerUrls.sharedWorker ?? defaultSharedWorkerUrl;
				const dbUrl = workerUrls.dbWorker ?? defaultDbWorkerUrl;
				this.strategy = new SharedWorkerStrategy(
					sharedUrl,
					dbUrl,
					poolSize,
				);
				break;
			}
			case 'web-worker': {
				const wsUrl =
					workerUrls.webSocketWorker ?? defaultSharedWorkerUrl;
				const dbUrl = workerUrls.dbWorker ?? defaultDbWorkerUrl;
				this.strategy = new WebWorkerStrategy(wsUrl, dbUrl, poolSize);
				break;
			}
			case 'direct':
				this.strategy = new DirectStrategy();
				break;
		}
	}

	getStrategyType(): StrategyType {
		return this.strategyType;
	}

	getStrategyDescription(): string {
		return getStrategyDescription(this.strategyType);
	}

	// Delegate all methods to the selected strategy

	init(
		url: string,
		anonKey: string,
		options?: Record<string, unknown>,
	): Promise<SessionResponse> {
		return this.strategy.init(url, anonKey, options);
	}

	on(event: string, callback: (payload: unknown) => void): () => void {
		return this.strategy.on(event, callback);
	}

	getSession(): Promise<SessionResponse> {
		return this.strategy.getSession();
	}

	signInWithPassword(
		email: string,
		password: string,
	): Promise<SessionResponse> {
		return this.strategy.signInWithPassword(email, password);
	}

	signOut(): Promise<void> {
		return this.strategy.signOut();
	}

	select(table: string, opts?: SelectOptions): Promise<unknown[]> {
		return this.strategy.select(table, opts);
	}

	insert(
		table: string,
		data: Record<string, unknown> | Record<string, unknown>[],
	): Promise<unknown[]> {
		return this.strategy.insert(table, data);
	}

	update(
		table: string,
		data: Record<string, unknown>,
		match: Record<string, unknown>,
	): Promise<unknown[]> {
		return this.strategy.update(table, data, match);
	}

	upsert(
		table: string,
		data: Record<string, unknown> | Record<string, unknown>[],
	): Promise<unknown[]> {
		return this.strategy.upsert(table, data);
	}

	delete(table: string, match: Record<string, unknown>): Promise<unknown[]> {
		return this.strategy.delete(table, match);
	}

	rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
		return this.strategy.rpc(fn, args);
	}

	subscribePostgres(
		key: string,
		params: Record<string, unknown>,
		callback: (payload: unknown) => void,
	): () => void {
		return this.strategy.subscribePostgres(key, params, callback);
	}

	connectWebSocket(wsUrl?: string): Promise<WebSocketStatus> {
		return this.strategy.connectWebSocket(wsUrl);
	}

	disconnectWebSocket(): Promise<void> {
		return this.strategy.disconnectWebSocket();
	}

	sendWebSocketMessage(data: unknown): Promise<void> {
		return this.strategy.sendWebSocketMessage(data);
	}

	getWebSocketStatus(): Promise<WebSocketStatus> {
		return this.strategy.getWebSocketStatus();
	}

	onWebSocketMessage(callback: (message: unknown) => void): () => void {
		return this.strategy.onWebSocketMessage(callback);
	}

	onWebSocketStatus(callback: (status: WebSocketStatus) => void): () => void {
		return this.strategy.onWebSocketStatus(callback);
	}

	terminate() {
		this.strategy.terminate();
	}
}

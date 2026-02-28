// src/lib/gateway/SupabaseGateway.ts
// Unified gateway for Supabase operations with automatic strategy selection

import type {
	ISupabaseStrategy,
	SelectOptions,
	SessionResponse,
	WebSocketStatus,
	StrategyType,
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

	constructor() {
		// Detect browser capabilities
		const capabilities = detectCapabilities();
		logCapabilities(capabilities);

		// Select best strategy
		this.strategyType = selectStrategy(capabilities);
		console.log(
			`[SupabaseGateway] Selected strategy: ${getStrategyDescription(this.strategyType)}`,
		);

		// Initialize strategy
		switch (this.strategyType) {
			case 'shared-worker':
				this.strategy = new SharedWorkerStrategy();
				break;
			case 'web-worker':
				this.strategy = new WebWorkerStrategy();
				break;
			case 'direct':
				this.strategy = new DirectStrategy();
				break;
		}
	}

	/**
	 * Get the active strategy type
	 */
	getStrategyType(): StrategyType {
		return this.strategyType;
	}

	/**
	 * Get strategy description
	 */
	getStrategyDescription(): string {
		return getStrategyDescription(this.strategyType);
	}

	// Delegate all methods to the selected strategy

	init(
		url: string,
		anonKey: string,
		options?: any,
	): Promise<SessionResponse> {
		return this.strategy.init(url, anonKey, options);
	}

	on(event: string, callback: (payload: any) => void): () => void {
		return this.strategy.on(event, callback);
	}

	getSession(): Promise<SessionResponse> {
		return this.strategy.getSession();
	}

	signInWithPassword(email: string, password: string): Promise<any> {
		return this.strategy.signInWithPassword(email, password);
	}

	signOut(): Promise<void> {
		return this.strategy.signOut();
	}

	select(table: string, opts?: SelectOptions): Promise<any> {
		return this.strategy.select(table, opts);
	}

	insert(
		table: string,
		data: Record<string, any> | Record<string, any>[],
	): Promise<any> {
		return this.strategy.insert(table, data);
	}

	update(
		table: string,
		data: Record<string, any>,
		match: Record<string, any>,
	): Promise<any> {
		return this.strategy.update(table, data, match);
	}

	upsert(
		table: string,
		data: Record<string, any> | Record<string, any>[],
	): Promise<any> {
		return this.strategy.upsert(table, data);
	}

	delete(table: string, match: Record<string, any>): Promise<any> {
		return this.strategy.delete(table, match);
	}

	rpc(fn: string, args?: Record<string, any>): Promise<any> {
		return this.strategy.rpc(fn, args);
	}

	subscribePostgres(
		key: string,
		params: any,
		callback: (payload: any) => void,
	): () => void {
		return this.strategy.subscribePostgres(key, params, callback);
	}

	connectWebSocket(wsUrl?: string): Promise<WebSocketStatus> {
		return this.strategy.connectWebSocket(wsUrl);
	}

	disconnectWebSocket(): Promise<void> {
		return this.strategy.disconnectWebSocket();
	}

	sendWebSocketMessage(data: any): Promise<void> {
		return this.strategy.sendWebSocketMessage(data);
	}

	getWebSocketStatus(): Promise<WebSocketStatus> {
		return this.strategy.getWebSocketStatus();
	}

	onWebSocketMessage(callback: (message: any) => void): () => void {
		return this.strategy.onWebSocketMessage(callback);
	}

	onWebSocketStatus(callback: (status: any) => void): () => void {
		return this.strategy.onWebSocketStatus(callback);
	}
}

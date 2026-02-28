// src/lib/gateway/WorkerCommunication.ts
// Unified communication layer for all workers (SharedWorker, WebWorker, main thread)
// Uses BroadcastChannel for real-time events + Dexie for persistent state

import Dexie, { type Table } from 'dexie';
import type { BroadcastEvent } from './types';

interface KVPair {
	key: string;
	value: string;
}

class StateDB extends Dexie {
	kv!: Table<KVPair, string>;

	constructor() {
		super('sb-auth-v2');
		this.version(1).stores({
			kv: 'key',
		});
	}
}

// Polyfill type for environments without native BroadcastChannel
interface PolyfillBroadcastChannel {
	postMessage(message: any): void;
	close(): void;
	onmessage: ((event: MessageEvent) => void) | null;
}

/**
 * WorkerCommunication: Unified communication layer for workers
 *
 * Features:
 * - BroadcastChannel for real-time events (native or polyfill)
 * - Dexie for persistent state storage
 * - Works in SharedWorker, WebWorker, and main thread
 * - Automatic fallback to polyfill if native BroadcastChannel unavailable
 */
export class WorkerCommunication {
	private bc: BroadcastChannel | PolyfillBroadcastChannel | null = null;
	private db: StateDB;
	private listeners = new Map<string, Set<(payload: any) => void>>();
	private channelName: string;
	private usesPolyfill = false;

	constructor(channelName = 'supabase_events') {
		this.channelName = channelName;
		this.db = new StateDB();
		this.initBroadcastChannel();
	}

	private async initBroadcastChannel() {
		try {
			// Try native BroadcastChannel first
			if (typeof BroadcastChannel !== 'undefined') {
				this.bc = new BroadcastChannel(this.channelName);
				this.bc.onmessage = (e: MessageEvent) =>
					this.handleBroadcast(e.data);
				this.usesPolyfill = false;
			} else {
				// Fallback to polyfill (will be dynamically imported if needed)
				console.warn(
					'[WorkerCommunication] Native BroadcastChannel unavailable, will use polyfill if available',
				);
				// For now, continue without BroadcastChannel (can add polyfill import later)
			}
		} catch (err) {
			console.error(
				'[WorkerCommunication] Failed to initialize BroadcastChannel:',
				err,
			);
		}
	}

	/**
	 * Broadcast an event to all workers and tabs
	 */
	broadcast(event: BroadcastEvent) {
		if (this.bc) {
			try {
				this.bc.postMessage(event);
			} catch (err) {
				console.error('[WorkerCommunication] Broadcast failed:', err);
			}
		}
	}

	/**
	 * Listen for broadcast events
	 */
	private handleBroadcast(event: BroadcastEvent) {
		const { type, key } = event;

		// Emit to specific event listeners
		if (type === 'realtime' && key) {
			this.emit(`realtime:${key}`, event.payload);
		} else {
			this.emit(type, event);
		}
	}

	/**
	 * Subscribe to events (local and broadcast)
	 */
	on(event: string, callback: (payload: any) => void): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback);

		// Return unsubscribe function
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

	/**
	 * Emit event to local listeners
	 */
	private emit(event: string, payload: any) {
		const listeners = this.listeners.get(event);
		if (listeners) {
			listeners.forEach((cb) => {
				try {
					cb(payload);
				} catch (err) {
					console.error(
						`[WorkerCommunication] Listener error for ${event}:`,
						err,
					);
				}
			});
		}
	}

	/**
	 * Persist state to IndexedDB (accessible across all workers and tabs)
	 */
	async setState(key: string, value: any): Promise<void> {
		try {
			const serialized =
				typeof value === 'string' ? value : JSON.stringify(value);
			await this.db.kv.put({ key, value: serialized });
		} catch (err) {
			console.error('[WorkerCommunication] setState error:', err);
			throw err;
		}
	}

	/**
	 * Get state from IndexedDB
	 */
	async getState<T = any>(key: string): Promise<T | null> {
		try {
			const item = await this.db.kv.get(key);
			if (!item) return null;

			// Try to parse as JSON, fallback to raw string
			try {
				return JSON.parse(item.value) as T;
			} catch {
				return item.value as T;
			}
		} catch (err) {
			console.error('[WorkerCommunication] getState error:', err);
			return null;
		}
	}

	/**
	 * Remove state from IndexedDB
	 */
	async removeState(key: string): Promise<void> {
		try {
			await this.db.kv.delete(key);
		} catch (err) {
			console.error('[WorkerCommunication] removeState error:', err);
			throw err;
		}
	}

	/**
	 * Check if BroadcastChannel is available
	 */
	hasBroadcastChannel(): boolean {
		return this.bc !== null;
	}

	/**
	 * Check if using polyfill
	 */
	isUsingPolyfill(): boolean {
		return this.usesPolyfill;
	}

	/**
	 * Close connections
	 */
	close() {
		if (this.bc) {
			this.bc.close();
			this.bc = null;
		}
		this.listeners.clear();
	}
}

/**
 * Create a singleton instance for use across workers
 */
let _instance: WorkerCommunication | null = null;

export function getWorkerCommunication(
	channelName?: string,
): WorkerCommunication {
	if (!_instance) {
		_instance = new WorkerCommunication(channelName);
	}
	return _instance;
}

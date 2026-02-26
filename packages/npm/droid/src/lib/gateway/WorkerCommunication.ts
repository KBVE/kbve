// Unified communication layer for all workers (SharedWorker, WebWorker, main thread)
// Uses BroadcastChannel for real-time events + Dexie for persistent state

import Dexie, { type Table } from 'dexie';
import type { BroadcastEvent } from './types';

interface KVPair {
	key: string;
	value: string;
}

class StateDB extends Dexie {
	kv!: Table<KVPair>;

	constructor() {
		super('sb-auth-v2');
		this.version(1).stores({
			kv: 'key',
		});
	}
}

/**
 * WorkerCommunication: Unified communication layer for workers
 *
 * Features:
 * - BroadcastChannel for real-time events
 * - Dexie for persistent state storage
 * - Works in SharedWorker, WebWorker, and main thread
 */
export class WorkerCommunication {
	private bc: BroadcastChannel | null = null;
	private db: StateDB;
	private listeners = new Map<string, Set<(payload: unknown) => void>>();
	private channelName: string;

	constructor(channelName = 'supabase_events') {
		this.channelName = channelName;
		this.db = new StateDB();
		this.initBroadcastChannel();
	}

	private initBroadcastChannel() {
		try {
			if (typeof BroadcastChannel !== 'undefined') {
				this.bc = new BroadcastChannel(this.channelName);
				this.bc.onmessage = (e: MessageEvent) =>
					this.handleBroadcast(e.data);
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

	private handleBroadcast(event: BroadcastEvent) {
		const { type, key } = event;

		if (type === 'realtime' && key) {
			this.emit(`realtime:${key}`, event.payload);
		} else {
			this.emit(type, event);
		}
	}

	/**
	 * Subscribe to events (local and broadcast)
	 */
	on(event: string, callback: (payload: unknown) => void): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)?.add(callback);

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

	private emit(event: string, payload: unknown) {
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
	async setState(key: string, value: unknown): Promise<void> {
		const serialized =
			typeof value === 'string' ? value : JSON.stringify(value);
		await this.db.kv.put({ key, value: serialized });
	}

	/**
	 * Get state from IndexedDB
	 */
	async getState<T = unknown>(key: string): Promise<T | null> {
		const item = await this.db.kv.get(key);
		if (!item) return null;

		try {
			return JSON.parse(item.value) as T;
		} catch {
			return item.value as T;
		}
	}

	/**
	 * Remove state from IndexedDB
	 */
	async removeState(key: string): Promise<void> {
		await this.db.kv.delete(key);
	}

	/**
	 * Check if BroadcastChannel is available
	 */
	hasBroadcastChannel(): boolean {
		return this.bc !== null;
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

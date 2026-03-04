// Minimal worker communication helper (replaces deleted gateway/WorkerCommunication)
// Provides BroadcastChannel for cross-worker messaging and simple in-memory storage

const CHANNEL_NAME = 'supabase-worker-pool';

interface WorkerComm {
	broadcast(msg: unknown): void;
	getState<T = unknown>(key: string): T | null;
	setState(key: string, value: unknown): void;
	removeState(key: string): void;
}

const store = new Map<string, unknown>();

export function getWorkerCommunication(): WorkerComm {
	let channel: BroadcastChannel | null = null;
	try {
		channel = new BroadcastChannel(CHANNEL_NAME);
	} catch {
		// BroadcastChannel not available in some contexts
	}

	return {
		broadcast(msg: unknown) {
			try {
				channel?.postMessage(msg);
			} catch (e) {
				console.warn('[WorkerComm] broadcast failed:', e);
			}
		},
		getState<T = unknown>(key: string): T | null {
			return (store.get(key) as T) ?? null;
		},
		setState(key: string, value: unknown) {
			store.set(key, value);
		},
		removeState(key: string) {
			store.delete(key);
		},
	};
}

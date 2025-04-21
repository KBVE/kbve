import { atom, map, task, keepMount, type WritableAtom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type { DiscordServer, PanelState } from 'src/env';
import type { PanelPayload, PanelId, PanelSlot } from 'src/env';

// Helper: Sync values from SharedWorker topic to a nanostore
export function syncFromWorker<T>(
	topic: string,
	key: string,
	store: WritableAtom<T> | ReturnType<typeof map>,
	transform?: (data: any) => T | undefined
) {
	if (typeof window !== 'undefined') {
		window.addEventListener('message', handleMessage);
	}``

	function handleMessage(event: MessageEvent) {
		const { topic: msgTopic, key: msgKey, result } = event.data || {};
		if (msgTopic !== topic || msgKey !== key) return;

		if (transform) {
			const transformed = transform(result);
			if (transformed != null && hasSet(store)) {
				store.set(transformed);
			}
			return;
		}

		if (isMapStore(store) && isObject(result)) {
			for (const [k, v] of Object.entries(result)) {
				store.setKey(k, v);
			}
		} else if (hasSet(store)) {
			store.set(result);
		}
	}

	function isMapStore(store: unknown): store is { setKey: (key: string, value: any) => void } {
		return typeof (store as any)?.setKey === 'function';
	}

	function hasSet(store: unknown): store is { set: (value: any) => void } {
		return typeof (store as any)?.set === 'function';
	}

	function isObject(value: unknown): value is Record<string, any> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}
}

// Run and keep mounted (deferred/async safe)
export async function tasker<T>(store: WritableAtom<T>, value: T) {
	task(() => {
		store.set(value);
		keepMount(store);
	});
}

// JSON-persistent atom
export function createJsonAtom<T>(key: string, initial: T) {
	return persistentAtom<T>(key, initial, {
		encode: JSON.stringify,
		decode: JSON.parse,
	});
}

// Binary-safe fallback atom (for simple values or future binary encoding)
export function createBinaryAtom<T>(key: string, initial: T) {
	return persistentAtom<T>(key, initial, {
		encode: (value) => String(value),
		decode: (value) => value as unknown as T,
	});
}

// Servers map store (by server_id)
export const $servers = map<Record<string, DiscordServer>>({});

export function updateServer(server: DiscordServer) {
	$servers.setKey(server.server_id, server);
}

export function updateServers(servers: DiscordServer[]) {
	for (const server of servers) {
		$servers.setKey(server.server_id, server);
	}
}

// Optional: bridge panel state from Alpine (read-only in Svelte)
export const $panelBridge = atom<PanelState | null>(null);

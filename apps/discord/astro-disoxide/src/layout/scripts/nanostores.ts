import { atom, map, task, keepMount, type WritableAtom } from 'nanostores';
import { persistentAtom, persistentMap } from '@nanostores/persistent';
import type { DiscordServer, PanelState } from 'src/env';

// Helper Functions:
export async function tasker<T>(store: WritableAtom<T>, value: T) {
	task(() => {
		store.set(value);
		keepMount(store);
	});
}

/**
 * Persistent JSON-encoded atom
 */
export function createJsonAtom<T>(key: string, initial: T) {
	return persistentAtom<T>(key, initial, {
		encode: JSON.stringify,
		decode: JSON.parse,
	});
}

/**
 * Persistent plain/binary-safe atom (string fallback)
 * Useful for primitives, short blobs, or future binary formats like Flexbuffers
 */
export function createBinaryAtom<T>(key: string, initial: T) {
	return persistentAtom<T>(key, initial, {
		encode: (value) => String(value),
		decode: (value) => value as unknown as T,
	});
}

// Panel state (open/close with payload)
export const $panel = atom<PanelState>({ open: false, id: '' });

export function openPanel(id: string, payload?: Record<string, any>) {
	$panel.set({ open: true, id, payload });
}

export function closePanel() {
	$panel.set({ open: false, id: '' });
}

export function togglePanel(id: string, payload?: Record<string, any>) {
	const current = $panel.get();
	const isSame = current.id === id;
	const isOpen = isSame ? !current.open : true;
	$panel.set({ open: isOpen, id, payload });
}

// Servers map by server_id
export const $servers = map<Record<string, DiscordServer>>({});

export function updateServer(server: DiscordServer) {
	$servers.setKey(server.server_id, server);
}

export function updateServers(servers: DiscordServer[]) {
	for (const server of servers) {
		$servers.setKey(server.server_id, server);
	}
}

export function syncFromWorker<T>(
	topic: string,
	key: string,
	store: WritableAtom<T> | ReturnType<typeof map>,
	transform?: (data: any) => T | undefined,
) {
	if (typeof SharedWorkerGlobalScope === 'undefined' && typeof window !== 'undefined') {
		window.addEventListener('message', onMessage);
	}

	function onMessage(event: MessageEvent) {
		const { topic: msgTopic, key: msgKey, result } = event.data || {};
		if (msgTopic === topic && msgKey === key) {
			if (transform) {
				const transformed = transform(result);
				if (transformed !== undefined && transformed !== null && 'set' in store) {
					store.set(transformed);
				}
			} else if (Array.isArray(result)) {
			} else if (isMapStore(store)) {
				for (const [k, v] of Object.entries(result ?? {})) {
					store.setKey(k as any, v as any);
				}
			} else if ('set' in store && typeof store.set === 'function') {
				store.set(result);
			}
		}
	}

	function isMapStore(store: any): store is { setKey: (k: string, v: any) => void } {
		return typeof store?.setKey === 'function';
	}
}


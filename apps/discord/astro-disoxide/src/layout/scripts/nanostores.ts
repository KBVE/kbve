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

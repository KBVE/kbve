import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ClientVersion, Installed, Progress, Session } from './types';

export const launcherApi = {
	currentPlatform: () => invoke<string>('current_platform'),
	fetchClients: (backendUrl?: string) =>
		invoke<ClientVersion[]>('fetch_clients', { backendUrl }),
	installState: () => invoke<Installed | null>('install_state'),
	installUpdate: (backendUrl?: string) =>
		invoke<Installed>('install_update', { backendUrl }),
	launch: (session?: Session, url?: string) =>
		invoke<void>('launch', { url, session }),
	onProgress: (cb: (p: Progress) => void): Promise<UnlistenFn> =>
		listen<Progress>('install://progress', (e) => cb(e.payload)),
	onGameExited: (cb: () => void): Promise<UnlistenFn> =>
		listen('game://exited', () => cb()),
};

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Session } from './auth';

export type ClientVersion = {
	platform: string;
	upload_id: number;
	channel: string | null;
	user_version: string | null;
	build_id: number | null;
	state: string | null;
	live: boolean;
	updated_at: string | null;
};

export type Installed = {
	platform: string;
	build_id: number | null;
	user_version: string | null;
	entrypoint: string | null;
	install_dir: string;
};

export type Progress = { received: number; total: number };

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
};

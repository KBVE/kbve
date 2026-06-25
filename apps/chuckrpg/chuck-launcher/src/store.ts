import { create } from 'zustand';
import {
	launcherApi,
	type ClientVersion,
	type Installed,
	type Progress,
} from './lib/tauri';

type Phase = 'idle' | 'loading' | 'installing' | 'error';

type LauncherState = {
	platform: string;
	clients: ClientVersion[];
	installed: Installed | null;
	phase: Phase;
	progress: Progress | null;
	error: string | null;
	refresh: () => Promise<void>;
	installOrUpdate: () => Promise<void>;
	play: () => Promise<void>;
	latest: () => ClientVersion | undefined;
	needsUpdate: () => boolean;
};

export const useLauncher = create<LauncherState>((set, get) => ({
	platform: '',
	clients: [],
	installed: null,
	phase: 'loading',
	progress: null,
	error: null,

	latest: () => get().clients.find((c) => c.platform === get().platform),
	needsUpdate: () => {
		const { installed } = get();
		const latest = get().latest();
		if (!installed) return false;
		return !!latest && installed.build_id !== latest.build_id;
	},

	refresh: async () => {
		set({ phase: 'loading', error: null });
		try {
			const platform = await launcherApi.currentPlatform();
			const [clients, installed] = await Promise.all([
				launcherApi.fetchClients(),
				launcherApi.installState(),
			]);
			set({ platform, clients, installed, phase: 'idle' });
		} catch (e) {
			set({ phase: 'error', error: String(e) });
		}
	},

	installOrUpdate: async () => {
		set({ phase: 'installing', progress: null, error: null });
		const unlisten = await launcherApi.onProgress((p) =>
			set({ progress: p }),
		);
		try {
			const installed = await launcherApi.installUpdate();
			set({ installed, phase: 'idle', progress: null });
		} catch (e) {
			set({ phase: 'error', error: String(e) });
		} finally {
			unlisten();
		}
	},

	play: async () => {
		try {
			await launcherApi.launch();
		} catch (e) {
			set({ phase: 'error', error: String(e) });
		}
	},
}));

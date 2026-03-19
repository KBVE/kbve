import { create } from 'zustand';
import { viewUpdateConfig } from '../engine/bridge';

export type Theme = 'dark' | 'light' | 'system';

interface SettingsState {
	theme: Theme;
	launchAtLogin: boolean;
	startMinimized: boolean;
	language: string;
	setTheme: (theme: Theme) => void;
	setLaunchAtLogin: (v: boolean) => void;
	setStartMinimized: (v: boolean) => void;
	setLanguage: (lang: string) => void;
}

// Sync a partial config update to the backend actor.
// Fire-and-forget — the actor emits a config ack event back.
function syncToBackend(partial: Record<string, unknown>) {
	viewUpdateConfig('general', partial).catch(() => {
		// Backend not ready yet (dev mode without Tauri) — silently ignore
	});
}

export const useSettingsStore = create<SettingsState>()((set) => ({
	theme: 'dark',
	launchAtLogin: false,
	startMinimized: false,
	language: 'en',
	setTheme: (theme) => {
		set({ theme });
		syncToBackend({ theme });
	},
	setLaunchAtLogin: (launchAtLogin) => {
		set({ launchAtLogin });
		syncToBackend({ launch_at_login: launchAtLogin });
	},
	setStartMinimized: (startMinimized) => {
		set({ startMinimized });
		syncToBackend({ start_minimized: startMinimized });
	},
	setLanguage: (language) => {
		set({ language });
		syncToBackend({ language });
	},
}));

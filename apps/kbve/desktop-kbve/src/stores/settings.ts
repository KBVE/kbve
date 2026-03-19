import { create } from 'zustand';

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

export const useSettingsStore = create<SettingsState>()((set) => ({
	theme: 'dark',
	launchAtLogin: false,
	startMinimized: false,
	language: 'en',
	setTheme: (theme) => set({ theme }),
	setLaunchAtLogin: (launchAtLogin) => set({ launchAtLogin }),
	setStartMinimized: (startMinimized) => set({ startMinimized }),
	setLanguage: (language) => set({ language }),
}));

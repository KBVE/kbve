import { create } from 'zustand';

interface AppState {
	activeView: string;
	sidebarOpen: boolean;
	setActiveView: (id: string) => void;
	toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
	activeView: 'general',
	sidebarOpen: true,
	setActiveView: (id) => set({ activeView: id }),
	toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));

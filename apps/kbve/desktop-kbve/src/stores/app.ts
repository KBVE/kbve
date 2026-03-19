import { create } from 'zustand';

interface AppState {
	activeView: string;
	sidebarOpen: boolean;
	// View stack — overlays/modals that layer on top of activeView
	viewStack: string[];
	setActiveView: (id: string) => void;
	toggleSidebar: () => void;
	// Push a view onto the stack (overlay/modal)
	pushView: (id: string) => void;
	// Pop the top view off the stack
	popView: () => void;
	// Clear entire stack (return to base view)
	clearStack: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
	activeView: 'general',
	sidebarOpen: true,
	viewStack: [],
	setActiveView: (id) => set({ activeView: id, viewStack: [] }),
	toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
	pushView: (id) =>
		set((s) => ({
			viewStack: s.viewStack.includes(id)
				? s.viewStack
				: [...s.viewStack, id],
		})),
	popView: () => set((s) => ({ viewStack: s.viewStack.slice(0, -1) })),
	clearStack: () => set({ viewStack: [] }),
}));

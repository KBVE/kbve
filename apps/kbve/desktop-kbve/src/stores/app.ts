import { create } from 'zustand';

export interface CardState {
	viewId: string;
	minimized: boolean;
}

interface AppState {
	activeView: string;
	sidebarOpen: boolean;
	// Card stack — overlays that layer on top of activeView
	cardStack: CardState[];
	setActiveView: (id: string) => void;
	toggleSidebar: () => void;
	// Push a card onto the stack
	pushCard: (viewId: string) => void;
	// Remove a specific card by viewId
	dismissCard: (viewId: string) => void;
	// Pop the topmost card
	popCard: () => void;
	// Minimize a card (collapse to tray)
	minimizeCard: (viewId: string) => void;
	// Restore a minimized card
	restoreCard: (viewId: string) => void;
	// Bring a card to the front of the stack
	focusCard: (viewId: string) => void;
	// Clear entire stack
	clearCards: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
	activeView: 'general',
	sidebarOpen: true,
	cardStack: [],
	setActiveView: (id) => set({ activeView: id, cardStack: [] }),
	toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
	pushCard: (viewId) =>
		set((s) => {
			if (s.cardStack.some((c) => c.viewId === viewId)) {
				// Already in stack — just restore + focus it
				return {
					cardStack: [
						...s.cardStack.filter((c) => c.viewId !== viewId),
						{ viewId, minimized: false },
					],
				};
			}
			return {
				cardStack: [...s.cardStack, { viewId, minimized: false }],
			};
		}),
	dismissCard: (viewId) =>
		set((s) => ({
			cardStack: s.cardStack.filter((c) => c.viewId !== viewId),
		})),
	popCard: () => set((s) => ({ cardStack: s.cardStack.slice(0, -1) })),
	minimizeCard: (viewId) =>
		set((s) => ({
			cardStack: s.cardStack.map((c) =>
				c.viewId === viewId ? { ...c, minimized: true } : c,
			),
		})),
	restoreCard: (viewId) =>
		set((s) => ({
			cardStack: [
				...s.cardStack.filter((c) => c.viewId !== viewId),
				{ viewId, minimized: false },
			],
		})),
	focusCard: (viewId) =>
		set((s) => {
			const card = s.cardStack.find((c) => c.viewId === viewId);
			if (!card) return s;
			return {
				cardStack: [
					...s.cardStack.filter((c) => c.viewId !== viewId),
					{ ...card, minimized: false },
				],
			};
		}),
	clearCards: () => set({ cardStack: [] }),
}));

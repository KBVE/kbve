import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './app';

describe('App Store', () => {
	beforeEach(() => {
		// Reset store to defaults before each test
		useAppStore.setState({
			activeView: 'general',
			sidebarOpen: true,
			cardStack: [],
		});
	});

	it('has correct initial state', () => {
		const state = useAppStore.getState();
		expect(state.activeView).toBe('general');
		expect(state.sidebarOpen).toBe(true);
		expect(state.cardStack).toEqual([]);
	});

	it('sets active view and clears card stack', () => {
		useAppStore.getState().pushCard('audio');
		useAppStore.getState().setActiveView('models');
		const state = useAppStore.getState();
		expect(state.activeView).toBe('models');
		expect(state.cardStack).toEqual([]);
	});

	it('toggles sidebar', () => {
		useAppStore.getState().toggleSidebar();
		expect(useAppStore.getState().sidebarOpen).toBe(false);
		useAppStore.getState().toggleSidebar();
		expect(useAppStore.getState().sidebarOpen).toBe(true);
	});

	describe('Card Stack', () => {
		it('pushes a card', () => {
			useAppStore.getState().pushCard('audio');
			const cards = useAppStore.getState().cardStack;
			expect(cards).toHaveLength(1);
			expect(cards[0]).toEqual({ viewId: 'audio', minimized: false });
		});

		it('does not duplicate cards — focuses instead', () => {
			useAppStore.getState().pushCard('audio');
			useAppStore.getState().pushCard('models');
			useAppStore.getState().pushCard('audio');
			const cards = useAppStore.getState().cardStack;
			expect(cards).toHaveLength(2);
			// audio should be at the end (focused)
			expect(cards[1].viewId).toBe('audio');
		});

		it('dismisses a specific card', () => {
			useAppStore.getState().pushCard('audio');
			useAppStore.getState().pushCard('models');
			useAppStore.getState().dismissCard('audio');
			const cards = useAppStore.getState().cardStack;
			expect(cards).toHaveLength(1);
			expect(cards[0].viewId).toBe('models');
		});

		it('pops the topmost card', () => {
			useAppStore.getState().pushCard('audio');
			useAppStore.getState().pushCard('models');
			useAppStore.getState().popCard();
			const cards = useAppStore.getState().cardStack;
			expect(cards).toHaveLength(1);
			expect(cards[0].viewId).toBe('audio');
		});

		it('minimizes a card', () => {
			useAppStore.getState().pushCard('audio');
			useAppStore.getState().minimizeCard('audio');
			const card = useAppStore.getState().cardStack[0];
			expect(card.minimized).toBe(true);
		});

		it('restores a minimized card to the front', () => {
			useAppStore.getState().pushCard('audio');
			useAppStore.getState().pushCard('models');
			useAppStore.getState().minimizeCard('audio');
			useAppStore.getState().restoreCard('audio');
			const cards = useAppStore.getState().cardStack;
			// audio should be at the end (restored to front)
			expect(cards[cards.length - 1].viewId).toBe('audio');
			expect(cards[cards.length - 1].minimized).toBe(false);
		});

		it('focuses a card by moving it to the end', () => {
			useAppStore.getState().pushCard('audio');
			useAppStore.getState().pushCard('models');
			useAppStore.getState().pushCard('shortcuts');
			useAppStore.getState().focusCard('audio');
			const cards = useAppStore.getState().cardStack;
			expect(cards[cards.length - 1].viewId).toBe('audio');
		});

		it('clears all cards', () => {
			useAppStore.getState().pushCard('audio');
			useAppStore.getState().pushCard('models');
			useAppStore.getState().clearCards();
			expect(useAppStore.getState().cardStack).toEqual([]);
		});

		it('pop on empty stack is safe', () => {
			useAppStore.getState().popCard();
			expect(useAppStore.getState().cardStack).toEqual([]);
		});

		it('dismiss nonexistent card is safe', () => {
			useAppStore.getState().pushCard('audio');
			useAppStore.getState().dismissCard('nonexistent');
			expect(useAppStore.getState().cardStack).toHaveLength(1);
		});

		it('focus nonexistent card is no-op', () => {
			useAppStore.getState().pushCard('audio');
			useAppStore.getState().focusCard('nonexistent');
			expect(useAppStore.getState().cardStack).toHaveLength(1);
		});
	});
});

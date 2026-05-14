import { describe, expect, it } from 'vitest';

import { encodeCard } from '../cards';
import { createBlackjackState } from '../state';
import { StrategyAdvisor } from './strategyAdvisor';

describe('blackjack strategy advisor', () => {
	it('returns no hint outside the player turn', () => {
		const state = createBlackjackState();
		state.phase = 'betting';
		state.player = [encodeCard('spades', '10'), encodeCard('clubs', '6')];
		state.dealer = [encodeCard('hearts', '6')];

		expect(new StrategyAdvisor().getHint(state)).toBe('');
	});

	it('reuses cached hard hand hints until the hand changes', () => {
		const advisor = new StrategyAdvisor();
		const state = createBlackjackState();
		state.phase = 'player-turn';
		state.canDouble = true;
		state.player = [encodeCard('spades', '5'), encodeCard('clubs', '5')];
		state.dealer = [encodeCard('hearts', '9')];

		expect(advisor.getHint(state)).toBe('Hint: Double');
		expect(advisor.getHint(state)).toBe('Hint: Double');

		state.player = [
			encodeCard('spades', '5'),
			encodeCard('clubs', '5'),
			encodeCard('diamonds', '8'),
		];
		state.canDouble = false;

		expect(advisor.getHint(state)).toBe('Hint: Stand');
	});

	it('refreshes cached hints when the dealer up card changes', () => {
		const advisor = new StrategyAdvisor();
		const state = createBlackjackState();
		state.phase = 'player-turn';
		state.canDouble = false;
		state.player = [encodeCard('spades', '10'), encodeCard('clubs', '2')];
		state.dealer = [encodeCard('hearts', '6')];

		expect(advisor.getHint(state)).toBe('Hint: Stand');

		state.dealer = [encodeCard('hearts', '10')];

		expect(advisor.getHint(state)).toBe('Hint: Hit');
	});

	it('refreshes cached soft hand hints when doubling becomes unavailable', () => {
		const advisor = new StrategyAdvisor();
		const state = createBlackjackState();
		state.phase = 'player-turn';
		state.canDouble = true;
		state.player = [encodeCard('spades', 'A'), encodeCard('clubs', '7')];
		state.dealer = [encodeCard('hearts', '3')];

		expect(advisor.getHint(state)).toBe('Hint: Double');

		state.canDouble = false;

		expect(advisor.getHint(state)).toBe('Hint: Hit');
	});
});

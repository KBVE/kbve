import { describe, expect, it } from 'vitest';

import { encodeCard, type Card } from '../cards';
import { createBlackjackState, type BlackjackState } from '../state';
import { StrategyAdvisor } from './strategyAdvisor';

function playerTurnState(
	player: readonly Card[],
	dealerUp: Card,
	canDouble: boolean,
): BlackjackState {
	const state = createBlackjackState();
	state.phase = 'player-turn';
	state.canDouble = canDouble;
	state.player = [...player];
	state.dealer = [dealerUp];
	return state;
}

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

	it('covers hard total stand and hit boundaries', () => {
		const advisor = new StrategyAdvisor();

		expect(
			advisor.getHint(
				playerTurnState(
					[encodeCard('spades', '10'), encodeCard('clubs', '7')],
					encodeCard('hearts', 'A'),
					false,
				),
			),
		).toBe('Hint: Stand');
		expect(
			advisor.getHint(
				playerTurnState(
					[encodeCard('spades', '7'), encodeCard('clubs', '5')],
					encodeCard('hearts', '4'),
					false,
				),
			),
		).toBe('Hint: Stand');
		expect(
			advisor.getHint(
				playerTurnState(
					[encodeCard('spades', '7'), encodeCard('clubs', '5')],
					encodeCard('hearts', '3'),
					false,
				),
			),
		).toBe('Hint: Hit');
	});

	it('covers hard double down boundaries', () => {
		const advisor = new StrategyAdvisor();

		expect(
			advisor.getHint(
				playerTurnState(
					[encodeCard('spades', '5'), encodeCard('clubs', '4')],
					encodeCard('hearts', '3'),
					true,
				),
			),
		).toBe('Hint: Double');
		expect(
			advisor.getHint(
				playerTurnState(
					[encodeCard('spades', '5'), encodeCard('clubs', '4')],
					encodeCard('hearts', '2'),
					true,
				),
			),
		).toBe('Hint: Hit');
	});

	it('covers soft total stand, hit, and double boundaries', () => {
		const advisor = new StrategyAdvisor();

		expect(
			advisor.getHint(
				playerTurnState(
					[encodeCard('spades', 'A'), encodeCard('clubs', '8')],
					encodeCard('hearts', '10'),
					false,
				),
			),
		).toBe('Hint: Stand');
		expect(
			advisor.getHint(
				playerTurnState(
					[encodeCard('spades', 'A'), encodeCard('clubs', '7')],
					encodeCard('hearts', '7'),
					false,
				),
			),
		).toBe('Hint: Stand');
		expect(
			advisor.getHint(
				playerTurnState(
					[encodeCard('spades', 'A'), encodeCard('clubs', '4')],
					encodeCard('hearts', '4'),
					true,
				),
			),
		).toBe('Hint: Double');
		expect(
			advisor.getHint(
				playerTurnState(
					[encodeCard('spades', 'A'), encodeCard('clubs', '2')],
					encodeCard('hearts', '5'),
					true,
				),
			),
		).toBe('Hint: Double');
	});
});

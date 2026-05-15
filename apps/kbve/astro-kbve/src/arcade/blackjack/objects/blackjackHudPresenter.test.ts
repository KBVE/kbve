import { describe, expect, it } from 'vitest';

import { encodeCard } from '../cards';
import { COLORS } from '../config';
import { createBlackjackState } from '../state';
import { BlackjackHudPresenter } from './blackjackHudPresenter';

describe('blackjack HUD presenter', () => {
	it('formats stable HUD labels from state', () => {
		const state = createBlackjackState();
		state.bankroll = 975;
		state.bet = 25;
		state.lastDelta = -25;
		state.rounds = 3;
		state.shoe = [encodeCard('spades', 'A'), encodeCard('clubs', 'K')];
		state.stats.wins = 2;
		state.stats.losses = 1;
		state.stats.pushes = 1;
		state.stats.blackjacks = 1;
		state.stats.bestBankroll = 1050;

		const values = new BlackjackHudPresenter().values(state, false);

		expect(values.bankroll).toBe('Bankroll $975\nBet $25  (-$25)');
		expect(values.shoe).toBe('Shoe 2 cards\nRound 3');
		expect(values.stats).toBe('Session  W 2  L 1  P 1\nBJ 1  Best $1050');
	});

	it('reuses cached scalar labels until their inputs change', () => {
		const presenter = new BlackjackHudPresenter();
		const state = createBlackjackState();

		const first = presenter.values(state, false);
		const second = presenter.values(state, false);

		expect(second).toBe(first);
		expect(second.bankroll).toBe(first.bankroll);
		expect(second.shoe).toBe(first.shoe);
		expect(second.stats).toBe(first.stats);

		state.bet += 25;
		const third = presenter.values(state, false);

		expect(third.bankroll).not.toBe(first.bankroll);
		expect(third.shoe).toBe(first.shoe);
		expect(third.stats).toBe(first.stats);
	});

	it('refreshes cached HUD values when visible hand state changes', () => {
		const presenter = new BlackjackHudPresenter();
		const state = createBlackjackState();

		const first = presenter.values(state, false);
		state.player = [encodeCard('spades', 'A'), encodeCard('clubs', 'K')];
		const second = presenter.values(state, false);

		expect(second).not.toBe(first);
		expect(second.playerValue).toBe('Player  21 soft blackjack');
	});

	it('formats hand labels and status colors for visible state', () => {
		const presenter = new BlackjackHudPresenter();
		const state = createBlackjackState();
		state.phase = 'player-turn';
		state.player = [encodeCard('spades', 'A'), encodeCard('clubs', 'K')];
		state.dealer = [encodeCard('hearts', '9'), encodeCard('clubs', 'K')];
		state.outcome = 'win';

		const hidden = presenter.values(state, true);
		const visible = presenter.values(state, false);

		expect(hidden.dealerValue).toBe('Dealer  9');
		expect(visible.dealerValue).toBe('Dealer  19');
		expect(visible.playerValue).toBe('Player  21 soft blackjack');
		expect(visible.statusColor).toBe(COLORS.gold);
	});
});

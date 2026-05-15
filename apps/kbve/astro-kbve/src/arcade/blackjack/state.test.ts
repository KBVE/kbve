import { describe, expect, it } from 'vitest';

import { encodeCard, type Card } from './cards';
import { GAME } from './config';
import {
	clampBet,
	createBlackjackState,
	doubleDown,
	draw,
	hit,
	resetToBetting,
	stand,
	startRound,
	type BlackjackState,
} from './state';

const ace = encodeCard('spades', 'A');
const two = encodeCard('clubs', '2');
const three = encodeCard('diamonds', '3');
const five = encodeCard('spades', '5');
const six = encodeCard('hearts', '6');
const seven = encodeCard('clubs', '7');
const eight = encodeCard('diamonds', '8');
const nine = encodeCard('hearts', '9');
const ten = encodeCard('spades', '10');
const queen = encodeCard('diamonds', 'Q');
const king = encodeCard('hearts', 'K');

function makeState(overrides: Partial<BlackjackState> = {}): BlackjackState {
	const stats = {
		hands: 0,
		wins: 0,
		losses: 0,
		pushes: 0,
		blackjacks: 0,
		bestBankroll: GAME.startingBankroll,
		...overrides.stats,
	};

	return {
		phase: 'betting',
		shoe: [],
		player: [],
		dealer: [],
		bankroll: GAME.startingBankroll,
		bet: GAME.defaultBet,
		message: 'Place your bet.',
		rounds: 0,
		lastDelta: 0,
		canDouble: false,
		outcome: null,
		...overrides,
		stats,
	};
}

function shoeForDraws(draws: readonly Card[]): Card[] {
	const filler = Array.from({ length: 20 }, () => two);
	return [...filler, ...[...draws].reverse()];
}

describe('blackjack state', () => {
	it('creates an initial table state and clamps bets to table bounds', () => {
		const state = createBlackjackState();

		expect(state.phase).toBe('betting');
		expect(state.shoe).toHaveLength(GAME.decks * 52);
		expect(state.stats.bestBankroll).toBe(GAME.startingBankroll);
		expect(clampBet(1, 1000)).toBe(GAME.minBet);
		expect(clampBet(800, 1000)).toBe(GAME.maxBet);
		expect(clampBet(100, 40)).toBe(40);
		expect(clampBet(100, 0)).toBe(GAME.minBet);
	});

	it('draws from the shoe and refreshes when the shoe is low or empty', () => {
		const state = makeState({
			shoe: shoeForDraws([nine]),
		});

		expect(draw(state)).toBe(nine);

		state.shoe = [];
		expect(draw(state)).toBeTypeOf('number');
		expect(state.shoe.length).toBeGreaterThan(0);

		const sparse = makeState({
			shoe: new Array<Card>(20),
		});
		expect(draw(sparse)).toBeTypeOf('number');
		expect(sparse.shoe.length).toBeGreaterThan(0);
	});

	it('starts normal rounds and closes the table when bankroll is too low', () => {
		const state = makeState({
			shoe: shoeForDraws([ten, seven, nine, six]),
		});

		startRound(state);

		expect(state.phase).toBe('player-turn');
		expect(state.player).toEqual([ten, seven]);
		expect(state.dealer).toEqual([nine, six]);
		expect(state.bankroll).toBe(975);
		expect(state.lastDelta).toBe(-25);
		expect(state.canDouble).toBe(true);

		const closed = makeState({ bankroll: 1 });
		startRound(closed);
		expect(closed.phase).toBe('table-closed');
	});

	it('settles natural blackjack outcomes during the deal', () => {
		const playerBlackjack = makeState({
			shoe: shoeForDraws([ace, king, nine, six]),
		});
		startRound(playerBlackjack);
		expect(playerBlackjack.player).toEqual([ace, king]);
		expect(playerBlackjack.dealer).toEqual([nine, six]);
		expect(playerBlackjack.outcome).toBe('blackjack');
		expect(playerBlackjack.bankroll).toBe(1037);
		expect(playerBlackjack.stats.blackjacks).toBe(1);
		expect(playerBlackjack.stats.wins).toBe(1);

		const dealerBlackjack = makeState({
			shoe: shoeForDraws([nine, six, ace, queen]),
		});
		startRound(dealerBlackjack);
		expect(dealerBlackjack.outcome).toBe('loss');
		expect(dealerBlackjack.message).toBe('Dealer has blackjack.');

		const push = makeState({
			shoe: shoeForDraws([ace, queen, ace, king]),
		});
		startRound(push);
		expect(push.outcome).toBe('push');
		expect(push.bankroll).toBe(1000);
		expect(push.stats.pushes).toBe(1);
	});

	it('handles hit flows for ignored, safe, bust, and twenty-one hands', () => {
		const ignored = makeState({ phase: 'betting', player: [ten, seven] });
		hit(ignored);
		expect(ignored.player).toEqual([ten, seven]);

		const safe = makeState({
			phase: 'player-turn',
			player: [six, three],
			shoe: shoeForDraws([five]),
			canDouble: true,
		});
		hit(safe);
		expect(safe.player).toEqual([six, three, five]);
		expect(safe.message).toBe('Hit or stand.');
		expect(safe.canDouble).toBe(false);

		const bust = makeState({
			phase: 'player-turn',
			player: [king, queen],
			shoe: shoeForDraws([five]),
		});
		hit(bust);
		expect(bust.outcome).toBe('loss');
		expect(bust.message).toBe('Bust. Dealer wins.');

		const twentyOne = makeState({
			phase: 'player-turn',
			player: [ten, five],
			dealer: [nine, seven],
			shoe: shoeForDraws([six, ten]),
		});
		hit(twentyOne);
		expect(twentyOne.outcome).toBe('win');
		expect(twentyOne.message).toBe('Twenty-one wins. Dealer busts.');

		const twentyOneBeatsDealer = makeState({
			phase: 'player-turn',
			player: [ten, five],
			dealer: [ten, nine],
			shoe: shoeForDraws([six]),
		});
		hit(twentyOneBeatsDealer);
		expect(twentyOneBeatsDealer.outcome).toBe('win');
		expect(twentyOneBeatsDealer.message).toBe('Twenty-one wins.');
	});

	it('handles double down guards, busts, and standing settlement', () => {
		const guarded = makeState({
			phase: 'player-turn',
			canDouble: false,
			player: [ten, five],
		});
		doubleDown(guarded);
		expect(guarded.player).toEqual([ten, five]);

		const bust = makeState({
			phase: 'player-turn',
			canDouble: true,
			player: [king, queen],
			shoe: shoeForDraws([five]),
		});
		doubleDown(bust);
		expect(bust.bet).toBe(50);
		expect(bust.outcome).toBe('loss');
		expect(bust.message).toBe('Double bust. Dealer wins.');

		const win = makeState({
			phase: 'player-turn',
			canDouble: true,
			player: [ten, ace],
			dealer: [nine, seven],
			shoe: shoeForDraws([five, king]),
		});
		doubleDown(win);
		expect(win.outcome).toBe('win');
		expect(win.bankroll).toBe(1075);
	});

	it('settles stand outcomes for dealer busts, wins, losses, and pushes', () => {
		const ignored = makeState({ phase: 'betting' });
		stand(ignored);
		expect(ignored.phase).toBe('betting');

		const dealerBust = makeState({
			phase: 'player-turn',
			player: [ten, eight],
			dealer: [nine, seven],
			shoe: shoeForDraws([king]),
		});
		stand(dealerBust);
		expect(dealerBust.outcome).toBe('win');
		expect(dealerBust.message).toBe('Dealer busts.');

		const playerWins = makeState({
			phase: 'player-turn',
			player: [ten, nine],
			dealer: [ten, seven],
		});
		stand(playerWins);
		expect(playerWins.outcome).toBe('win');
		expect(playerWins.message).toBe('Player wins.');

		const dealerWins = makeState({
			phase: 'player-turn',
			player: [ten, six],
			dealer: [ten, eight],
		});
		stand(dealerWins);
		expect(dealerWins.outcome).toBe('loss');

		const push = makeState({
			phase: 'player-turn',
			player: [ten, eight],
			dealer: [queen, eight],
		});
		stand(push);
		expect(push.outcome).toBe('push');
		expect(push.stats.pushes).toBe(1);

		const softSeventeen = makeState({
			phase: 'player-turn',
			player: [ten, eight],
			dealer: [ace, six],
			shoe: shoeForDraws([two]),
		});
		(GAME as { dealerHitsSoft17: boolean }).dealerHitsSoft17 = true;
		try {
			stand(softSeventeen);
		} finally {
			(GAME as { dealerHitsSoft17: boolean }).dealerHitsSoft17 = false;
		}
		expect(softSeventeen.dealer).toEqual([ace, six, two]);
		expect(softSeventeen.outcome).toBe('loss');
	});

	it('resets completed rounds back to betting or closes broke tables', () => {
		const state = makeState({
			phase: 'round-over',
			player: [king, nine],
			dealer: [queen, eight],
			bet: 1000,
			bankroll: 40,
			lastDelta: 25,
			canDouble: true,
			outcome: 'win',
		});

		resetToBetting(state);

		expect(state.phase).toBe('betting');
		expect(state.player).toEqual([]);
		expect(state.dealer).toEqual([]);
		expect(state.bet).toBe(40);
		expect(state.lastDelta).toBe(0);
		expect(state.outcome).toBeNull();

		const closed = makeState({ bankroll: 1 });
		resetToBetting(closed);
		expect(closed.phase).toBe('table-closed');
	});
});

import {
	buildShoe,
	type Card,
	isBlackjack,
	shuffleCardsInPlace,
	valueHand,
} from './cards';
import { GAME } from './config';

export type RoundPhase =
	| 'betting'
	| 'player-turn'
	| 'dealer-turn'
	| 'round-over'
	| 'table-closed';

export type RoundOutcome = 'win' | 'loss' | 'push' | 'blackjack' | null;

export interface BlackjackStats {
	hands: number;
	wins: number;
	losses: number;
	pushes: number;
	blackjacks: number;
	bestBankroll: number;
}

export interface BlackjackState {
	phase: RoundPhase;
	shoe: Card[];
	player: Card[];
	dealer: Card[];
	bankroll: number;
	bet: number;
	message: string;
	rounds: number;
	lastDelta: number;
	canDouble: boolean;
	outcome: RoundOutcome;
	stats: BlackjackStats;
}

export function createBlackjackState(): BlackjackState {
	return {
		phase: 'betting',
		shoe: freshShoe(),
		player: [],
		dealer: [],
		bankroll: GAME.startingBankroll,
		bet: GAME.defaultBet,
		message: 'Place your bet.',
		rounds: 0,
		lastDelta: 0,
		canDouble: false,
		outcome: null,
		stats: {
			hands: 0,
			wins: 0,
			losses: 0,
			pushes: 0,
			blackjacks: 0,
			bestBankroll: GAME.startingBankroll,
		},
	};
}

export function freshShoe(): Card[] {
	return shuffleCardsInPlace(buildShoe(GAME.decks));
}

export function clampBet(value: number, bankroll: number): number {
	const capped = Math.min(GAME.maxBet, Math.max(GAME.minBet, value));
	return Math.min(capped, Math.max(GAME.minBet, bankroll));
}

export function draw(state: BlackjackState): Card {
	if (state.shoe.length < 20) {
		state.shoe = freshShoe();
	}
	const card = state.shoe.pop();
	if (card === undefined) {
		state.shoe = freshShoe();
		return state.shoe.pop() as Card;
	}
	return card;
}

export function startRound(state: BlackjackState): void {
	if (state.bankroll < GAME.minBet) {
		state.phase = 'table-closed';
		state.message = 'Table closed. Start over to buy back in.';
		return;
	}

	state.bet = clampBet(state.bet, state.bankroll);
	state.bankroll -= state.bet;
	state.player = [draw(state), draw(state)];
	state.dealer = [draw(state), draw(state)];
	state.rounds++;
	state.lastDelta = -state.bet;
	state.canDouble = state.bankroll >= state.bet;
	state.outcome = null;

	const playerNatural = isBlackjack(state.player);
	const dealerNatural = isBlackjack(state.dealer);

	if (playerNatural || dealerNatural) {
		if (playerNatural && dealerNatural) {
			settlePush(state, 'Both hands have blackjack. Push.');
		} else if (playerNatural) {
			const win = Math.floor(
				state.bet + state.bet * GAME.blackjackPayout,
			);
			state.bankroll += win;
			state.lastDelta = win - state.bet;
			state.message = `Blackjack pays ${GAME.blackjackPayout}:1.`;
			state.phase = 'round-over';
			recordOutcome(state, 'blackjack');
		} else {
			state.lastDelta = -state.bet;
			state.message = 'Dealer has blackjack.';
			state.phase = 'round-over';
			recordOutcome(state, 'loss');
		}
		state.canDouble = false;
		return;
	}

	state.phase = 'player-turn';
	state.message = 'Hit, stand, or double.';
}

export function hit(state: BlackjackState): void {
	if (state.phase !== 'player-turn') return;
	state.player.push(draw(state));
	state.canDouble = false;

	const value = valueHand(state.player).total;
	if (value > 21) {
		state.phase = 'round-over';
		state.lastDelta = -state.bet;
		state.message = 'Bust. Dealer wins.';
		recordOutcome(state, 'loss');
	} else if (value === 21) {
		stand(state);
	} else {
		state.message = 'Hit or stand.';
	}
}

export function doubleDown(state: BlackjackState): void {
	if (
		state.phase !== 'player-turn' ||
		!state.canDouble ||
		state.bankroll < state.bet
	) {
		return;
	}
	state.bankroll -= state.bet;
	state.bet *= 2;
	state.lastDelta = -state.bet;
	state.player.push(draw(state));
	state.canDouble = false;

	if (valueHand(state.player).total > 21) {
		state.phase = 'round-over';
		state.lastDelta = -state.bet;
		state.message = 'Double bust. Dealer wins.';
		recordOutcome(state, 'loss');
		return;
	}

	stand(state);
}

export function stand(state: BlackjackState): void {
	if (state.phase !== 'player-turn') return;
	state.phase = 'dealer-turn';
	state.canDouble = false;

	while (shouldDealerHit(state.dealer)) {
		state.dealer.push(draw(state));
	}

	settleRound(state);
}

export function resetToBetting(state: BlackjackState): void {
	if (state.bankroll < GAME.minBet) {
		state.phase = 'table-closed';
		state.message = 'Table closed. Start over to buy back in.';
		return;
	}
	state.phase = 'betting';
	state.player = [];
	state.dealer = [];
	state.bet = clampBet(state.bet, state.bankroll);
	state.lastDelta = 0;
	state.canDouble = false;
	state.outcome = null;
	state.message = 'Place your bet.';
}

function shouldDealerHit(cards: readonly Card[]): boolean {
	const value = valueHand(cards);
	if (value.total < 17) return true;
	return GAME.dealerHitsSoft17 && value.total === 17 && value.soft;
}

function settleRound(state: BlackjackState): void {
	const playerValue = valueHand(state.player).total;
	const dealerValue = valueHand(state.dealer).total;
	const playerMadeTwentyOne =
		playerValue === 21 && !isBlackjack(state.player);

	if (dealerValue > 21) {
		settleWin(
			state,
			playerMadeTwentyOne
				? 'Twenty-one wins. Dealer busts.'
				: 'Dealer busts.',
		);
	} else if (playerValue > dealerValue) {
		settleWin(
			state,
			playerMadeTwentyOne ? 'Twenty-one wins.' : 'Player wins.',
		);
	} else if (playerValue < dealerValue) {
		state.phase = 'round-over';
		state.lastDelta = -state.bet;
		state.message = 'Dealer wins.';
		recordOutcome(state, 'loss');
	} else {
		settlePush(state, 'Push.');
	}
}

function settleWin(state: BlackjackState, message: string): void {
	const payout = state.bet * 2;
	state.bankroll += payout;
	state.lastDelta = state.bet;
	state.phase = 'round-over';
	state.message = message;
	recordOutcome(state, 'win');
}

function settlePush(state: BlackjackState, message: string): void {
	state.bankroll += state.bet;
	state.lastDelta = 0;
	state.phase = 'round-over';
	state.message = message;
	recordOutcome(state, 'push');
}

function recordOutcome(
	state: BlackjackState,
	outcome: Exclude<RoundOutcome, null>,
): void {
	state.outcome = outcome;
	state.stats.hands++;
	state.stats.bestBankroll = Math.max(
		state.stats.bestBankroll,
		state.bankroll,
	);

	if (outcome === 'blackjack') {
		state.stats.blackjacks++;
		state.stats.wins++;
		return;
	}
	if (outcome === 'win') {
		state.stats.wins++;
		return;
	}
	if (outcome === 'loss') {
		state.stats.losses++;
		return;
	}
	state.stats.pushes++;
}

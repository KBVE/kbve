import {
	cardPoints,
	cardRank,
	handFingerprint,
	valueHand,
	type Card,
} from '../cards';
import type { BlackjackState } from '../state';

interface StrategyHintCache {
	playerFingerprint: number;
	dealerUp: Card;
	canDouble: boolean;
	hint: string;
}

export class StrategyAdvisor {
	private lastHint: StrategyHintCache | null = null;

	getHint(state: BlackjackState): string {
		if (state.phase !== 'player-turn' || state.dealer.length === 0) {
			this.lastHint = null;
			return '';
		}

		const playerFingerprint = handFingerprint(state.player);
		const dealerUpCard = state.dealer[0];
		const canDouble = state.canDouble && state.player.length === 2;
		if (
			this.lastHint &&
			this.lastHint.playerFingerprint === playerFingerprint &&
			this.lastHint.dealerUp === dealerUpCard &&
			this.lastHint.canDouble === canDouble
		) {
			return this.lastHint.hint;
		}

		const playerValue = valueHand(state.player);
		const dealerUp = this.dealerUpValue(dealerUpCard);

		const hint = playerValue.soft
			? `Hint: ${this.softStrategy(playerValue.total, dealerUp, canDouble)}`
			: `Hint: ${this.hardStrategy(playerValue.total, dealerUp, canDouble)}`;
		this.lastHint = {
			playerFingerprint,
			dealerUp: dealerUpCard,
			canDouble,
			hint,
		};
		return hint;
	}

	private hardStrategy(
		total: number,
		dealerUp: number,
		canDouble: boolean,
	): string {
		if (canDouble && total === 11) return 'Double';
		if (canDouble && total === 10 && dealerUp <= 9) return 'Double';
		if (canDouble && total === 9 && dealerUp >= 3 && dealerUp <= 6) {
			return 'Double';
		}
		if (total >= 17) return 'Stand';
		if (total >= 13 && dealerUp >= 2 && dealerUp <= 6) return 'Stand';
		if (total === 12 && dealerUp >= 4 && dealerUp <= 6) return 'Stand';
		return 'Hit';
	}

	private softStrategy(
		total: number,
		dealerUp: number,
		canDouble: boolean,
	): string {
		if (total >= 19) return 'Stand';
		if (total === 18) {
			if (canDouble && dealerUp >= 3 && dealerUp <= 6) return 'Double';
			if (dealerUp === 2 || dealerUp === 7 || dealerUp === 8) {
				return 'Stand';
			}
			return 'Hit';
		}
		if (canDouble && total >= 15 && dealerUp >= 4 && dealerUp <= 6) {
			return 'Double';
		}
		if (canDouble && total >= 13 && dealerUp >= 5 && dealerUp <= 6) {
			return 'Double';
		}
		return 'Hit';
	}

	private dealerUpValue(card: Card): number {
		if (cardRank(card) === 'A') return 11;
		return Math.min(cardPoints(card), 10);
	}
}

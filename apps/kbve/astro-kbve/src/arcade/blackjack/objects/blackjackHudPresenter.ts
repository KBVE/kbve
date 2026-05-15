import { COLORS } from '../config';
import type { BlackjackState, RoundOutcome } from '../state';
import { handFingerprint } from '../cards';
import type { BlackjackHudValues } from './blackjackHud';
import { HandValueFormatter } from './handValueFormatter';
import { StrategyAdvisor } from './strategyAdvisor';

interface BankrollLabelCache {
	bankroll: number;
	bet: number;
	lastDelta: number;
	label: string;
}

interface ShoeLabelCache {
	cards: number;
	rounds: number;
	label: string;
}

interface StatsLabelCache {
	wins: number;
	losses: number;
	pushes: number;
	blackjacks: number;
	bestBankroll: number;
	label: string;
}

interface StatusColorCache {
	outcome: RoundOutcome;
	color: string;
}

interface HudValuesCache {
	bankroll: number;
	bet: number;
	lastDelta: number;
	message: string;
	outcome: RoundOutcome;
	phase: string;
	canDouble: boolean;
	hideDealerHole: boolean;
	playerFingerprint: number;
	dealerFingerprint: number;
	shoeCards: number;
	rounds: number;
	wins: number;
	losses: number;
	pushes: number;
	blackjacks: number;
	bestBankroll: number;
	values: BlackjackHudValues;
}

export class BlackjackHudPresenter {
	private readonly handValueFormatter = new HandValueFormatter();
	private readonly strategyAdvisor = new StrategyAdvisor();
	private bankrollLabelCache: BankrollLabelCache | null = null;
	private shoeLabelCache: ShoeLabelCache | null = null;
	private statsLabelCache: StatsLabelCache | null = null;
	private statusColorCache: StatusColorCache | null = null;
	private valuesCache: HudValuesCache | null = null;

	values(state: BlackjackState, hideDealerHole: boolean): BlackjackHudValues {
		const playerFingerprint = handFingerprint(state.player);
		const dealerFingerprint = handFingerprint(state.dealer);
		const cached = this.valuesCache;
		const { wins, losses, pushes, blackjacks, bestBankroll } = state.stats;

		if (
			cached &&
			cached.bankroll === state.bankroll &&
			cached.bet === state.bet &&
			cached.lastDelta === state.lastDelta &&
			cached.message === state.message &&
			cached.outcome === state.outcome &&
			cached.phase === state.phase &&
			cached.canDouble === state.canDouble &&
			cached.hideDealerHole === hideDealerHole &&
			cached.playerFingerprint === playerFingerprint &&
			cached.dealerFingerprint === dealerFingerprint &&
			cached.shoeCards === state.shoe.length &&
			cached.rounds === state.rounds &&
			cached.wins === wins &&
			cached.losses === losses &&
			cached.pushes === pushes &&
			cached.blackjacks === blackjacks &&
			cached.bestBankroll === bestBankroll
		) {
			return cached.values;
		}

		const values = {
			bankroll: this.bankrollLabel(state),
			status: state.message,
			statusColor: this.statusColor(state.outcome),
			strategy: this.strategyAdvisor.getHint(state),
			betChip: `$${state.bet}`,
			dealerValue: this.handValueFormatter.label(
				'dealer',
				'Dealer',
				state.dealer,
				hideDealerHole ? 1 : state.dealer.length,
			),
			playerValue: this.handValueFormatter.label(
				'player',
				'Player',
				state.player,
			),
			shoe: this.shoeLabel(state),
			stats: this.statsLabel(state),
		};
		this.valuesCache = {
			bankroll: state.bankroll,
			bet: state.bet,
			lastDelta: state.lastDelta,
			message: state.message,
			outcome: state.outcome,
			phase: state.phase,
			canDouble: state.canDouble,
			hideDealerHole,
			playerFingerprint,
			dealerFingerprint,
			shoeCards: state.shoe.length,
			rounds: state.rounds,
			wins,
			losses,
			pushes,
			blackjacks,
			bestBankroll,
			values,
		};
		return values;
	}

	private bankrollLabel(state: BlackjackState): string {
		const cached = this.bankrollLabelCache;
		if (
			cached &&
			cached.bankroll === state.bankroll &&
			cached.bet === state.bet &&
			cached.lastDelta === state.lastDelta
		) {
			return cached.label;
		}

		const delta =
			state.lastDelta === 0
				? ''
				: state.lastDelta > 0
					? `  (+$${state.lastDelta})`
					: `  (-$${Math.abs(state.lastDelta)})`;
		const label = `Bankroll $${state.bankroll}\nBet $${state.bet}${delta}`;
		this.bankrollLabelCache = {
			bankroll: state.bankroll,
			bet: state.bet,
			lastDelta: state.lastDelta,
			label,
		};
		return label;
	}

	private shoeLabel(state: BlackjackState): string {
		const cards = state.shoe.length;
		const cached = this.shoeLabelCache;
		if (
			cached &&
			cached.cards === cards &&
			cached.rounds === state.rounds
		) {
			return cached.label;
		}

		const label = `Shoe ${cards} cards\nRound ${state.rounds}`;
		this.shoeLabelCache = {
			cards,
			rounds: state.rounds,
			label,
		};
		return label;
	}

	private statsLabel(state: BlackjackState): string {
		const { wins, losses, pushes, blackjacks, bestBankroll } = state.stats;
		const cached = this.statsLabelCache;
		if (
			cached &&
			cached.wins === wins &&
			cached.losses === losses &&
			cached.pushes === pushes &&
			cached.blackjacks === blackjacks &&
			cached.bestBankroll === bestBankroll
		) {
			return cached.label;
		}

		const label = `Session  W ${wins}  L ${losses}  P ${pushes}\nBJ ${blackjacks}  Best $${bestBankroll}`;
		this.statsLabelCache = {
			wins,
			losses,
			pushes,
			blackjacks,
			bestBankroll,
			label,
		};
		return label;
	}

	private statusColor(outcome: RoundOutcome): string {
		const cached = this.statusColorCache;
		if (cached && cached.outcome === outcome) return cached.color;

		const color = this.resolveStatusColor(outcome);
		this.statusColorCache = {
			outcome,
			color,
		};
		return color;
	}

	private resolveStatusColor(outcome: RoundOutcome): string {
		if (outcome === 'loss') return COLORS.danger;
		if (outcome === 'push') return COLORS.muted;
		if (outcome === 'win' || outcome === 'blackjack') return COLORS.gold;
		return '#ffffff';
	}
}

import Phaser from 'phaser';
import { createBlackjackState, type BlackjackState } from './state';
import { BASE_WIDTH, CARD_SIZE, COLORS } from './config';
import {
	DealerAnimation,
	type CardPlacement,
} from './animation/dealerAnimation';
import { CardPool } from './objects/cardPool';
import { HandLayout } from './objects/handLayout';
import { BlackjackHud } from './objects/blackjackHud';
import { StrategyAdvisor } from './objects/strategyAdvisor';
import { HandValueFormatter } from './objects/handValueFormatter';
import {
	BlackjackTextures,
	CHIP_TEXTURE_KEY,
	SHOE_POSITION,
	TABLE_TEXTURE_KEY,
} from './objects/blackjackTextures';
import { BlackjackControls } from './objects/blackjackControls';

const DEAL_ANIMATION = {
	duration: 220,
	stagger: 70,
} as const;

export class BlackjackScene extends Phaser.Scene {
	private state: BlackjackState = createBlackjackState();
	private blackjackTextures!: BlackjackTextures;
	private cardLayer!: Phaser.GameObjects.Container;
	private cardPool!: CardPool;
	private handLayout!: HandLayout;
	private strategyAdvisor = new StrategyAdvisor();
	private dealLayer!: Phaser.GameObjects.Container;
	private dealerAnimation!: DealerAnimation;
	private hudLayer!: Phaser.GameObjects.Container;
	private hud!: BlackjackHud;
	private controls!: BlackjackControls;
	private readonly handValueFormatter = new HandValueFormatter();

	constructor() {
		super('blackjack');
	}

	create() {
		this.blackjackTextures = new BlackjackTextures(this);
		this.blackjackTextures.createCardTextures();
		this.blackjackTextures.createHudTextures();
		this.blackjackTextures.createTableTexture();
		this.drawTable();
		this.cardLayer = this.add.container(0, 0).setDepth(10);
		this.cardPool = new CardPool(
			this,
			this.cardLayer,
			this.blackjackTextures.cardTextureKey('slot'),
		);
		this.handLayout = new HandLayout((card) =>
			this.blackjackTextures.cardTextureKey(card),
		);
		this.dealLayer = this.add.container(0, 0).setDepth(15);
		this.dealerAnimation = new DealerAnimation(this, this.dealLayer, {
			cardBackTextureKey: this.blackjackTextures.cardTextureKey('back'),
			shoePosition: SHOE_POSITION,
			duration: DEAL_ANIMATION.duration,
			stagger: DEAL_ANIMATION.stagger,
			enabled: !this.prefersReducedMotion(),
		});
		this.hudLayer = this.add.container(0, 0).setDepth(20);
		this.hud = new BlackjackHud(this, this.hudLayer, CHIP_TEXTURE_KEY);
		this.hud.create();
		this.controls = new BlackjackControls({
			scene: this,
			layer: this.hudLayer,
			textureKey: (enabled) =>
				this.blackjackTextures.buttonTextureKey(enabled),
			getState: () => this.state,
			setState: (state) => {
				this.state = state;
			},
			onAction: () => this.render(),
		});
		this.controls.create();
		this.render();
	}

	private drawTable() {
		this.add.image(0, 0, TABLE_TEXTURE_KEY).setOrigin(0);
	}

	private prefersReducedMotion(): boolean {
		return (
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
			false
		);
	}

	private render() {
		this.cardPool.begin();
		const hideHole = this.hideDealerHole();
		const dealerCards = this.handLayout.cardPlacements(
			this.state.dealer,
			BASE_WIDTH / 2,
			166,
			hideHole,
			'dealer',
		);
		const playerCards = this.handLayout.cardPlacements(
			this.state.player,
			BASE_WIDTH / 2,
			420,
			false,
			'player',
		);

		this.drawHand(dealerCards, BASE_WIDTH / 2, 166);
		this.drawHand(playerCards, BASE_WIDTH / 2, 420);
		this.cardPool.hideUnused();
		this.dealerAnimation.animateNewCards(dealerCards, playerCards);
		this.updateHud();
		this.controls.update();
	}

	private hideDealerHole(): boolean {
		return (
			this.state.phase === 'player-turn' && this.state.dealer.length > 1
		);
	}

	private drawHand(
		placements: readonly CardPlacement[],
		centerX: number,
		y: number,
	) {
		if (placements.length === 0) {
			this.drawCardSlot(centerX - CARD_SIZE.width - 10, y);
			this.drawCardSlot(centerX + 10, y);
			return;
		}

		for (const placement of placements) {
			this.cardPool.place(placement.textureKey, placement.x, placement.y);
		}
	}

	private drawCardSlot(x: number, y: number) {
		this.cardPool.place(
			this.blackjackTextures.cardTextureKey('slot'),
			x,
			y,
		);
	}

	private updateHud() {
		const hideHole = this.hideDealerHole();
		const dealerValue = this.handValueFormatter.label(
			'dealer',
			'Dealer',
			this.state.dealer,
			hideHole ? 1 : this.state.dealer.length,
		);
		const playerValue = this.handValueFormatter.label(
			'player',
			'Player',
			this.state.player,
		);
		const delta =
			this.state.lastDelta === 0
				? ''
				: this.state.lastDelta > 0
					? `  (+$${this.state.lastDelta})`
					: `  (-$${Math.abs(this.state.lastDelta)})`;

		this.hud.update({
			bankroll: `Bankroll $${this.state.bankroll}\nBet $${this.state.bet}${delta}`,
			status: this.state.message,
			statusColor: this.getStatusColor(),
			strategy: this.strategyAdvisor.getHint(this.state),
			betChip: `$${this.state.bet}`,
			dealerValue,
			playerValue,
			shoe: `Shoe ${this.state.shoe.length} cards\nRound ${this.state.rounds}`,
			stats: `Session  W ${this.state.stats.wins}  L ${this.state.stats.losses}  P ${this.state.stats.pushes}\nBJ ${this.state.stats.blackjacks}  Best $${this.state.stats.bestBankroll}`,
		});
	}

	private getStatusColor(): string {
		if (this.state.outcome === 'loss') return COLORS.danger;
		if (this.state.outcome === 'push') return COLORS.muted;
		if (
			this.state.outcome === 'win' ||
			this.state.outcome === 'blackjack'
		) {
			return COLORS.gold;
		}
		return '#ffffff';
	}
}

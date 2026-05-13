import Phaser from 'phaser';
import {
	clampBet,
	createBlackjackState,
	doubleDown,
	hit,
	resetToBetting,
	stand,
	startRound,
	type BlackjackState,
} from './state';
import { type Card, isBlackjack, valueHand } from './cards';
import { BASE_WIDTH, CARD_SIZE, COLORS } from './config';
import {
	DealerAnimation,
	type CardPlacement,
} from './animation/dealerAnimation';
import {
	ButtonBar,
	type ButtonKey,
	type ButtonSpec,
} from './objects/buttonBar';
import { CardPool } from './objects/cardPool';
import { HandLayout } from './objects/handLayout';
import { BlackjackHud } from './objects/blackjackHud';
import { StrategyAdvisor } from './objects/strategyAdvisor';
import {
	BlackjackTextures,
	CHIP_TEXTURE_KEY,
	SHOE_POSITION,
	TABLE_TEXTURE_KEY,
} from './objects/blackjackTextures';

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
	private buttonBar!: ButtonBar;

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
		this.createButtons();
		this.bindKeyboard();
		this.render();
	}

	private drawTable() {
		this.add.image(0, 0, TABLE_TEXTURE_KEY).setOrigin(0);
	}

	private createButtons() {
		const specs: ButtonSpec[] = [
			{
				key: 'betDown',
				label: '-',
				x: 432,
				y: 691,
				w: 50,
				enabled: () => this.state.phase === 'betting',
				action: () => this.changeBet(-25),
			},
			{
				key: 'betUp',
				label: '+',
				x: 492,
				y: 691,
				w: 50,
				enabled: () => this.state.phase === 'betting',
				action: () => this.changeBet(25),
			},
			{
				key: 'deal',
				label: 'Deal',
				x: 562,
				y: 691,
				w: 92,
				enabled: () => this.state.phase === 'betting',
				action: () => startRound(this.state),
			},
			{
				key: 'hit',
				label: 'Hit',
				x: 674,
				y: 691,
				w: 82,
				enabled: () => this.state.phase === 'player-turn',
				action: () => hit(this.state),
			},
			{
				key: 'stand',
				label: 'Stand',
				x: 766,
				y: 691,
				w: 92,
				enabled: () => this.state.phase === 'player-turn',
				action: () => stand(this.state),
			},
			{
				key: 'double',
				label: 'Double',
				x: 868,
				y: 691,
				w: 104,
				enabled: () =>
					this.state.phase === 'player-turn' && this.state.canDouble,
				action: () => doubleDown(this.state),
			},
			{
				key: 'next',
				label: 'Next',
				x: 982,
				y: 691,
				w: 90,
				enabled: () => this.state.phase === 'round-over',
				action: () => resetToBetting(this.state),
			},
			{
				key: 'new',
				label: 'New',
				x: 1082,
				y: 691,
				w: 84,
				enabled: () => true,
				action: () => {
					this.state = createBlackjackState();
				},
			},
		];

		this.buttonBar = new ButtonBar(
			this,
			this.hudLayer,
			(enabled) => this.blackjackTextures.buttonTextureKey(enabled),
			() => this.render(),
		);
		this.buttonBar.create(specs);
	}

	private bindKeyboard() {
		this.input.keyboard?.on('keydown-H', () => this.runAction('hit'));
		this.input.keyboard?.on('keydown-S', () => this.runAction('stand'));
		this.input.keyboard?.on('keydown-D', () => this.runAction('double'));
		this.input.keyboard?.on('keydown-ENTER', () => {
			this.runAction(this.state.phase === 'round-over' ? 'next' : 'deal');
		});
		this.input.keyboard?.on('keydown-N', () => this.runAction('new'));
		this.input.keyboard?.on('keydown-UP', () => this.runAction('betUp'));
		this.input.keyboard?.on('keydown-DOWN', () =>
			this.runAction('betDown'),
		);
	}

	private runAction(key: ButtonKey) {
		if (this.buttonBar.run(key)) this.render();
	}

	private changeBet(delta: number) {
		this.state.bet = clampBet(this.state.bet + delta, this.state.bankroll);
		this.state.message = `Bet set to $${this.state.bet}.`;
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
		this.buttonBar.update();
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
		const dealerVisible = this.hideDealerHole()
			? [this.state.dealer[0]].filter(Boolean)
			: this.state.dealer;
		const dealerValue =
			dealerVisible.length > 0
				? `Dealer  ${this.formatValue(dealerVisible)}`
				: 'Dealer: -';
		const playerValue =
			this.state.player.length > 0
				? `Player  ${this.formatValue(this.state.player)}`
				: 'Player: -';
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

	private formatValue(cards: readonly Card[]): string {
		const value = valueHand(cards);
		const natural = isBlackjack(cards) ? ' blackjack' : '';
		return `${value.total}${value.soft ? ' soft' : ''}${natural}`;
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

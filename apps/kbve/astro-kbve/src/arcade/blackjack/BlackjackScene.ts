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
import {
	cardPoints,
	cardRank,
	cardSuit,
	encodeCard,
	type Card,
	isBlackjack,
	isRedSuit,
	SUIT_GLYPH,
	valueHand,
} from './cards';
import { BASE_HEIGHT, BASE_WIDTH, CARD_SIZE, COLORS, FONT } from './config';
import {
	DealerAnimation,
	type CardPlacement,
} from './animation/dealerAnimation';
import {
	ButtonBar,
	BUTTON_TEXTURE_SIZE,
	type ButtonKey,
	type ButtonSpec,
} from './objects/buttonBar';
import { CardPool } from './objects/cardPool';
import { HandLayout } from './objects/handLayout';

const CARD_TEXTURE_PREFIX = 'blackjack-card';
const CARD_TEXTURE_MARGIN = {
	x: 6,
	y: 8,
} as const;
const BUTTON_TEXTURE_PREFIX = 'blackjack-button';
const TABLE_TEXTURE_KEY = 'blackjack-table-static';
const CHIP_TEXTURE_KEY = 'blackjack-chip';
const SHOE_POSITION = {
	x: 1030,
	y: 198,
} as const;
const DEAL_ANIMATION = {
	duration: 220,
	stagger: 70,
} as const;

export class BlackjackScene extends Phaser.Scene {
	private state: BlackjackState = createBlackjackState();
	private cardLayer!: Phaser.GameObjects.Container;
	private cardPool!: CardPool;
	private handLayout!: HandLayout;
	private dealLayer!: Phaser.GameObjects.Container;
	private dealerAnimation!: DealerAnimation;
	private hudLayer!: Phaser.GameObjects.Container;
	private buttonBar!: ButtonBar;
	private textCache = new Map<string, string>();
	private colorCache = new Map<string, string>();
	private statusText!: Phaser.GameObjects.Text;
	private strategyText!: Phaser.GameObjects.Text;
	private bankrollText!: Phaser.GameObjects.Text;
	private dealerValueText!: Phaser.GameObjects.Text;
	private playerValueText!: Phaser.GameObjects.Text;
	private shoeText!: Phaser.GameObjects.Text;
	private statsText!: Phaser.GameObjects.Text;
	private betChip!: Phaser.GameObjects.Image;
	private betChipText!: Phaser.GameObjects.Text;

	constructor() {
		super('blackjack');
	}

	create() {
		this.createCardTextures();
		this.createHudTextures();
		this.createTableTexture();
		this.drawTable();
		this.cardLayer = this.add.container(0, 0).setDepth(10);
		this.cardPool = new CardPool(
			this,
			this.cardLayer,
			this.cardTextureKey('slot'),
		);
		this.handLayout = new HandLayout((card) => this.cardTextureKey(card));
		this.dealLayer = this.add.container(0, 0).setDepth(15);
		this.dealerAnimation = new DealerAnimation(this, this.dealLayer, {
			cardBackTextureKey: this.cardTextureKey('back'),
			shoePosition: SHOE_POSITION,
			duration: DEAL_ANIMATION.duration,
			stagger: DEAL_ANIMATION.stagger,
			enabled: !this.prefersReducedMotion(),
		});
		this.hudLayer = this.add.container(0, 0).setDepth(20);
		this.createHud();
		this.createButtons();
		this.bindKeyboard();
		this.render();
	}

	private drawTable() {
		this.add.image(0, 0, TABLE_TEXTURE_KEY).setOrigin(0);
	}

	private createHud() {
		const panel = this.add.graphics();
		panel.fillStyle(COLORS.panel, 0.88);
		panel.fillRoundedRect(72, 618, BASE_WIDTH - 144, 116, 18);
		panel.lineStyle(2, COLORS.panelStroke, 0.7);
		panel.strokeRoundedRect(72, 618, BASE_WIDTH - 144, 116, 18);
		this.hudLayer.add(panel);

		this.bankrollText = this.add.text(104, 642, '', {
			fontFamily: FONT.mono,
			fontSize: '18px',
			color: COLORS.gold,
		});
		this.statusText = this.add.text(BASE_WIDTH / 2, 639, '', {
			fontFamily: FONT.sans,
			fontSize: '24px',
			color: '#ffffff',
			align: 'center',
		});
		this.statusText.setOrigin(0.5, 0);
		this.strategyText = this.add
			.text(BASE_WIDTH / 2, 669, '', {
				fontFamily: FONT.mono,
				fontSize: '16px',
				color: COLORS.muted,
				align: 'center',
			})
			.setOrigin(0.5, 0);
		this.betChip = this.add
			.image(332, 676, CHIP_TEXTURE_KEY)
			.setOrigin(0.5);
		this.betChipText = this.add
			.text(332, 674, '', {
				fontFamily: FONT.mono,
				fontSize: '18px',
				color: '#111827',
				align: 'center',
			})
			.setOrigin(0.5);
		this.dealerValueText = this.add.text(142, 178, '', {
			fontFamily: FONT.mono,
			fontSize: '18px',
			color: COLORS.soft,
		});
		this.playerValueText = this.add.text(142, 432, '', {
			fontFamily: FONT.mono,
			fontSize: '18px',
			color: COLORS.soft,
		});
		this.shoeText = this.add.text(BASE_WIDTH - 104, 642, '', {
			fontFamily: FONT.mono,
			fontSize: '16px',
			color: COLORS.muted,
			align: 'right',
		});
		this.shoeText.setOrigin(1, 0);
		this.statsText = this.add.text(BASE_WIDTH - 120, 122, '', {
			fontFamily: FONT.mono,
			fontSize: '15px',
			color: COLORS.muted,
			align: 'right',
		});
		this.statsText.setOrigin(1, 0);

		this.hudLayer.add([
			this.bankrollText,
			this.statusText,
			this.strategyText,
			this.betChip,
			this.betChipText,
			this.dealerValueText,
			this.playerValueText,
			this.shoeText,
			this.statsText,
		]);
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
			(enabled) => this.buttonTextureKey(enabled),
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
		this.updateText();
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
		this.cardPool.place(this.cardTextureKey('slot'), x, y);
	}

	private createCardTextures() {
		if (this.textures.exists(this.cardTextureKey('back'))) return;

		this.createSlotTexture();
		this.createBackTexture();

		for (const suit of ['spades', 'hearts', 'diamonds', 'clubs'] as const) {
			for (const rank of [
				'A',
				'2',
				'3',
				'4',
				'5',
				'6',
				'7',
				'8',
				'9',
				'10',
				'J',
				'Q',
				'K',
			] as const) {
				this.createFaceTexture(encodeCard(suit, rank));
			}
		}
	}

	private createHudTextures() {
		this.createButtonTexture(true);
		this.createButtonTexture(false);
		this.createChipTexture();
	}

	private createButtonTexture(enabled: boolean) {
		const key = this.buttonTextureKey(enabled);
		if (this.textures.exists(key)) return;

		const canvas = document.createElement('canvas');
		canvas.width = BUTTON_TEXTURE_SIZE.width;
		canvas.height = BUTTON_TEXTURE_SIZE.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas 2D context is unavailable.');

		ctx.globalAlpha = enabled ? 0.94 : 0.5;
		ctx.fillStyle = this.hexColor(enabled ? COLORS.action : 0x111827);
		this.roundRect(
			ctx,
			0,
			0,
			BUTTON_TEXTURE_SIZE.width,
			BUTTON_TEXTURE_SIZE.height,
			BUTTON_TEXTURE_SIZE.radius,
		);
		ctx.fill();
		ctx.globalAlpha = enabled ? 0.9 : 0.42;
		ctx.strokeStyle = this.hexColor(enabled ? COLORS.tableTrim : 0x475569);
		ctx.lineWidth = 1;
		ctx.stroke();
		ctx.globalAlpha = 1;

		this.textures.addCanvas(key, canvas);
	}

	private createChipTexture() {
		if (this.textures.exists(CHIP_TEXTURE_KEY)) return;

		const size = 70;
		const center = size / 2;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas 2D context is unavailable.');

		ctx.fillStyle = '#f8fafc';
		ctx.beginPath();
		ctx.arc(center, center, 33, 0, Math.PI * 2);
		ctx.fill();

		ctx.strokeStyle = this.hexColor(COLORS.tableTrim);
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.arc(center, center, 33, 0, Math.PI * 2);
		ctx.stroke();

		ctx.strokeStyle = this.hexColor(COLORS.cardBack);
		ctx.globalAlpha = 0.95;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(center, center, 22, 0, Math.PI * 2);
		ctx.stroke();
		ctx.globalAlpha = 1;

		this.textures.addCanvas(CHIP_TEXTURE_KEY, canvas);
	}

	private createTableTexture() {
		if (this.textures.exists(TABLE_TEXTURE_KEY)) return;

		const canvas = document.createElement('canvas');
		canvas.width = BASE_WIDTH;
		canvas.height = BASE_HEIGHT;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas 2D context is unavailable.');

		ctx.fillStyle = this.hexColor(COLORS.background);
		ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

		ctx.globalAlpha = 0.58;
		ctx.fillStyle = this.hexColor(COLORS.tableShadow);
		this.roundRect(ctx, 46, 52, BASE_WIDTH - 92, BASE_HEIGHT - 96, 38);
		ctx.fill();
		ctx.globalAlpha = 1;

		ctx.fillStyle = this.hexColor(COLORS.rail);
		this.roundRect(ctx, 30, 28, BASE_WIDTH - 60, BASE_HEIGHT - 56, 34);
		ctx.fill();
		ctx.strokeStyle = this.hexColor(COLORS.railLight);
		ctx.globalAlpha = 0.9;
		ctx.lineWidth = 5;
		this.strokeRoundRect(
			ctx,
			39,
			37,
			BASE_WIDTH - 78,
			BASE_HEIGHT - 74,
			28,
		);
		ctx.strokeStyle = this.hexColor(COLORS.tableTrim);
		ctx.globalAlpha = 0.95;
		ctx.lineWidth = 3;
		this.strokeRoundRect(
			ctx,
			52,
			50,
			BASE_WIDTH - 104,
			BASE_HEIGHT - 100,
			22,
		);
		ctx.globalAlpha = 1;

		const feltGradient = ctx.createLinearGradient(
			0,
			64,
			0,
			BASE_HEIGHT - 64,
		);
		feltGradient.addColorStop(0, this.hexColor(COLORS.feltCenter));
		feltGradient.addColorStop(1, this.hexColor(COLORS.feltEdge));
		ctx.fillStyle = feltGradient;
		this.roundRect(ctx, 66, 64, BASE_WIDTH - 132, BASE_HEIGHT - 128, 20);
		ctx.fill();
		ctx.strokeStyle = this.hexColor(COLORS.tableTrimDark);
		ctx.globalAlpha = 0.9;
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.globalAlpha = 1;

		this.drawFeltWeave(ctx);
		this.drawTableMarkings(ctx);
		this.drawDealerArc(ctx);
		this.drawHandBand(ctx, 154, 'DEALER');
		this.drawHandBand(ctx, 408, 'PLAYER');
		this.drawShoeStack(ctx);
		this.drawTableTitle(ctx);

		this.textures.addCanvas(TABLE_TEXTURE_KEY, canvas);
	}

	private drawFeltWeave(ctx: CanvasRenderingContext2D) {
		ctx.strokeStyle = this.hexColor(COLORS.feltPattern);
		ctx.globalAlpha = 0.045;
		ctx.lineWidth = 1;
		for (let x = 92; x <= BASE_WIDTH - 92; x += 18) {
			this.line(ctx, x, 82, x - 74, BASE_HEIGHT - 82);
			this.line(ctx, x, 82, x + 74, BASE_HEIGHT - 82);
		}

		ctx.strokeStyle = '#ffffff';
		ctx.globalAlpha = 0.035;
		for (let y = 94; y <= BASE_HEIGHT - 98; y += 22) {
			this.line(ctx, 90, y, BASE_WIDTH - 90, y);
		}

		ctx.strokeStyle = '#02120c';
		ctx.globalAlpha = 0.22;
		ctx.lineWidth = 26;
		this.strokeRoundRect(
			ctx,
			80,
			78,
			BASE_WIDTH - 160,
			BASE_HEIGHT - 156,
			24,
		);
		ctx.strokeStyle = '#020b08';
		ctx.globalAlpha = 0.16;
		ctx.lineWidth = 52;
		this.strokeRoundRect(
			ctx,
			66,
			64,
			BASE_WIDTH - 132,
			BASE_HEIGHT - 128,
			20,
		);
		ctx.globalAlpha = 1;
	}

	private drawDealerArc(ctx: CanvasRenderingContext2D) {
		ctx.strokeStyle = this.hexColor(COLORS.feltInk);
		ctx.globalAlpha = 0.2;
		ctx.lineWidth = 2;
		this.arc(
			ctx,
			BASE_WIDTH / 2,
			640,
			420,
			Phaser.Math.DegToRad(205),
			Phaser.Math.DegToRad(335),
		);
		ctx.strokeStyle = this.hexColor(COLORS.tableTrim);
		ctx.lineWidth = 1;
		this.arc(
			ctx,
			BASE_WIDTH / 2,
			638,
			454,
			Phaser.Math.DegToRad(207),
			Phaser.Math.DegToRad(333),
		);
		ctx.globalAlpha = 1;
	}

	private drawTableMarkings(ctx: CanvasRenderingContext2D) {
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#d1fae5';

		ctx.globalAlpha = 0.42;
		ctx.font = `14px ${FONT.mono}`;
		ctx.fillText('BLACKJACK PAYS 3 TO 2', BASE_WIDTH / 2, 134);

		ctx.globalAlpha = 0.34;
		ctx.font = `13px ${FONT.mono}`;
		ctx.fillText('DEALER STANDS ON SOFT 17', BASE_WIDTH / 2, 592);

		ctx.strokeStyle = this.hexColor(COLORS.feltInk);
		ctx.globalAlpha = 0.14;
		ctx.lineWidth = 2;
		for (const x of [242, 1038]) {
			this.circle(ctx, x, 472, 42);
			this.circle(ctx, x, 472, 28);
		}
		ctx.globalAlpha = 1;
	}

	private drawHandBand(
		ctx: CanvasRenderingContext2D,
		y: number,
		label: string,
	) {
		ctx.fillStyle = '#031a12';
		ctx.globalAlpha = 0.28;
		this.roundRect(ctx, 120, y, BASE_WIDTH - 240, 176, 20);
		ctx.fill();
		ctx.strokeStyle = this.hexColor(COLORS.feltInk);
		ctx.globalAlpha = 0.15;
		ctx.lineWidth = 1;
		ctx.stroke();

		ctx.globalAlpha = 0.08;
		ctx.fillStyle = '#ffffff';
		ctx.font = `30px ${FONT.mono}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(label, BASE_WIDTH / 2, y + 88);
		ctx.globalAlpha = 1;
	}

	private drawTableTitle(ctx: CanvasRenderingContext2D) {
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `42px ${FONT.serif}`;
		ctx.lineWidth = 7;
		ctx.strokeStyle = '#020617';
		ctx.shadowColor = '#000000';
		ctx.shadowBlur = 4;
		ctx.shadowOffsetY = 3;
		ctx.strokeText('KBVE BLACKJACK', BASE_WIDTH / 2, 86);
		ctx.fillStyle = COLORS.gold;
		ctx.fillText('KBVE BLACKJACK', BASE_WIDTH / 2, 86);
		ctx.shadowColor = 'transparent';
		ctx.shadowBlur = 0;
		ctx.shadowOffsetY = 0;

		ctx.font = `16px ${FONT.sans}`;
		ctx.fillStyle = COLORS.muted;
		ctx.fillText(
			'Dealer stands on soft 17 · Blackjack pays 3:2',
			BASE_WIDTH / 2,
			112,
		);
	}

	private drawShoeStack(ctx: CanvasRenderingContext2D) {
		const stackOffset = 9;

		for (let i = 3; i >= 0; i--) {
			const x = SHOE_POSITION.x + i * stackOffset;
			const y = SHOE_POSITION.y + i * stackOffset;
			this.drawCardShadowAt(ctx, x + 5, y + 7);
			ctx.fillStyle = this.hexColor(COLORS.cardBack);
			this.roundRect(
				ctx,
				x,
				y,
				CARD_SIZE.width,
				CARD_SIZE.height,
				CARD_SIZE.radius,
			);
			ctx.fill();
			ctx.strokeStyle = this.hexColor(COLORS.cardBorder);
			ctx.globalAlpha = 0.9;
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.globalAlpha = 1;

			ctx.strokeStyle = this.hexColor(COLORS.cardBackAccent);
			ctx.globalAlpha = 0.55;
			ctx.lineWidth = 2;
			this.strokeRoundRect(
				ctx,
				x + 10,
				y + 10,
				CARD_SIZE.width - 20,
				CARD_SIZE.height - 20,
				8,
			);
			ctx.globalAlpha = 1;
		}

		ctx.font = `18px ${FONT.serif}`;
		ctx.fillStyle = COLORS.gold;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.globalAlpha = 0.9;
		ctx.fillText(
			'KBVE',
			SHOE_POSITION.x + (CARD_SIZE.width + stackOffset * 3) / 2,
			SHOE_POSITION.y + (CARD_SIZE.height + stackOffset * 3) / 2,
		);
		ctx.globalAlpha = 1;
	}

	private createSlotTexture() {
		const { canvas, ctx } = this.createCardCanvas(false);
		ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
		this.roundRect(
			ctx,
			0,
			0,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		ctx.fill();
		ctx.strokeStyle = this.hexColor(COLORS.tableTrim);
		ctx.globalAlpha = 0.38;
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.globalAlpha = 1;
		this.textures.addCanvas(this.cardTextureKey('slot'), canvas);
	}

	private createBackTexture() {
		const { canvas, ctx } = this.createCardCanvas(true);
		this.drawCardShadow(ctx);

		ctx.fillStyle = this.hexColor(COLORS.cardBack);
		this.roundRect(
			ctx,
			0,
			0,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		ctx.fill();
		ctx.strokeStyle = this.hexColor(COLORS.cardBorder);
		ctx.lineWidth = 3;
		ctx.stroke();

		ctx.strokeStyle = this.hexColor(COLORS.cardBackAccent);
		ctx.globalAlpha = 0.85;
		ctx.lineWidth = 2;
		this.strokeRoundRect(
			ctx,
			10,
			10,
			CARD_SIZE.width - 20,
			CARD_SIZE.height - 20,
			8,
		);
		this.strokeRoundRect(
			ctx,
			18,
			18,
			CARD_SIZE.width - 36,
			CARD_SIZE.height - 36,
			6,
		);
		ctx.globalAlpha = 1;

		ctx.font = `18px ${FONT.serif}`;
		ctx.fillStyle = COLORS.gold;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.globalAlpha = 0.88;
		ctx.fillText('KBVE', CARD_SIZE.width / 2, CARD_SIZE.height / 2);
		ctx.globalAlpha = 1;

		this.textures.addCanvas(this.cardTextureKey('back'), canvas);
	}

	private createFaceTexture(card: Card) {
		const suitName = cardSuit(card);
		const rankName = cardRank(card);
		const suitGlyph = SUIT_GLYPH[suitName];
		const color = isRedSuit(suitName) ? COLORS.red : COLORS.black;
		const { canvas, ctx } = this.createCardCanvas(true);

		this.drawCardShadow(ctx);
		ctx.fillStyle = this.hexColor(COLORS.cardFace);
		this.roundRect(
			ctx,
			0,
			0,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		ctx.fill();
		ctx.strokeStyle = this.hexColor(COLORS.cardBorder);
		ctx.globalAlpha = 0.9;
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.globalAlpha = 1;

		ctx.fillStyle = color;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.font = `30px ${FONT.serif}`;
		ctx.fillText(rankName, 12, 10);

		ctx.font = `27px ${FONT.serif}`;
		ctx.fillText(suitGlyph, 13, 43);

		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `58px ${FONT.serif}`;
		ctx.fillText(suitGlyph, CARD_SIZE.width / 2, CARD_SIZE.height / 2 + 4);

		ctx.textAlign = 'right';
		ctx.textBaseline = 'bottom';
		ctx.font = `30px ${FONT.serif}`;
		ctx.fillText(rankName, CARD_SIZE.width - 12, CARD_SIZE.height - 10);

		this.textures.addCanvas(this.cardTextureKey(card), canvas);
	}

	private drawCardShadow(ctx: CanvasRenderingContext2D) {
		ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
		this.drawCardShadowAt(ctx, 5, 7);
	}

	private drawCardShadowAt(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
	) {
		this.roundRect(
			ctx,
			x,
			y,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		ctx.fill();
	}

	private createCardCanvas(includeShadow: boolean) {
		const canvas = document.createElement('canvas');
		canvas.width =
			CARD_SIZE.width + (includeShadow ? CARD_TEXTURE_MARGIN.x : 0);
		canvas.height =
			CARD_SIZE.height + (includeShadow ? CARD_TEXTURE_MARGIN.y : 0);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas 2D context is unavailable.');
		return { canvas, ctx };
	}

	private cardTextureKey(card: Card | 'back' | 'slot'): string {
		return `${CARD_TEXTURE_PREFIX}-${card}`;
	}

	private buttonTextureKey(enabled: boolean): string {
		return `${BUTTON_TEXTURE_PREFIX}-${enabled ? 'enabled' : 'disabled'}`;
	}

	private strokeRoundRect(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		width: number,
		height: number,
		radius: number,
	) {
		this.roundRect(ctx, x, y, width, height, radius);
		ctx.stroke();
	}

	private line(
		ctx: CanvasRenderingContext2D,
		fromX: number,
		fromY: number,
		toX: number,
		toY: number,
	) {
		ctx.beginPath();
		ctx.moveTo(fromX, fromY);
		ctx.lineTo(toX, toY);
		ctx.stroke();
	}

	private arc(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		radius: number,
		startAngle: number,
		endAngle: number,
	) {
		ctx.beginPath();
		ctx.arc(x, y, radius, startAngle, endAngle);
		ctx.stroke();
	}

	private circle(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		radius: number,
	) {
		ctx.beginPath();
		ctx.arc(x, y, radius, 0, Math.PI * 2);
		ctx.stroke();
	}

	private roundRect(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		width: number,
		height: number,
		radius: number,
	) {
		ctx.beginPath();
		ctx.moveTo(x + radius, y);
		ctx.lineTo(x + width - radius, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
		ctx.lineTo(x + width, y + height - radius);
		ctx.quadraticCurveTo(
			x + width,
			y + height,
			x + width - radius,
			y + height,
		);
		ctx.lineTo(x + radius, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
		ctx.lineTo(x, y + radius);
		ctx.quadraticCurveTo(x, y, x + radius, y);
		ctx.closePath();
	}

	private hexColor(color: number): string {
		return `#${color.toString(16).padStart(6, '0')}`;
	}

	private updateText() {
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

		this.setTextIfChanged(
			'bankroll',
			this.bankrollText,
			`Bankroll $${this.state.bankroll}\nBet $${this.state.bet}${delta}`,
		);
		this.setTextIfChanged('status', this.statusText, this.state.message);
		this.setColorIfChanged(
			'statusColor',
			this.statusText,
			this.getStatusColor(),
		);
		this.setTextIfChanged(
			'strategy',
			this.strategyText,
			this.getStrategyHint(),
		);
		this.setTextIfChanged(
			'betChip',
			this.betChipText,
			`$${this.state.bet}`,
		);
		this.setTextIfChanged('dealerValue', this.dealerValueText, dealerValue);
		this.setTextIfChanged('playerValue', this.playerValueText, playerValue);
		this.setTextIfChanged(
			'shoe',
			this.shoeText,
			`Shoe ${this.state.shoe.length} cards\nRound ${this.state.rounds}`,
		);
		this.setTextIfChanged(
			'stats',
			this.statsText,
			`Session  W ${this.state.stats.wins}  L ${this.state.stats.losses}  P ${this.state.stats.pushes}\nBJ ${this.state.stats.blackjacks}  Best $${this.state.stats.bestBankroll}`,
		);
	}

	private setTextIfChanged(
		key: string,
		text: Phaser.GameObjects.Text,
		value: string,
	) {
		if (this.textCache.get(key) === value) return;
		this.textCache.set(key, value);
		text.setText(value);
	}

	private setColorIfChanged(
		key: string,
		text: Phaser.GameObjects.Text,
		value: string,
	) {
		if (this.colorCache.get(key) === value) return;
		this.colorCache.set(key, value);
		text.setColor(value);
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

	private getStrategyHint(): string {
		if (
			this.state.phase !== 'player-turn' ||
			this.state.dealer.length === 0
		) {
			return '';
		}

		const playerValue = valueHand(this.state.player);
		const dealerUp = this.dealerUpValue(this.state.dealer[0]);
		const canDouble =
			this.state.canDouble && this.state.player.length === 2;

		if (playerValue.soft) {
			return `Hint: ${this.softStrategy(playerValue.total, dealerUp, canDouble)}`;
		}
		return `Hint: ${this.hardStrategy(playerValue.total, dealerUp, canDouble)}`;
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
			if (dealerUp === 2 || dealerUp === 7 || dealerUp === 8)
				return 'Stand';
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

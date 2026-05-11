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
	type Card,
	isBlackjack,
	isRedSuit,
	SUIT_GLYPH,
	valueHand,
} from './cards';
import { BASE_HEIGHT, BASE_WIDTH, CARD_SIZE, COLORS, FONT } from './config';

type ButtonKey =
	| 'deal'
	| 'hit'
	| 'stand'
	| 'double'
	| 'betDown'
	| 'betUp'
	| 'next'
	| 'new';

interface ButtonSpec {
	key: ButtonKey;
	label: string;
	x: number;
	y: number;
	w: number;
	enabled: () => boolean;
	action: () => void;
}

interface ButtonView {
	spec: ButtonSpec;
	box: Phaser.GameObjects.Graphics;
	text: Phaser.GameObjects.Text;
}

export class BlackjackScene extends Phaser.Scene {
	private state: BlackjackState = createBlackjackState();
	private cardLayer!: Phaser.GameObjects.Container;
	private hudLayer!: Phaser.GameObjects.Container;
	private buttons: ButtonView[] = [];
	private statusText!: Phaser.GameObjects.Text;
	private strategyText!: Phaser.GameObjects.Text;
	private bankrollText!: Phaser.GameObjects.Text;
	private dealerValueText!: Phaser.GameObjects.Text;
	private playerValueText!: Phaser.GameObjects.Text;
	private shoeText!: Phaser.GameObjects.Text;
	private statsText!: Phaser.GameObjects.Text;
	private betChip!: Phaser.GameObjects.Graphics;
	private betChipText!: Phaser.GameObjects.Text;

	constructor() {
		super('blackjack');
	}

	create() {
		this.drawTable();
		this.cardLayer = this.add.container(0, 0).setDepth(10);
		this.hudLayer = this.add.container(0, 0).setDepth(20);
		this.createHud();
		this.createButtons();
		this.bindKeyboard();
		this.render();
	}

	private drawTable() {
		this.add
			.rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, COLORS.background)
			.setOrigin(0);

		const tableShadow = this.add.graphics();
		tableShadow.fillStyle(COLORS.tableShadow, 0.58);
		tableShadow.fillRoundedRect(
			46,
			52,
			BASE_WIDTH - 92,
			BASE_HEIGHT - 96,
			38,
		);

		const rail = this.add.graphics();
		rail.fillStyle(COLORS.rail, 1);
		rail.fillRoundedRect(30, 28, BASE_WIDTH - 60, BASE_HEIGHT - 56, 34);
		rail.lineStyle(5, COLORS.railLight, 0.9);
		rail.strokeRoundedRect(39, 37, BASE_WIDTH - 78, BASE_HEIGHT - 74, 28);
		rail.lineStyle(3, COLORS.tableTrim, 0.95);
		rail.strokeRoundedRect(52, 50, BASE_WIDTH - 104, BASE_HEIGHT - 100, 22);

		const felt = this.add.graphics();
		felt.fillGradientStyle(
			COLORS.feltCenter,
			COLORS.feltCenter,
			COLORS.feltEdge,
			COLORS.feltEdge,
			1,
		);
		felt.fillRoundedRect(66, 64, BASE_WIDTH - 132, BASE_HEIGHT - 128, 20);
		felt.lineStyle(2, COLORS.tableTrimDark, 0.9);
		felt.strokeRoundedRect(66, 64, BASE_WIDTH - 132, BASE_HEIGHT - 128, 20);

		this.drawFeltWeave();
		this.drawTableMarkings();
		this.drawDealerArc();

		this.drawHandBand(154, 'DEALER');
		this.drawHandBand(408, 'PLAYER');

		this.add
			.text(BASE_WIDTH / 2, 86, 'KBVE BLACKJACK', {
				fontFamily: FONT.serif,
				fontSize: '42px',
				color: COLORS.gold,
				stroke: '#020617',
				strokeThickness: 7,
				shadow: {
					offsetX: 0,
					offsetY: 3,
					color: '#000000',
					blur: 4,
					stroke: true,
					fill: true,
				},
			})
			.setOrigin(0.5);

		this.add
			.text(
				BASE_WIDTH / 2,
				112,
				'Dealer stands on soft 17 · Blackjack pays 3:2',
				{
					fontFamily: FONT.sans,
					fontSize: '16px',
					color: COLORS.muted,
				},
			)
			.setOrigin(0.5);
	}

	private drawFeltWeave() {
		const weave = this.add.graphics();
		weave.lineStyle(1, COLORS.feltPattern, 0.045);
		for (let x = 92; x <= BASE_WIDTH - 92; x += 18) {
			weave.lineBetween(x, 82, x - 74, BASE_HEIGHT - 82);
			weave.lineBetween(x, 82, x + 74, BASE_HEIGHT - 82);
		}
		weave.lineStyle(1, 0xffffff, 0.035);
		for (let y = 94; y <= BASE_HEIGHT - 98; y += 22) {
			weave.lineBetween(90, y, BASE_WIDTH - 90, y);
		}

		const vignette = this.add.graphics();
		vignette.lineStyle(26, 0x02120c, 0.22);
		vignette.strokeRoundedRect(
			80,
			78,
			BASE_WIDTH - 160,
			BASE_HEIGHT - 156,
			24,
		);
		vignette.lineStyle(52, 0x020b08, 0.16);
		vignette.strokeRoundedRect(
			66,
			64,
			BASE_WIDTH - 132,
			BASE_HEIGHT - 128,
			20,
		);
	}

	private drawDealerArc() {
		const arc = this.add.graphics();
		arc.lineStyle(2, COLORS.feltInk, 0.2);
		arc.beginPath();
		arc.arc(
			BASE_WIDTH / 2,
			640,
			420,
			Phaser.Math.DegToRad(205),
			Phaser.Math.DegToRad(335),
			false,
		);
		arc.strokePath();
		arc.lineStyle(1, COLORS.tableTrim, 0.2);
		arc.beginPath();
		arc.arc(
			BASE_WIDTH / 2,
			638,
			454,
			Phaser.Math.DegToRad(207),
			Phaser.Math.DegToRad(333),
			false,
		);
		arc.strokePath();
	}

	private drawTableMarkings() {
		this.add
			.text(BASE_WIDTH / 2, 134, 'BLACKJACK PAYS 3 TO 2', {
				fontFamily: FONT.mono,
				fontSize: '14px',
				color: '#d1fae5',
			})
			.setOrigin(0.5)
			.setAlpha(0.42);

		this.add
			.text(BASE_WIDTH / 2, 592, 'DEALER STANDS ON SOFT 17', {
				fontFamily: FONT.mono,
				fontSize: '13px',
				color: '#d1fae5',
			})
			.setOrigin(0.5)
			.setAlpha(0.34);

		for (const x of [242, 1038]) {
			const mark = this.add.graphics();
			mark.lineStyle(2, COLORS.feltInk, 0.14);
			mark.strokeCircle(x, 472, 42);
			mark.strokeCircle(x, 472, 28);
		}
	}

	private drawHandBand(y: number, label: string) {
		const band = this.add.graphics();
		band.fillStyle(0x031a12, 0.28);
		band.fillRoundedRect(120, y, BASE_WIDTH - 240, 176, 20);
		band.lineStyle(1, COLORS.feltInk, 0.15);
		band.strokeRoundedRect(120, y, BASE_WIDTH - 240, 176, 20);

		this.add
			.text(BASE_WIDTH / 2, y + 88, label, {
				fontFamily: FONT.mono,
				fontSize: '30px',
				color: '#ffffff',
			})
			.setOrigin(0.5)
			.setAlpha(0.08);
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
		this.betChip = this.add.graphics();
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

		for (const spec of specs) {
			const box = this.add.graphics();
			const text = this.add
				.text(spec.x + spec.w / 2, spec.y + 20, spec.label, {
					fontFamily: FONT.sans,
					fontSize: '16px',
					color: '#ffffff',
				})
				.setOrigin(0.5);

			const hitArea = this.add
				.zone(spec.x, spec.y, spec.w, 40)
				.setOrigin(0)
				.setInteractive({ useHandCursor: true });
			hitArea.on('pointerup', () => {
				if (!spec.enabled()) return;
				spec.action();
				this.render();
			});

			this.hudLayer.add([box, text, hitArea]);
			this.buttons.push({ spec, box, text });
		}
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
		const button = this.buttons.find((b) => b.spec.key === key);
		if (!button || !button.spec.enabled()) return;
		button.spec.action();
		this.render();
	}

	private changeBet(delta: number) {
		this.state.bet = clampBet(this.state.bet + delta, this.state.bankroll);
		this.state.message = `Bet set to $${this.state.bet}.`;
	}

	private render() {
		this.cardLayer.removeAll(true);
		this.drawHand(
			this.state.dealer,
			BASE_WIDTH / 2,
			166,
			this.hideDealerHole(),
		);
		this.drawHand(this.state.player, BASE_WIDTH / 2, 420, false);
		this.updateText();
		this.updateButtons();
	}

	private hideDealerHole(): boolean {
		return (
			this.state.phase === 'player-turn' && this.state.dealer.length > 1
		);
	}

	private drawHand(
		cards: readonly Card[],
		centerX: number,
		y: number,
		hideHole: boolean,
	) {
		const totalWidth =
			cards.length * CARD_SIZE.width + Math.max(0, cards.length - 1) * 18;
		let x = centerX - totalWidth / 2;

		if (cards.length === 0) {
			this.drawCardSlot(centerX - CARD_SIZE.width - 10, y);
			this.drawCardSlot(centerX + 10, y);
			return;
		}

		cards.forEach((card, index) => {
			if (hideHole && index === 1) {
				this.drawCardBack(x, y);
			} else {
				this.drawCardFace(card, x, y);
			}
			x += CARD_SIZE.width + 18;
		});
	}

	private drawCardSlot(x: number, y: number) {
		const g = this.add.graphics();
		g.lineStyle(2, COLORS.tableTrim, 0.38);
		g.fillStyle(0x000000, 0.12);
		g.fillRoundedRect(
			x,
			y,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		g.strokeRoundedRect(
			x,
			y,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		this.cardLayer.add(g);
	}

	private drawCardBack(x: number, y: number) {
		const g = this.add.graphics();
		g.fillStyle(0x000000, 0.24);
		g.fillRoundedRect(
			x + 5,
			y + 7,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		g.fillStyle(COLORS.cardBack, 1);
		g.fillRoundedRect(
			x,
			y,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		g.lineStyle(3, COLORS.cardBorder, 1);
		g.strokeRoundedRect(
			x,
			y,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		g.lineStyle(2, COLORS.cardBackAccent, 0.85);
		g.strokeRoundedRect(
			x + 10,
			y + 10,
			CARD_SIZE.width - 20,
			CARD_SIZE.height - 20,
			8,
		);
		g.strokeRoundedRect(
			x + 18,
			y + 18,
			CARD_SIZE.width - 36,
			CARD_SIZE.height - 36,
			6,
		);
		const mark = this.add
			.text(x + CARD_SIZE.width / 2, y + CARD_SIZE.height / 2, 'KBVE', {
				fontFamily: FONT.serif,
				fontSize: '18px',
				color: COLORS.gold,
			})
			.setOrigin(0.5)
			.setAlpha(0.88);
		this.cardLayer.add([g, mark]);
	}

	private drawCardFace(card: Card, x: number, y: number) {
		const g = this.add.graphics();
		g.fillStyle(0x000000, 0.22);
		g.fillRoundedRect(
			x + 5,
			y + 7,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		g.fillStyle(COLORS.cardFace, 1);
		g.fillRoundedRect(
			x,
			y,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		g.lineStyle(2, COLORS.cardBorder, 0.9);
		g.strokeRoundedRect(
			x,
			y,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);

		const color = isRedSuit(card.suit) ? COLORS.red : COLORS.black;
		const rank = this.add.text(x + 12, y + 10, card.rank, {
			fontFamily: FONT.serif,
			fontSize: '30px',
			color,
		});
		const suit = this.add.text(x + 13, y + 43, SUIT_GLYPH[card.suit], {
			fontFamily: FONT.serif,
			fontSize: '27px',
			color,
		});
		const center = this.add
			.text(
				x + CARD_SIZE.width / 2,
				y + CARD_SIZE.height / 2 + 4,
				SUIT_GLYPH[card.suit],
				{
					fontFamily: FONT.serif,
					fontSize: '58px',
					color,
				},
			)
			.setOrigin(0.5);
		const bottom = this.add
			.text(
				x + CARD_SIZE.width - 12,
				y + CARD_SIZE.height - 10,
				card.rank,
				{
					fontFamily: FONT.serif,
					fontSize: '30px',
					color,
				},
			)
			.setOrigin(1);
		this.cardLayer.add([g, rank, suit, center, bottom]);
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

		this.bankrollText.setText(
			`Bankroll $${this.state.bankroll}\nBet $${this.state.bet}${delta}`,
		);
		this.statusText.setText(this.state.message);
		this.statusText.setColor(this.getStatusColor());
		this.strategyText.setText(this.getStrategyHint());
		this.betChipText.setText(`$${this.state.bet}`);
		this.dealerValueText.setText(dealerValue);
		this.playerValueText.setText(playerValue);
		this.shoeText.setText(
			`Shoe ${this.state.shoe.length} cards\nRound ${this.state.rounds}`,
		);
		this.statsText.setText(
			`Session  W ${this.state.stats.wins}  L ${this.state.stats.losses}  P ${this.state.stats.pushes}\nBJ ${this.state.stats.blackjacks}  Best $${this.state.stats.bestBankroll}`,
		);
	}

	private formatValue(cards: readonly Card[]): string {
		const value = valueHand(cards);
		const natural = isBlackjack(cards) ? ' blackjack' : '';
		return `${value.total}${value.soft ? ' soft' : ''}${natural}`;
	}

	private updateButtons() {
		this.drawBetChip();
		for (const button of this.buttons) {
			const enabled = button.spec.enabled();
			button.box.clear();
			button.box.fillStyle(
				enabled ? COLORS.action : 0x111827,
				enabled ? 0.94 : 0.5,
			);
			button.box.lineStyle(
				1,
				enabled ? COLORS.tableTrim : 0x475569,
				enabled ? 0.9 : 0.42,
			);
			button.box.fillRoundedRect(
				button.spec.x,
				button.spec.y,
				button.spec.w,
				40,
				8,
			);
			button.box.strokeRoundedRect(
				button.spec.x,
				button.spec.y,
				button.spec.w,
				40,
				8,
			);
			button.text.setAlpha(enabled ? 1 : 0.42);
		}
	}

	private drawBetChip() {
		this.betChip.clear();
		this.betChip.fillStyle(0xf8fafc, 1);
		this.betChip.fillCircle(332, 676, 33);
		this.betChip.lineStyle(6, COLORS.tableTrim, 1);
		this.betChip.strokeCircle(332, 676, 33);
		this.betChip.lineStyle(2, COLORS.cardBack, 0.95);
		this.betChip.strokeCircle(332, 676, 22);
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
		if (card.rank === 'A') return 11;
		return Math.min(cardPoints(card), 10);
	}
}

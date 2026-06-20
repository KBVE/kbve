import Phaser from 'phaser';
import { decodeCard } from '@kbve/laser';
import type { BlackjackHandView } from '@kbve/laser';

const SUIT_GLYPH: Record<string, string> = {
	spades: '♠',
	hearts: '♥',
	diamonds: '♦',
	clubs: '♣',
};

const CARD_W = 36;
const CARD_H = 50;
const FAN = 20;

export interface StageState {
	dealer: number[];
	dealerHidden: boolean;
	dealerValue: number | null;
	hands: BlackjackHandView[];
	activeHand: number | null;
	mine: boolean;
	phase: string;
}

/**
 * Phaser centerpiece for the blackjack table: the dealer hand on top and the local
 * player's hand(s) below, rebuilt only when the visual state changes (the React
 * wrapper diffs a signature), with freshly-dealt cards tweened in from the shoe.
 */
export class BlackjackStageScene extends Phaser.Scene {
	private layer!: Phaser.GameObjects.Container;
	private prevKeys = new Set<string>();
	private w = 0;
	private h = 0;

	constructor() {
		super('BlackjackStage');
	}

	create() {
		this.w = this.scale.width;
		this.h = this.scale.height;
		const g = this.add.graphics();
		g.fillStyle(0x0b3d2e, 1);
		g.fillRoundedRect(4, 4, this.w - 8, this.h - 8, 14);
		g.lineStyle(2, 0x0f5740, 1);
		g.strokeRoundedRect(4, 4, this.w - 8, this.h - 8, 14);
		g.fillStyle(0x0d4636, 1);
		g.fillCircle(this.w / 2, 6, this.w * 0.42);
		this.layer = this.add.container(0, 0);
		this.game.events.emit('stage-ready');
	}

	private label(x: number, y: number, text: string, color = '#a7f3d0') {
		const t = this.add
			.text(x, y, text, {
				fontFamily: 'monospace',
				fontSize: '11px',
				color,
			})
			.setOrigin(0.5, 0.5);
		this.layer.add(t);
		return t;
	}

	private card(byte: number, faceDown: boolean) {
		const c = this.add.container(0, 0);
		const bg = this.add
			.rectangle(0, 0, CARD_W, CARD_H, faceDown ? 0x3730a3 : 0xfdfdf7)
			.setStrokeStyle(1, faceDown ? 0x818cf8 : 0x9ca3af);
		c.add(bg);
		if (faceDown) {
			const back = this.add
				.text(0, 0, '🂠', { fontSize: '20px', color: '#c7d2fe' })
				.setOrigin(0.5);
			c.add(back);
		} else {
			const d = decodeCard(byte);
			const col = d.red ? '#dc2626' : '#111827';
			const rank = this.add
				.text(-CARD_W / 2 + 4, -CARD_H / 2 + 3, d.rank, {
					fontFamily: 'monospace',
					fontSize: '12px',
					fontStyle: 'bold',
					color: col,
				})
				.setOrigin(0, 0);
			const suit = this.add
				.text(0, 2, SUIT_GLYPH[d.suit], {
					fontSize: '18px',
					color: col,
				})
				.setOrigin(0.5);
			c.add(rank);
			c.add(suit);
		}
		this.layer.add(c);
		return c;
	}

	private placeHand(
		cards: number[],
		cx: number,
		y: number,
		hideSecond: boolean,
		keyPrefix: string,
		newKeys: Set<string>,
	) {
		const count = cards.length + (hideSecond ? 1 : 0);
		const startX = cx - ((count - 1) * FAN) / 2;
		for (let i = 0; i < cards.length; i++) {
			const key = `${keyPrefix}:${i}:${cards[i]}`;
			newKeys.add(key);
			const x = startX + i * FAN;
			const card = this.card(cards[i], false);
			this.settle(card, x, y, key);
		}
		if (hideSecond) {
			const key = `${keyPrefix}:back`;
			newKeys.add(key);
			const card = this.card(0, true);
			this.settle(card, startX + cards.length * FAN, y, key);
		}
	}

	private settle(
		card: Phaser.GameObjects.Container,
		x: number,
		y: number,
		key: string,
	) {
		if (this.prevKeys.has(key)) {
			card.setPosition(x, y);
			return;
		}
		// Freshly dealt: fly in from the shoe (top-right) with a little spin.
		card.setPosition(this.w - 18, 14)
			.setScale(0.6)
			.setAlpha(0)
			.setAngle(-12);
		this.tweens.add({
			targets: card,
			x,
			y,
			scale: 1,
			alpha: 1,
			angle: 0,
			duration: 240,
			ease: 'Cubic.out',
		});
	}

	renderState(s: StageState) {
		if (!this.layer) return;
		this.layer.removeAll(true);
		const newKeys = new Set<string>();

		this.label(this.w / 2, 14, 'DEALER', '#86efac');
		this.placeHand(s.dealer, this.w / 2, 52, s.dealerHidden, 'd', newKeys);
		if (!s.dealerHidden && s.dealerValue != null) {
			this.label(this.w / 2, 84, `${s.dealerValue}`, '#d1fae5');
		}

		if (s.hands.length === 0) {
			this.label(
				this.w / 2,
				this.h / 2 + 20,
				s.mine ? 'Place your bet…' : 'Spectating',
				'#6b7280',
			);
		}

		// The player's hands fan out across the lower half; splits sit side by side.
		const groups = s.hands.length || 1;
		const slot = this.w / groups;
		s.hands.forEach((hand, hi) => {
			const cx = slot * (hi + 0.5);
			const y = this.h - 64;
			const active = s.activeHand === hi && s.phase === 'player_turn';
			if (active) {
				const glow = this.add
					.rectangle(cx, y, slot - 8, CARD_H + 22, 0xfacc15, 0.16)
					.setStrokeStyle(2, 0xfacc15);
				this.layer.add(glow);
			}
			this.placeHand(hand.cards, cx, y, false, `h${hi}`, newKeys);
			const meta = `${hand.value}${hand.soft ? ' soft' : ''} · ${hand.bet}${hand.doubled ? '·2x' : ''}`;
			this.label(cx, y + 34, meta, '#fcd34d');
			if (hand.outcome) {
				const colors: Record<string, string> = {
					win: '#34d399',
					blackjack: '#34d399',
					push: '#d1d5db',
					loss: '#fb7185',
				};
				this.label(
					cx,
					y - 40,
					hand.outcome === 'blackjack'
						? 'BLACKJACK'
						: hand.outcome.toUpperCase(),
					colors[hand.outcome] ?? '#fff',
				);
			}
		});

		this.prevKeys = newKeys;
	}
}

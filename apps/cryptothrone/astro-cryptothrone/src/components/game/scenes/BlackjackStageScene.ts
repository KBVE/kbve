import Phaser from 'phaser';
import { decodeCard } from '@kbve/laser';
import type { BlackjackHandView } from '@kbve/laser';

const SUIT_GLYPH: Record<string, string> = {
	spades: '♠',
	hearts: '♥',
	diamonds: '♦',
	clubs: '♣',
};

const DEALER_W = 36;
const DEALER_H = 50;
const DEALER_FAN = 20;

const SEAT_W = 26;
const SEAT_H = 36;
const SEAT_FAN = 14;

// Largest-first so a bet breaks into the fewest chips; colour mirrors a real felt.
const CHIPS: { value: number; fill: number; ring: number }[] = [
	{ value: 100, fill: 0x18181b, ring: 0xf4f4f5 },
	{ value: 25, fill: 0x16a34a, ring: 0xbbf7d0 },
	{ value: 5, fill: 0xdc2626, ring: 0xfecaca },
	{ value: 1, fill: 0xf4f4f5, ring: 0x52525b },
];
const MAX_CHIPS = 12;

const OUTCOME_COLOR: Record<string, string> = {
	win: '#34d399',
	blackjack: '#34d399',
	push: '#d1d5db',
	loss: '#fb7185',
};

export interface StageSeat {
	slot: number;
	name: string;
	mine: boolean;
	bet: number;
	insurance: number;
	hands: BlackjackHandView[];
	disconnected: boolean;
}

export interface StageState {
	dealer: number[];
	dealerHidden: boolean;
	dealerValue: number | null;
	seats: StageSeat[];
	activeSlot: number | null;
	activeHand: number | null;
	phase: string;
	mySeated: boolean;
}

/** Greedy breakdown of `amount` into chip denominations, capped at MAX_CHIPS. */
function chipBreakdown(amount: number): number[] {
	const out: number[] = [];
	let rest = amount;
	for (const c of CHIPS) {
		while (rest >= c.value && out.length < MAX_CHIPS) {
			out.push(c.value);
			rest -= c.value;
		}
	}
	return out;
}

/**
 * Phaser centerpiece for the blackjack table: the dealer hand on top and every
 * seated player fanned along an arc below, each with a denomination chip stack
 * for their live bet. Rebuilt only when the visual state changes (the React
 * wrapper diffs a signature); freshly-dealt cards tween in from the shoe.
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

	private label(
		x: number,
		y: number,
		text: string,
		color = '#a7f3d0',
		size = 11,
	) {
		const t = this.add
			.text(x, y, text, {
				fontFamily: 'monospace',
				fontSize: `${size}px`,
				color,
			})
			.setOrigin(0.5, 0.5);
		this.layer.add(t);
		return t;
	}

	private card(byte: number, faceDown: boolean, cw: number, ch: number) {
		const c = this.add.container(0, 0);
		const bg = this.add
			.rectangle(0, 0, cw, ch, faceDown ? 0x3730a3 : 0xfdfdf7)
			.setStrokeStyle(1, faceDown ? 0x818cf8 : 0x9ca3af);
		c.add(bg);
		if (faceDown) {
			const back = this.add
				.text(0, 0, '🂠', { fontSize: '18px', color: '#c7d2fe' })
				.setOrigin(0.5);
			c.add(back);
		} else {
			const d = decodeCard(byte);
			const col = d.red ? '#dc2626' : '#111827';
			const rank = this.add
				.text(-cw / 2 + 3, -ch / 2 + 2, d.rank, {
					fontFamily: 'monospace',
					fontSize: `${Math.round(ch * 0.24)}px`,
					fontStyle: 'bold',
					color: col,
				})
				.setOrigin(0, 0);
			const suit = this.add
				.text(0, 2, SUIT_GLYPH[d.suit], {
					fontSize: `${Math.round(ch * 0.36)}px`,
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
		cw: number,
		ch: number,
		fan: number,
		keyPrefix: string,
		newKeys: Set<string>,
	) {
		const count = cards.length + (hideSecond ? 1 : 0);
		const startX = cx - ((count - 1) * fan) / 2;
		for (let i = 0; i < cards.length; i++) {
			const key = `${keyPrefix}:${i}:${cards[i]}`;
			newKeys.add(key);
			const card = this.card(cards[i], false, cw, ch);
			this.settle(card, startX + i * fan, y, key);
		}
		if (hideSecond) {
			const key = `${keyPrefix}:back`;
			newKeys.add(key);
			const card = this.card(0, true, cw, ch);
			this.settle(card, startX + cards.length * fan, y, key);
		}
	}

	private chipStack(cx: number, baseY: number, amount: number) {
		if (amount <= 0) return;
		const chips = chipBreakdown(amount);
		chips.forEach((value, i) => {
			const spec = CHIPS.find((c) => c.value === value)!;
			const y = baseY - i * 4;
			const e = this.add
				.ellipse(cx, y, 20, 8, spec.fill, 1)
				.setStrokeStyle(1.5, spec.ring);
			this.layer.add(e);
		});
		this.label(
			cx,
			baseY - chips.length * 4 - 9,
			`${amount}`,
			'#fcd34d',
			10,
		);
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

	private renderSeat(
		seat: StageSeat,
		cx: number,
		baseY: number,
		activeSlot: number | null,
		activeHand: number | null,
		phase: string,
		colW: number,
		newKeys: Set<string>,
	) {
		const groups = seat.hands.length || 1;
		const sub = colW / groups;
		const seatActive = activeSlot === seat.slot;

		if (seat.hands.length === 0) {
			this.label(
				cx,
				baseY,
				seat.bet > 0 ? 'waiting…' : 'no bet',
				'#6b7280',
				10,
			);
		}

		seat.hands.forEach((hand, hi) => {
			const hx = cx - colW / 2 + sub * (hi + 0.5);
			const active =
				seatActive && activeHand === hi && phase === 'player_turn';
			if (active) {
				const glow = this.add
					.rectangle(hx, baseY, sub - 4, SEAT_H + 26, 0xfacc15, 0.16)
					.setStrokeStyle(2, 0xfacc15);
				this.layer.add(glow);
			}
			this.placeHand(
				hand.cards,
				hx,
				baseY,
				false,
				SEAT_W,
				SEAT_H,
				SEAT_FAN,
				`s${seat.slot}h${hi}`,
				newKeys,
			);
			const meta = `${hand.value}${hand.soft ? ' soft' : ''}${hand.doubled ? ' 2x' : ''}`;
			this.label(hx, baseY + SEAT_H / 2 + 8, meta, '#fcd34d', 10);
			if (hand.outcome) {
				this.label(
					hx,
					baseY - SEAT_H / 2 - 10,
					hand.outcome === 'blackjack'
						? 'BJ!'
						: hand.outcome.toUpperCase(),
					OUTCOME_COLOR[hand.outcome] ?? '#fff',
					10,
				);
			}
		});

		// Bet chips: live seat bet during betting, else the staked hand bets.
		const staked = seat.hands.reduce((a, h) => a + h.bet, 0) || seat.bet;
		this.chipStack(cx, baseY + SEAT_H / 2 + 36, staked);
		if (seat.insurance > 0) {
			this.label(
				cx,
				baseY + SEAT_H / 2 + 50,
				`ins ${seat.insurance}`,
				'#7dd3fc',
				9,
			);
		}

		const tag = seat.mine
			? `${seat.name} (you)`
			: seat.disconnected
				? `${seat.name} …`
				: seat.name;
		this.label(
			cx,
			this.h - 12,
			tag || 'seat',
			seat.mine ? '#fde047' : seat.disconnected ? '#fb7185' : '#d1d5db',
			11,
		);
	}

	renderState(s: StageState) {
		if (!this.layer) return;
		this.layer.removeAll(true);
		const newKeys = new Set<string>();

		this.label(this.w / 2, 14, 'DEALER', '#86efac');
		this.placeHand(
			s.dealer,
			this.w / 2,
			52,
			s.dealerHidden,
			DEALER_W,
			DEALER_H,
			DEALER_FAN,
			'd',
			newKeys,
		);
		if (!s.dealerHidden && s.dealerValue != null) {
			this.label(this.w / 2, 84, `${s.dealerValue}`, '#d1fae5');
		}

		if (s.seats.length === 0) {
			this.label(
				this.w / 2,
				this.h / 2 + 20,
				s.mySeated ? 'Place your bet…' : 'Spectating',
				'#6b7280',
			);
			this.prevKeys = newKeys;
			return;
		}

		// Seats fan along the lower arc; centre seats sit slightly forward.
		const n = s.seats.length;
		const colW = Math.min(140, (this.w - 24) / n);
		const span = colW * n;
		const left = (this.w - span) / 2 + colW / 2;
		const baseY = this.h - 96;
		s.seats.forEach((seat, i) => {
			const cx = left + i * colW;
			const t = n > 1 ? i / (n - 1) - 0.5 : 0;
			const arc = (0.25 - t * t) * 22;
			this.renderSeat(
				seat,
				cx,
				baseY - arc,
				s.activeSlot,
				s.activeHand,
				s.phase,
				colW,
				newKeys,
			);
		});

		this.prevKeys = newKeys;
	}
}

// ============================================================================
// Solitaire — byte-packed deck primitives + dealing
// ============================================================================
//
// One card = one byte. Bit layout (MSB → LSB):
//   bit 6     face-up flag
//   bits 4-5  suit (0..3)
//   bits 0-3  rank index (0..12 → A..K)
//
// Why pack? With 52 cards, V8's per-object overhead (hidden class +
// properties + GC bookkeeping) costs ~50 bytes/card minimum. A packed
// `Uint8Array` is literally 52 bytes for the entire deck, which makes
// snapshots (`arr.slice()`), undo stacks, and serialization free.
//
// Runtime piles use `number[]` (variable length) for cheap mutation;
// `Uint8Array` is reserved for frozen snapshots and serialization. The UI
// boundary (`toCardView`) inflates a byte into a typed display object so
// the Phaser scene doesn't need to know about bit math.

export const enum SuitByte {
	Spades = 0,
	Hearts = 1,
	Diamonds = 2,
	Clubs = 3,
}

export const enum ColorByte {
	Black = 0,
	Red = 1,
}

export type CardByte = number;

const RANK_MASK = 0b0000_1111;
const SUIT_MASK = 0b0011_0000;
const FACE_UP = 0b0100_0000;

export const SUIT_LABEL = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export const SUIT_GLYPH = ['♠', '♥', '♦', '♣'] as const;

/** Each foundation slot is locked to a specific suit. Order MUST match the
 * scene's foundation slot rendering (left → right) so the visual ♠♥♦♣
 * hints accurately reflect the validation rule. */
export const FOUNDATION_SUITS: readonly SuitByte[] = [
	SuitByte.Spades,
	SuitByte.Hearts,
	SuitByte.Diamonds,
	SuitByte.Clubs,
] as const;
export const RANK_LABEL = [
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
] as const;

export type Suit = (typeof SUIT_LABEL)[number];
export type Color = 'red' | 'black';

export function packCard(
	suit: SuitByte,
	rank: number,
	faceUp = false,
): CardByte {
	return (rank & RANK_MASK) | ((suit & 0b11) << 4) | (faceUp ? FACE_UP : 0);
}

export function getRank(card: CardByte): number {
	return card & RANK_MASK; // 0..12
}

export function getDisplayRank(card: CardByte): number {
	return getRank(card) + 1; // 1..13
}

export function getSuit(card: CardByte): SuitByte {
	return ((card & SUIT_MASK) >> 4) as SuitByte;
}

export function isFaceUp(card: CardByte): boolean {
	return (card & FACE_UP) !== 0;
}

export function setFaceUp(card: CardByte, faceUp: boolean): CardByte {
	return faceUp ? card | FACE_UP : card & ~FACE_UP;
}

export function getColor(card: CardByte): ColorByte {
	const suit = getSuit(card);
	return suit === SuitByte.Hearts || suit === SuitByte.Diamonds
		? ColorByte.Red
		: ColorByte.Black;
}

/** Sentinel rank for joker cards. Real ranks are 0..12 (A..K); 13 is
 * reserved for jokers so a single byte still encodes the whole deck +
 * jokers. The "suit" bit on a joker just picks black vs red color (used
 * for visuals — joker is wild for rule purposes). */
export const JOKER_RANK = 13;

/** Sentinel rank for "bonus" cards — non-rule cards that auto-consume
 * the moment they flip face-up, applying a side-effect (heal, cash, or
 * reveal-a-hidden). The suit byte slot identifies the bonus subtype so
 * each bonus card has a stable id + view. Rank 14 is outside the 0..12
 * playing-card range and outside the joker rank, so the existing rule
 * helpers (`canDropOnTableau`, `canDropOnFoundation`) reject bonus cards
 * automatically — they can never legally be moved by the player. */
export const BONUS_RANK = 14;

export const enum BonusType {
	/** +5 HP (capped at maxHp). */
	HP = 0,
	/** +$5 cash. */
	Cash = 1,
	/** Flip a random face-down tableau card. */
	Reveal = 2,
}

export const BONUS_HP_BYTE: CardByte = (BonusType.HP << 4) | BONUS_RANK;
export const BONUS_CASH_BYTE: CardByte = (BonusType.Cash << 4) | BONUS_RANK;
export const BONUS_REVEAL_BYTE: CardByte = (BonusType.Reveal << 4) | BONUS_RANK;

export function isBonus(card: CardByte): boolean {
	return (card & RANK_MASK) === BONUS_RANK;
}

export function getBonusType(card: CardByte): BonusType {
	// Bonus subtype rides on the suit slot — same byte layout as the
	// joker red/black trick, just repurposed for HP/Cash/Reveal.
	return ((card & SUIT_MASK) >> 4) as BonusType;
}

/** Pre-built joker bytes for convenience. Black joker rides on the spades
 * suit slot, red joker on the hearts slot — those are the two color
 * indices that read correctly through `getColor`. */
export const JOKER_BLACK_BYTE: CardByte = (SuitByte.Spades << 4) | JOKER_RANK;
export const JOKER_RED_BYTE: CardByte = (SuitByte.Hearts << 4) | JOKER_RANK;

export function isJoker(card: CardByte): boolean {
	return (card & RANK_MASK) === JOKER_RANK;
}

/** Joker variants applied per-instance via a side-table on GameState (not
 * encoded in the byte to keep the byte schema stable). Default = Wild. */
export const enum JokerVariant {
	/** Original wild card behavior — no scoring effect. */
	Wild = 0,
	/** +0.5× to foundation score multiplier while sitting in tableau. */
	Multiplier = 1,
	/** +50 flat points added to each foundation placement while in tableau. */
	ScoreBoost = 2,
}

export const JOKER_VARIANT_LABEL: Record<JokerVariant, string> = {
	[JokerVariant.Wild]: 'Wild',
	[JokerVariant.Multiplier]: '×1.5 Mult',
	[JokerVariant.ScoreBoost]: '+50 Score',
};

/** Stable id derived from suit + rank (face-up flag intentionally ignored
 * so the same physical card has one id regardless of orientation). Used
 * as the key for the scene's `Map<id, CardView>`.
 *
 * Memoized — the rule + scene layers call this dozens of times per move
 * (every hover hit-test scans 52 cards). 54 unique outputs total (52 +
 * 2 jokers), so a pre-filled lookup table is the cheapest win possible. */
const ID_CACHE: string[] = (() => {
	const out: string[] = new Array(64);
	for (let suit = 0; suit < 4; suit++) {
		for (let rank = 0; rank < 13; rank++) {
			const idx = (suit << 4) | rank;
			out[idx] = `${SUIT_LABEL[suit][0].toUpperCase()}-${rank + 1}`;
		}
	}
	out[JOKER_BLACK_BYTE] = 'JOKER-BLACK';
	out[JOKER_RED_BYTE] = 'JOKER-RED';
	out[BONUS_HP_BYTE] = 'BONUS-HP';
	out[BONUS_CASH_BYTE] = 'BONUS-CASH';
	out[BONUS_REVEAL_BYTE] = 'BONUS-REVEAL';
	return out;
})();

export function getCardId(card: CardByte): string {
	// Strip face-up bit; only suit+rank identify a card.
	return ID_CACHE[card & (RANK_MASK | SUIT_MASK)];
}

/** Stable integer index for a card's identity (suit + rank, face-up
 * agnostic). Lower 6 bits of the byte. Used as a flat-array key for
 * scene-side view lookup — faster than `Map<string>` because there's no
 * string hashing on every access. Range: 0..63 (only 0..52 populated). */
export function getCardIndex(card: CardByte): number {
	return card & (RANK_MASK | SUIT_MASK);
}

export function getCardLabel(card: CardByte): string {
	if (isJoker(card)) return 'JOKER';
	return `${RANK_LABEL[getRank(card)]}${SUIT_GLYPH[getSuit(card)]}`;
}

/** Build an ordered, face-down 52-byte deck. Caller shuffles. */
export function buildDeckBytes(): Uint8Array {
	const deck = new Uint8Array(52);
	let i = 0;
	for (let suit = 0; suit < 4; suit++) {
		for (let rank = 0; rank < 13; rank++) {
			deck[i++] = packCard(suit as SuitByte, rank, false);
		}
	}
	return deck;
}

/** Fisher-Yates on a byte array. Returns a new array, leaves input alone. */
export function shuffleBytes(
	input: Uint8Array,
	rng: () => number = Math.random,
): Uint8Array {
	const out = input.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = (rng() * (i + 1)) | 0;
		const tmp = out[i];
		out[i] = out[j];
		out[j] = tmp;
	}
	return out;
}

export interface ByteDeal {
	/** 7 tableau columns, lengths 1..7. Top of each column is face-up. */
	tableaus: number[][];
	/** 24 face-down cards. */
	stock: number[];
}

export interface DealOptions {
	/** Add 2 jokers (1 black, 1 red) to the deck before shuffle. Resulting
	 * stock is 26 cards instead of 24; tableau layout (1..7) unchanged. */
	withJokers?: boolean;
	/** Add 3 bonus cards (HP / Cash / Reveal) to the deck before shuffle.
	 * Bonus cards auto-consume the moment they flip face-up, so they show
	 * up as positive surprises during play and never sit in the rule layer. */
	withBonuses?: boolean;
}

export function dealBytes(
	rng: () => number = Math.random,
	options: DealOptions = {},
): ByteDeal {
	const extras: number[] = [];
	if (options.withJokers) {
		extras.push(JOKER_BLACK_BYTE, JOKER_RED_BYTE);
	}
	if (options.withBonuses) {
		extras.push(BONUS_HP_BYTE, BONUS_CASH_BYTE, BONUS_REVEAL_BYTE);
	}
	const base = buildDeckBytes();
	let working: Uint8Array;
	if (extras.length > 0) {
		working = new Uint8Array(base.length + extras.length);
		working.set(base, 0);
		for (let i = 0; i < extras.length; i++) {
			working[base.length + i] = extras[i];
		}
	} else {
		working = base;
	}
	const deck = shuffleBytes(working, rng);

	const tableaus: number[][] = new Array(7);
	let cursor = 0;

	for (let col = 0; col < 7; col++) {
		const column: number[] = new Array(col + 1);
		for (let row = 0; row <= col; row++) {
			let card = deck[cursor++];
			if (row === col) card = setFaceUp(card, true);
			column[row] = card;
		}
		tableaus[col] = column;
	}

	// Stock — copy remainder, ensure all face-down.
	const stock: number[] = new Array(deck.length - cursor);
	for (let i = 0; i < stock.length; i++) {
		stock[i] = setFaceUp(deck[cursor + i], false);
	}

	return { tableaus, stock };
}

// -------------------------------------------------------------------
// UI boundary — inflate a byte to a typed view object once per render
// -------------------------------------------------------------------

export interface CardView {
	id: string;
	suit: Suit;
	glyph: string;
	color: Color;
	rank: number;
	label: string;
	faceUp: boolean;
	/** True for the wild jokers added when `withJokers` deal option is on.
	 * Suit / glyph fields are still populated (with the suit byte the
	 * joker rides on) for convenience but rule logic should branch on
	 * this flag, not on suit. */
	joker: boolean;
	/** Bonus card subtype — undefined for normal cards + jokers. */
	bonus?: BonusType;
}

export function toCardView(card: CardByte): CardView {
	const suit = getSuit(card);
	const color = getColor(card) === ColorByte.Red ? 'red' : 'black';
	const bonus = isBonus(card) ? getBonusType(card) : undefined;
	return {
		id: getCardId(card),
		suit: SUIT_LABEL[suit],
		glyph: SUIT_GLYPH[suit],
		color,
		rank: getDisplayRank(card),
		label: getCardLabel(card),
		faceUp: isFaceUp(card),
		joker: isJoker(card),
		bonus,
	};
}

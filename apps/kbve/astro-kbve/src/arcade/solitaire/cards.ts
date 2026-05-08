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

/** Stable id derived from suit + rank (face-up flag intentionally ignored
 * so the same physical card has one id regardless of orientation). Used
 * as the key for the scene's `Map<id, CardView>`.
 *
 * Memoized — the rule + scene layers call this dozens of times per move
 * (every hover hit-test scans 52 cards). 52 unique outputs total, so a
 * pre-filled lookup table is the cheapest win possible. */
const ID_CACHE: string[] = (() => {
	const out: string[] = new Array(64);
	for (let suit = 0; suit < 4; suit++) {
		for (let rank = 0; rank < 13; rank++) {
			const idx = (suit << 4) | rank;
			out[idx] = `${SUIT_LABEL[suit][0].toUpperCase()}-${rank + 1}`;
		}
	}
	return out;
})();

export function getCardId(card: CardByte): string {
	// Strip face-up bit; only suit+rank identify a card.
	return ID_CACHE[card & (RANK_MASK | SUIT_MASK)];
}

export function getCardLabel(card: CardByte): string {
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

export function dealBytes(rng: () => number = Math.random): ByteDeal {
	const deck = shuffleBytes(buildDeckBytes(), rng);
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
}

export function toCardView(card: CardByte): CardView {
	const suit = getSuit(card);
	const color = getColor(card) === ColorByte.Red ? 'red' : 'black';
	return {
		id: getCardId(card),
		suit: SUIT_LABEL[suit],
		glyph: SUIT_GLYPH[suit],
		color,
		rank: getDisplayRank(card),
		label: getCardLabel(card),
		faceUp: isFaceUp(card),
	};
}

/** Byte-packed deck primitives. One card = one byte:
 *   bit 6     face-up flag
 *   bits 4-5  suit (0..3)
 *   bits 0-3  rank index (0..12 → A..K, 13 → joker, 14-15 → bonus/monster)
 *
 * Snapshots use `Uint8Array` (52 bytes for the whole deck makes undo + ser
 * cheap). Live piles use `number[]` for mutation. `toCardView` inflates a
 * byte to a typed view object once at the UI boundary. */

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
	return card & RANK_MASK;
}

export function getDisplayRank(card: CardByte): number {
	return getRank(card) + 1;
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

/** Sentinel ranks for "bonus" cards — non-rule cards the player drags to
 * the sidebar's ACTIVATE slot to apply a side-effect (heal, cash, or
 * reveal-a-hidden). Ranks 14 + 15 are outside the 0..12 playing-card
 * range and outside the joker rank, so the existing rule helpers
 * (`canDropOnTableau`, `canDropOnFoundation`) reject bonus cards from
 * standard piles automatically. Two ranks lets us encode duplicate
 * variants (e.g. two HP cards) inside the same single-byte schema —
 * each (rank, suit) pair maps to one bonus subtype via the lookup below. */
export const BONUS_RANK_A = 14;
export const BONUS_RANK_B = 15;
const BONUS_RANK_SET = new Set<number>([BONUS_RANK_A, BONUS_RANK_B]);
/** Backwards-compat alias — pre-multi-bonus code referenced this name. */
export const BONUS_RANK = BONUS_RANK_A;

export const enum BonusType {
	/** +5 HP (capped at maxHp). */
	HP = 0,
	/** +$5 cash. */
	Cash = 1,
	/** Mark a random face-down tableau card as peekable on hover. */
	Reveal = 2,
}

/** Bonus byte slots. (rank, suit) is the addressable id; the player sees
 * the variant via the face-renderer. Two of HP/Cash, one Reveal — Reveal
 * already peeks a card so it stays rare. */
export const BONUS_HP_BYTE: CardByte = (0 << 4) | BONUS_RANK_A;
export const BONUS_HP_BYTE_2: CardByte = (3 << 4) | BONUS_RANK_A;
export const BONUS_CASH_BYTE: CardByte = (1 << 4) | BONUS_RANK_A;
export const BONUS_CASH_BYTE_2: CardByte = (0 << 4) | BONUS_RANK_B;
export const BONUS_REVEAL_BYTE: CardByte = (2 << 4) | BONUS_RANK_A;

/** Every bonus card byte the deal can produce, in stable iteration order.
 * Used by `dealBytes` to seed the deck and by the scene to pre-build
 * card views. Adding a new bonus card = add a byte constant + its entry
 * here + a row in `BONUS_TYPE_BY_BYTE`. */
export const ALL_BONUS_BYTES: readonly CardByte[] = [
	BONUS_HP_BYTE,
	BONUS_HP_BYTE_2,
	BONUS_CASH_BYTE,
	BONUS_CASH_BYTE_2,
	BONUS_REVEAL_BYTE,
] as const;

const BONUS_TYPE_BY_BYTE: Map<CardByte, BonusType> = new Map([
	[BONUS_HP_BYTE, BonusType.HP],
	[BONUS_HP_BYTE_2, BonusType.HP],
	[BONUS_CASH_BYTE, BonusType.Cash],
	[BONUS_CASH_BYTE_2, BonusType.Cash],
	[BONUS_REVEAL_BYTE, BonusType.Reveal],
]);

/** Map-based — monster cards share rank=15 with `BONUS_CASH_BYTE_2`, so
 * a rank-only check would misclassify them. */
export function isBonus(card: CardByte): boolean {
	return BONUS_TYPE_BY_BYTE.has(card & (RANK_MASK | SUIT_MASK));
}

export function getBonusType(card: CardByte): BonusType {
	return (
		BONUS_TYPE_BY_BYTE.get(card & (RANK_MASK | SUIT_MASK)) ?? BonusType.HP
	);
}

/** Monster cards reuse rank=15 on suits 1/2/3 (suit 0 is `BONUS_CASH_BYTE_2`).
 * Per-instance combat stats live in `GameState.monsters` keyed by card
 * index. Rules layer treats them as blocking — nothing stacks on them and
 * they can't be dragged; engage via click to attack. */

export const enum MonsterKind {
	Goblin = 0,
	Skeleton = 1,
	Ghoul = 2,
}

export const MONSTER_GOBLIN_BYTE: CardByte = (1 << 4) | BONUS_RANK_B;
export const MONSTER_SKELETON_BYTE: CardByte = (2 << 4) | BONUS_RANK_B;
export const MONSTER_GHOUL_BYTE: CardByte = (3 << 4) | BONUS_RANK_B;

export const ALL_MONSTER_BYTES: readonly CardByte[] = [
	MONSTER_GOBLIN_BYTE,
	MONSTER_SKELETON_BYTE,
	MONSTER_GHOUL_BYTE,
] as const;

const MONSTER_KIND_BY_BYTE: Map<CardByte, MonsterKind> = new Map([
	[MONSTER_GOBLIN_BYTE, MonsterKind.Goblin],
	[MONSTER_SKELETON_BYTE, MonsterKind.Skeleton],
	[MONSTER_GHOUL_BYTE, MonsterKind.Ghoul],
]);

export function isMonster(card: CardByte): boolean {
	return MONSTER_KIND_BY_BYTE.has(card & (RANK_MASK | SUIT_MASK));
}

export function getMonsterKind(card: CardByte): MonsterKind {
	return (
		MONSTER_KIND_BY_BYTE.get(card & (RANK_MASK | SUIT_MASK)) ??
		MonsterKind.Goblin
	);
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
	out[BONUS_HP_BYTE] = 'BONUS-HP-1';
	out[BONUS_HP_BYTE_2] = 'BONUS-HP-2';
	out[BONUS_CASH_BYTE] = 'BONUS-CASH-1';
	out[BONUS_CASH_BYTE_2] = 'BONUS-CASH-2';
	out[BONUS_REVEAL_BYTE] = 'BONUS-REVEAL';
	out[MONSTER_GOBLIN_BYTE] = 'MONSTER-GOBLIN';
	out[MONSTER_SKELETON_BYTE] = 'MONSTER-SKELETON';
	out[MONSTER_GHOUL_BYTE] = 'MONSTER-GHOUL';
	return out;
})();

export function getCardId(card: CardByte): string {
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
	/** Add the full bonus card set (HP / Cash / Reveal variants) to the
	 * deck before shuffle. Player drags bonuses to the sidebar's activate
	 * slot to apply their effect. */
	withBonuses?: boolean;
	/** Add the full monster card set (Goblin / Skeleton / Ghoul) to the
	 * deck before shuffle. Monsters block columns + must be defeated by
	 * clicking. Per-instance combat stats live in `GameState.monsters`. */
	withMonsters?: boolean;
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
		for (const b of ALL_BONUS_BYTES) extras.push(b);
	}
	if (options.withMonsters) {
		for (const b of ALL_MONSTER_BYTES) extras.push(b);
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

	const stock: number[] = new Array(deck.length - cursor);
	for (let i = 0; i < stock.length; i++) {
		stock[i] = setFaceUp(deck[cursor + i], false);
	}

	return { tableaus, stock };
}

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
	/** Monster kind — undefined for non-monster cards. */
	monster?: MonsterKind;
}

export function toCardView(card: CardByte): CardView {
	const suit = getSuit(card);
	const color = getColor(card) === ColorByte.Red ? 'red' : 'black';
	const bonus = isBonus(card) ? getBonusType(card) : undefined;
	const monster = isMonster(card) ? getMonsterKind(card) : undefined;
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
		monster,
	};
}

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
	ALL_BONUS_BYTES,
	ALL_MONSTER_BYTES,
	BONUS_CASH_BYTE,
	BONUS_HP_BYTE,
	BONUS_REVEAL_BYTE,
	BonusType,
	ColorByte,
	FOUNDATION_SUITS,
	IDENTITY_MASK,
	IDENTITY_SLOTS,
	JOKER_BLACK_BYTE,
	JOKER_RANK,
	JOKER_RED_BYTE,
	MONSTER_GHOUL_BYTE,
	MONSTER_GOBLIN_BYTE,
	MONSTER_SKELETON_BYTE,
	MonsterKind,
	RANK_LABEL,
	SUIT_GLYPH,
	SUIT_LABEL,
	SuitByte,
	getBonusType,
	getCardId,
	getCardIndex,
	getColor,
	getDisplayRank,
	getMonsterKind,
	getRank,
	getSuit,
	isBonus,
	isFaceUp,
	isJoker,
	isMonster,
	packCard,
	setFaceUp,
} from './cards';

const SUITS: readonly SuitByte[] = [
	SuitByte.Spades,
	SuitByte.Hearts,
	SuitByte.Diamonds,
	SuitByte.Clubs,
];

describe('cards — byte layout invariants', () => {
	it('IDENTITY_MASK occupies bits 0..6', () => {
		expect(IDENTITY_MASK).toBe(0b0111_1111);
	});

	it('IDENTITY_SLOTS is 128', () => {
		expect(IDENTITY_SLOTS).toBe(128);
	});

	it('SUIT_LABEL / SUIT_GLYPH / FOUNDATION_SUITS all align', () => {
		expect(SUIT_LABEL.length).toBe(4);
		expect(SUIT_GLYPH.length).toBe(4);
		expect(FOUNDATION_SUITS.length).toBe(4);
		expect(RANK_LABEL.length).toBe(13);
	});
});

describe('packCard / getRank / getSuit / isFaceUp', () => {
	it('packs and unpacks (suit, rank, faceUp) round-trip', () => {
		for (const suit of SUITS) {
			for (let rank = 0; rank < 13; rank++) {
				for (const faceUp of [false, true]) {
					const c = packCard(suit, rank, faceUp);
					expect(getSuit(c)).toBe(suit);
					expect(getRank(c)).toBe(rank);
					expect(isFaceUp(c)).toBe(faceUp);
					expect(getDisplayRank(c)).toBe(rank + 1);
				}
			}
		}
	});

	it('setFaceUp(true/false) flips only the face-up bit', () => {
		const base = packCard(SuitByte.Hearts, 5, false);
		const up = setFaceUp(base, true);
		expect(isFaceUp(up)).toBe(true);
		expect(getSuit(up)).toBe(SuitByte.Hearts);
		expect(getRank(up)).toBe(5);

		const down = setFaceUp(up, false);
		expect(isFaceUp(down)).toBe(false);
		expect(down).toBe(base);
	});

	it('masks rank input to 5 bits (no overflow into suit/face)', () => {
		const c = packCard(SuitByte.Diamonds, 0xff, false);
		expect(getSuit(c)).toBe(SuitByte.Diamonds);
		expect(isFaceUp(c)).toBe(false);
	});
});

describe('getColor', () => {
	it('hearts + diamonds are red, spades + clubs are black', () => {
		expect(getColor(packCard(SuitByte.Hearts, 0))).toBe(ColorByte.Red);
		expect(getColor(packCard(SuitByte.Diamonds, 0))).toBe(ColorByte.Red);
		expect(getColor(packCard(SuitByte.Spades, 0))).toBe(ColorByte.Black);
		expect(getColor(packCard(SuitByte.Clubs, 0))).toBe(ColorByte.Black);
	});
});

describe('jokers', () => {
	it('JOKER_BLACK_BYTE and JOKER_RED_BYTE register as jokers', () => {
		expect(isJoker(JOKER_BLACK_BYTE)).toBe(true);
		expect(isJoker(JOKER_RED_BYTE)).toBe(true);
		expect(getRank(JOKER_BLACK_BYTE)).toBe(JOKER_RANK);
		expect(getColor(JOKER_BLACK_BYTE)).toBe(ColorByte.Black);
		expect(getColor(JOKER_RED_BYTE)).toBe(ColorByte.Red);
	});

	it('regular cards are not jokers', () => {
		for (const suit of SUITS) {
			for (let rank = 0; rank < 13; rank++) {
				expect(isJoker(packCard(suit, rank))).toBe(false);
			}
		}
	});

	it('face-up flag does not affect joker detection', () => {
		expect(isJoker(setFaceUp(JOKER_BLACK_BYTE, true))).toBe(true);
		expect(isJoker(setFaceUp(JOKER_RED_BYTE, false))).toBe(true);
	});
});

describe('bonus cards', () => {
	it('every byte in ALL_BONUS_BYTES is detected as bonus', () => {
		for (const b of ALL_BONUS_BYTES) {
			expect(isBonus(b)).toBe(true);
		}
	});

	it('non-bonus playing cards return false', () => {
		for (const suit of SUITS) {
			for (let rank = 0; rank < 13; rank++) {
				expect(isBonus(packCard(suit, rank))).toBe(false);
			}
		}
	});

	it('getBonusType returns the correct subtype', () => {
		expect(getBonusType(BONUS_HP_BYTE)).toBe(BonusType.HP);
		expect(getBonusType(BONUS_CASH_BYTE)).toBe(BonusType.Cash);
		expect(getBonusType(BONUS_REVEAL_BYTE)).toBe(BonusType.Reveal);
	});

	it('getBonusType on non-bonus card falls back to HP (sentinel default)', () => {
		const regular = packCard(SuitByte.Spades, 0);
		expect(getBonusType(regular)).toBe(BonusType.HP);
		expect(isBonus(regular)).toBe(false);
	});
});

describe('monster cards', () => {
	it('every monster byte is detected', () => {
		for (const b of ALL_MONSTER_BYTES) {
			expect(isMonster(b)).toBe(true);
		}
	});

	it('getMonsterKind returns the correct kind', () => {
		expect(getMonsterKind(MONSTER_GOBLIN_BYTE)).toBe(MonsterKind.Goblin);
		expect(getMonsterKind(MONSTER_SKELETON_BYTE)).toBe(
			MonsterKind.Skeleton,
		);
		expect(getMonsterKind(MONSTER_GHOUL_BYTE)).toBe(MonsterKind.Ghoul);
	});

	it('bonus and monster sets are disjoint', () => {
		for (const b of ALL_BONUS_BYTES) {
			expect(isMonster(b)).toBe(false);
		}
		for (const m of ALL_MONSTER_BYTES) {
			expect(isBonus(m)).toBe(false);
		}
	});
});

describe('getCardId / getCardIndex', () => {
	it('every regular card has a stable id of the form "S-R"', () => {
		for (const suit of SUITS) {
			for (let rank = 0; rank < 13; rank++) {
				const c = packCard(suit, rank, false);
				const id = getCardId(c);
				expect(id).toMatch(/^[SHDC]-\d+$/);
				const same = packCard(suit, rank, true);
				expect(getCardId(same)).toBe(id);
			}
		}
	});

	it('jokers, bonuses, monsters all have named ids', () => {
		expect(getCardId(JOKER_BLACK_BYTE)).toBe('JOKER-BLACK');
		expect(getCardId(JOKER_RED_BYTE)).toBe('JOKER-RED');
		expect(getCardId(BONUS_HP_BYTE)).toBe('BONUS-HP-1');
		expect(getCardId(MONSTER_GOBLIN_BYTE)).toBe('MONSTER-GOBLIN');
	});

	it('getCardIndex returns the low 7 bits, ignoring face-up flag', () => {
		const c = packCard(SuitByte.Clubs, 9, false);
		const flipped = setFaceUp(c, true);
		expect(getCardIndex(c)).toBe(getCardIndex(flipped));
		expect(getCardIndex(c)).toBeGreaterThanOrEqual(0);
		expect(getCardIndex(c)).toBeLessThan(IDENTITY_SLOTS);
	});
});

describe('fuzz — byte layout is total', () => {
	const arbCard = fc.integer({ min: 0, max: 255 });

	it('getRank always returns 0..31, getSuit always returns 0..3', () => {
		fc.assert(
			fc.property(arbCard, (c) => {
				const r = getRank(c);
				const s = getSuit(c);
				return r >= 0 && r <= 31 && s >= 0 && s <= 3;
			}),
			{ numRuns: 1000 },
		);
	});

	it('isFaceUp is a pure bit-7 read', () => {
		fc.assert(
			fc.property(arbCard, (c) => isFaceUp(c) === ((c & 0x80) !== 0)),
			{ numRuns: 500 },
		);
	});

	it('setFaceUp(c, true) then setFaceUp(_, false) is identity (modulo face)', () => {
		fc.assert(
			fc.property(arbCard, (c) => {
				const up = setFaceUp(c, true);
				const down = setFaceUp(up, false);
				return (
					(down & 0x7f) === (c & 0x7f) &&
					isFaceUp(up) === true &&
					isFaceUp(down) === false
				);
			}),
			{ numRuns: 500 },
		);
	});

	it('isJoker / isBonus / isMonster are mutually exclusive on every byte', () => {
		fc.assert(
			fc.property(arbCard, (c) => {
				const flags = [isJoker(c), isBonus(c), isMonster(c)].filter(
					Boolean,
				).length;
				return flags <= 1;
			}),
			{ numRuns: 1000 },
		);
	});

	it('getCardId never throws and returns either string or undefined for any byte', () => {
		fc.assert(
			fc.property(arbCard, (c) => {
				const id = getCardId(c);
				return typeof id === 'string' || typeof id === 'undefined';
			}),
			{ numRuns: 500 },
		);
	});
});

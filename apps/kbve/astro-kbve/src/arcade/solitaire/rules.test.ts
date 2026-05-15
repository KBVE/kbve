import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
	JOKER_BLACK_BYTE,
	JOKER_RED_BYTE,
	MONSTER_GOBLIN_BYTE,
	SuitByte,
	packCard,
	setFaceUp,
} from './cards';

const JOKER_BLACK_FACEUP = setFaceUp(JOKER_BLACK_BYTE, true);
const JOKER_RED_FACEUP = setFaceUp(JOKER_RED_BYTE, true);
const MONSTER_GOBLIN_FACEUP = setFaceUp(MONSTER_GOBLIN_BYTE, true);
import {
	canDropOnFoundation,
	canDropOnTableau,
	isMovableRun,
	isWin,
	movableRun,
} from './rules';

const c = (suit: SuitByte, rank: number, faceUp = true) =>
	packCard(suit, rank, faceUp);

const RED_KING = c(SuitByte.Hearts, 12);
const BLACK_KING = c(SuitByte.Spades, 12);
const RED_QUEEN = c(SuitByte.Hearts, 11);
const BLACK_QUEEN = c(SuitByte.Spades, 11);
const RED_JACK = c(SuitByte.Diamonds, 10);
const BLACK_JACK = c(SuitByte.Clubs, 10);
const ACE_SPADES = c(SuitByte.Spades, 0);

describe('canDropOnTableau', () => {
	it('king can land on empty column', () => {
		expect(canDropOnTableau(RED_KING, [])).toBe(true);
		expect(canDropOnTableau(BLACK_KING, [])).toBe(true);
	});

	it('non-king cannot land on empty column', () => {
		expect(canDropOnTableau(RED_QUEEN, [])).toBe(false);
		expect(canDropOnTableau(ACE_SPADES, [])).toBe(false);
	});

	it('opposite color, one rank lower lands on top', () => {
		expect(canDropOnTableau(RED_QUEEN, [BLACK_KING])).toBe(true);
		expect(canDropOnTableau(BLACK_QUEEN, [RED_KING])).toBe(true);
	});

	it('same color is rejected', () => {
		expect(canDropOnTableau(RED_QUEEN, [RED_KING])).toBe(false);
		expect(canDropOnTableau(BLACK_QUEEN, [BLACK_KING])).toBe(false);
	});

	it('wrong rank gap is rejected', () => {
		expect(canDropOnTableau(RED_JACK, [BLACK_KING])).toBe(false);
		expect(canDropOnTableau(c(SuitByte.Spades, 10), [RED_KING])).toBe(
			false,
		);
	});

	it('face-down top blocks any drop', () => {
		expect(
			canDropOnTableau(RED_QUEEN, [setFaceUp(BLACK_KING, false)]),
		).toBe(false);
	});

	it('joker is wild — drops on anything face-up, plays as anything', () => {
		expect(canDropOnTableau(JOKER_BLACK_BYTE, [])).toBe(true);
		expect(canDropOnTableau(JOKER_RED_BYTE, [BLACK_KING])).toBe(true);
		expect(canDropOnTableau(RED_QUEEN, [JOKER_BLACK_FACEUP])).toBe(true);
	});

	it('monster card cannot be dropped, monster on top blocks drop', () => {
		expect(canDropOnTableau(MONSTER_GOBLIN_BYTE, [])).toBe(false);
		expect(canDropOnTableau(RED_QUEEN, [MONSTER_GOBLIN_FACEUP])).toBe(
			false,
		);
	});
});

describe('canDropOnFoundation', () => {
	it('ace starts the foundation', () => {
		expect(canDropOnFoundation(ACE_SPADES, [])).toBe(true);
	});

	it('non-ace rejected on empty foundation', () => {
		expect(canDropOnFoundation(c(SuitByte.Spades, 1), [])).toBe(false);
		expect(canDropOnFoundation(RED_KING, [])).toBe(false);
	});

	it('rank N+1 stacks on a foundation of length N', () => {
		const foundation = [ACE_SPADES];
		expect(canDropOnFoundation(c(SuitByte.Spades, 1), foundation)).toBe(
			true,
		);
	});

	it('wrong rank rejected', () => {
		const foundation = [ACE_SPADES];
		expect(canDropOnFoundation(c(SuitByte.Spades, 2), foundation)).toBe(
			false,
		);
	});

	it('full foundation (13 cards) is locked', () => {
		const full = Array.from({ length: 13 }, (_, i) =>
			c(SuitByte.Spades, i),
		);
		expect(canDropOnFoundation(c(SuitByte.Spades, 12), full)).toBe(false);
	});

	it('joker and monster always rejected on foundation', () => {
		expect(canDropOnFoundation(JOKER_BLACK_FACEUP, [])).toBe(false);
		expect(canDropOnFoundation(MONSTER_GOBLIN_BYTE, [])).toBe(false);
	});
});

describe('movableRun / isMovableRun', () => {
	it('single face-up card at the bottom is a movable run', () => {
		const col = [setFaceUp(RED_KING, true)];
		expect(isMovableRun(col, 0)).toBe(true);
		expect(movableRun(col, 0)).toEqual([RED_KING]);
	});

	it('valid alternating descending run is movable', () => {
		const col = [BLACK_KING, RED_QUEEN, BLACK_JACK];
		expect(isMovableRun(col, 0)).toBe(true);
		expect(movableRun(col, 0)).toEqual([BLACK_KING, RED_QUEEN, BLACK_JACK]);
	});

	it('invalid alternation breaks the run', () => {
		const col = [BLACK_KING, BLACK_QUEEN];
		expect(isMovableRun(col, 0)).toBe(false);
		expect(movableRun(col, 0)).toBeNull();
	});

	it('face-down card in the run is rejected', () => {
		const col = [setFaceUp(BLACK_KING, false), setFaceUp(RED_QUEEN, true)];
		expect(isMovableRun(col, 0)).toBe(false);
		expect(movableRun(col, 0)).toBeNull();
	});

	it('joker acts as a wildcard inside a run', () => {
		const col = [BLACK_KING, JOKER_RED_FACEUP, BLACK_JACK];
		expect(isMovableRun(col, 0)).toBe(true);
	});

	it('monster in column breaks the run', () => {
		const col = [BLACK_KING, MONSTER_GOBLIN_FACEUP];
		expect(isMovableRun(col, 0)).toBe(false);
	});

	it('out-of-range fromIndex returns null/false', () => {
		const col = [BLACK_KING];
		expect(isMovableRun(col, -1)).toBe(false);
		expect(isMovableRun(col, 5)).toBe(false);
		expect(movableRun(col, -1)).toBeNull();
		expect(movableRun(col, 5)).toBeNull();
	});

	it('partial slice from middle is movable when bottom alternates', () => {
		const col = [BLACK_KING, RED_QUEEN, BLACK_JACK];
		expect(isMovableRun(col, 1)).toBe(true);
		expect(movableRun(col, 1)).toEqual([RED_QUEEN, BLACK_JACK]);
	});
});

describe('isWin', () => {
	it('all four foundations holding 13 cards = win', () => {
		const full = Array.from({ length: 13 }, (_, i) =>
			c(SuitByte.Spades, i),
		);
		expect(isWin([full, full, full, full])).toBe(true);
	});

	it('not all 13 = no win', () => {
		const full = Array.from({ length: 13 }, (_, i) =>
			c(SuitByte.Spades, i),
		);
		const partial = full.slice(0, 12);
		expect(isWin([full, full, full, partial])).toBe(false);
	});

	it('wrong number of foundations = no win', () => {
		expect(isWin([])).toBe(false);
		expect(isWin([[], [], []])).toBe(false);
	});
});

describe('fuzz — rule purity', () => {
	const arbCard = fc.integer({ min: 0, max: 0xff });
	const arbColumn = fc.array(arbCard, { maxLength: 13 });

	it('canDropOnTableau never throws on random bytes', () => {
		fc.assert(
			fc.property(arbCard, arbColumn, (card, col) => {
				expect(() => canDropOnTableau(card, col)).not.toThrow();
				expect(typeof canDropOnTableau(card, col)).toBe('boolean');
			}),
			{ numRuns: 500 },
		);
	});

	it('canDropOnFoundation never throws and returns boolean', () => {
		fc.assert(
			fc.property(arbCard, arbColumn, (card, col) => {
				const r = canDropOnFoundation(card, col);
				return typeof r === 'boolean';
			}),
			{ numRuns: 500 },
		);
	});

	it('isMovableRun and movableRun agree on success/failure', () => {
		fc.assert(
			fc.property(
				arbColumn,
				fc.integer({ min: -2, max: 15 }),
				(col, i) => {
					const predicate = isMovableRun(col, i);
					const materialized = movableRun(col, i);
					return predicate === (materialized !== null);
				},
			),
			{ numRuns: 500 },
		);
	});

	it('isWin requires exactly 4 entries of length 13 — never throws on garbage shapes', () => {
		fc.assert(
			fc.property(fc.array(arbColumn), (foundations) => {
				const r = isWin(foundations);
				if (
					foundations.length === 4 &&
					foundations.every((f) => f.length === 13)
				) {
					return r === true;
				}
				return r === false;
			}),
			{ numRuns: 200 },
		);
	});
});

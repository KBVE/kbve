/** Pure rule helpers — byte primitives in, no allocations. Keeping the
 * rule layer byte-native lets the engine run headless (replay
 * verification, AI hints, etc) without dragging UI shape along. */

import {
	type CardByte,
	getColor,
	getDisplayRank,
	getSuit,
	isFaceUp,
	isJoker,
	isMonster,
} from './cards';

/** Tableau move: card(s) can land on a tableau column iff
 *   - moving card is a joker (always valid), OR
 *   - column empty AND moving card is K, OR
 *   - column top is face-up joker (always valid), OR
 *   - column top is face-up AND opposite color AND exactly one rank higher. */
export function canDropOnTableau(moving: CardByte, column: number[]): boolean {
	if (isMonster(moving)) return false;
	if (isJoker(moving)) return true;
	if (column.length === 0) return getDisplayRank(moving) === 13;

	const top = column[column.length - 1];
	if (!isFaceUp(top)) return false;
	if (isMonster(top)) return false;
	if (isJoker(top)) return true;

	const colorOk = getColor(moving) !== getColor(top);
	const rankOk = getDisplayRank(moving) === getDisplayRank(top) - 1;
	return colorOk && rankOk;
}

/** Foundation move: only single cards. Jokers REJECTED — they live in
 * tableau only. Foundations build A..K by rank; suit-lock is enforced
 * separately in `state.ts` via FOUNDATION_SUITS[idx]. */
export function canDropOnFoundation(
	moving: CardByte,
	foundation: number[],
): boolean {
	if (isJoker(moving) || isMonster(moving)) return false;
	if (foundation.length === 13) return false;
	const expectedRank = foundation.length + 1;
	return getDisplayRank(moving) === expectedRank;
}

/** A run of cards in a tableau column is "movable" iff every card from the
 * grabbed index to the bottom is face-up AND adjacent pairs satisfy the
 * tableau alternation rule (opposite color, descending rank).
 *
 * Joker handling: if either card in an adjacent pair is a joker, the pair
 * is automatically valid (joker substitutes for whatever the rule needs). */
export function movableRun(
	column: number[],
	fromIndex: number,
): number[] | null {
	const len = column.length;
	if (fromIndex < 0 || fromIndex >= len) return null;
	for (let i = fromIndex; i < len; i++) {
		const c = column[i];
		if (!isFaceUp(c)) return null;
		if (isMonster(c)) return null;
		if (i === fromIndex) continue;
		const prev = column[i - 1];
		if (isJoker(c) || isJoker(prev)) continue;
		const colorOk = getColor(c) !== getColor(prev);
		const rankOk = getDisplayRank(c) === getDisplayRank(prev) - 1;
		if (!(colorOk && rankOk)) return null;
	}
	const out: number[] = new Array(len - fromIndex);
	for (let i = fromIndex; i < len; i++) out[i - fromIndex] = column[i];
	return out;
}

/** Zero-alloc predicate variant — true iff `movableRun` would succeed.
 * Use for hover/hit-test paths that don't need the materialized array. */
export function isMovableRun(column: number[], fromIndex: number): boolean {
	const len = column.length;
	if (fromIndex < 0 || fromIndex >= len) return false;
	for (let i = fromIndex; i < len; i++) {
		const c = column[i];
		if (!isFaceUp(c)) return false;
		if (isMonster(c)) return false;
		if (i === fromIndex) continue;
		const prev = column[i - 1];
		if (isJoker(c) || isJoker(prev)) continue;
		const colorOk = getColor(c) !== getColor(prev);
		const rankOk = getDisplayRank(c) === getDisplayRank(prev) - 1;
		if (!(colorOk && rankOk)) return false;
	}
	return true;
}

/** All four foundations holding 13 cards = win. With jokers in the mix the
 * top of a winning foundation may be a joker (claiming K), which we count
 * as a valid 13-card stack. */
export function isWin(foundations: number[][]): boolean {
	if (foundations.length !== 4) return false;
	for (let i = 0; i < 4; i++) {
		if (foundations[i].length !== 13) return false;
	}
	return true;
}

export { isJoker, getSuit };

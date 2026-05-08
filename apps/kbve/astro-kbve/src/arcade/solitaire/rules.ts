// ============================================================================
// Solitaire — move validation (byte-packed)
// ============================================================================
//
// Pure rule helpers. All inputs are byte primitives — no allocations, no
// inflation to view objects. The scene calls these millions of times less
// than the renderer, but keeping the rule layer byte-native means the
// engine can run headless (replay verification, AI hints, etc) without
// dragging in any UI shape.

import {
	type CardByte,
	getColor,
	getDisplayRank,
	getSuit,
	isFaceUp,
} from './cards';

/** Tableau move: card(s) can land on a tableau column iff
 *   - column empty AND moving card is K, OR
 *   - column top is face-up AND opposite color AND exactly one rank higher. */
export function canDropOnTableau(moving: CardByte, column: number[]): boolean {
	const movingRank = getDisplayRank(moving);
	if (column.length === 0) return movingRank === 13;

	const top = column[column.length - 1];
	if (!isFaceUp(top)) return false;

	const colorOk = getColor(moving) !== getColor(top);
	const rankOk = movingRank === getDisplayRank(top) - 1;
	return colorOk && rankOk;
}

/** Foundation move: only single cards.
 *   - empty foundation accepts only A
 *   - non-empty foundation accepts same suit, exactly one rank higher than top */
export function canDropOnFoundation(
	moving: CardByte,
	foundation: number[],
): boolean {
	const movingRank = getDisplayRank(moving);
	if (foundation.length === 0) return movingRank === 1;

	const top = foundation[foundation.length - 1];
	return (
		getSuit(moving) === getSuit(top) &&
		movingRank === getDisplayRank(top) + 1
	);
}

/** A run of cards in a tableau column is "movable" iff every card from the
 * grabbed index to the bottom is face-up AND alternating-color AND
 * descending by rank. Returns the slice (as a fresh array) if movable. */
export function movableRun(
	column: number[],
	fromIndex: number,
): number[] | null {
	if (fromIndex < 0 || fromIndex >= column.length) return null;

	const slice = column.slice(fromIndex);
	for (let i = 0; i < slice.length; i++) {
		const c = slice[i];
		if (!isFaceUp(c)) return null;
		if (i === 0) continue;
		const prev = slice[i - 1];
		const colorOk = getColor(c) !== getColor(prev);
		const rankOk = getDisplayRank(c) === getDisplayRank(prev) - 1;
		if (!(colorOk && rankOk)) return null;
	}
	return slice;
}

/** All four foundations holding K = win. */
export function isWin(foundations: number[][]): boolean {
	if (foundations.length !== 4) return false;
	for (let i = 0; i < 4; i++) {
		const f = foundations[i];
		if (f.length !== 13) return false;
		if (getDisplayRank(f[12]) !== 13) return false;
	}
	return true;
}

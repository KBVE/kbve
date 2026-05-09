// ============================================================================
// Solitaire — move validation (byte-packed)
// ============================================================================
//
// Pure rule helpers. All inputs are byte primitives — no allocations, no
// inflation to view objects. The scene calls these millions of times less
// than the renderer, but keeping the rule layer byte-native means the
// engine can run headless (replay verification, AI hints, etc) without
// dragging in any UI shape.
//
// Joker rules (tableau wild + foundation reject variant):
//   - Joker can land on ANY tableau column (empty or not).
//   - When a joker is the top of a tableau column, ANY card stacks on it.
//   - Joker is REJECTED from foundations — the win condition (4 piles of
//     A..K by suit) is preserved cleanly. Jokers are wild for tableau
//     manipulation only.
//   - In a multi-card tableau run, joker is wild — adjacent cards' rank
//     and color constraints are bypassed when one of the two is a joker.

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
	// Monsters can't be moved (they engage in combat instead of stacking).
	if (isMonster(moving)) return false;

	if (isJoker(moving)) return true;

	if (column.length === 0) return getDisplayRank(moving) === 13;

	const top = column[column.length - 1];
	if (!isFaceUp(top)) return false;

	// Monster on top blocks the column — combat first, stacking later.
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
	if (fromIndex < 0 || fromIndex >= column.length) return null;

	const slice = column.slice(fromIndex);
	for (let i = 0; i < slice.length; i++) {
		const c = slice[i];
		if (!isFaceUp(c)) return null;
		// Monsters refuse to be picked up — engage them with a click instead.
		if (isMonster(c)) return null;
		if (i === 0) continue;
		const prev = slice[i - 1];
		// Joker is wild — bypasses both color + rank checks for this link.
		if (isJoker(c) || isJoker(prev)) continue;
		const colorOk = getColor(c) !== getColor(prev);
		const rankOk = getDisplayRank(c) === getDisplayRank(prev) - 1;
		if (!(colorOk && rankOk)) return null;
	}
	return slice;
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

// Re-export so consumers can import everything joker-related from one place.
export { isJoker, getSuit };

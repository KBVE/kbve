import { maxLevelOf, xpForLevel } from '../data/professiondb';

// Session-only progression. Deliberately not persisted — profession state is
// runtime state each game owns, and herbmail has no save layer yet.

interface ProgressState {
	xp: number;
	level: number;
}

const state = new Map<string, ProgressState>();
const listeners = new Set<() => void>();

function slot(ref: string): ProgressState {
	let s = state.get(ref);
	if (!s) state.set(ref, (s = { xp: 0, level: 1 }));
	return s;
}

export function levelOf(ref: string): number {
	return slot(ref).level;
}

export function xpOf(ref: string): number {
	return slot(ref).xp;
}

/** XP still owed before the next level, or 0 at the ceiling. */
export function xpToNext(ref: string): number {
	const s = slot(ref);
	if (s.level >= maxLevelOf(ref)) return 0;
	return Math.max(0, xpForLevel(ref, s.level + 1) - s.xp);
}

/** Grants xp and rolls the level up as far as the curve allows. Returns the
 * number of levels gained so callers can fire a notification. */
export function grantXp(ref: string, amount: number): number {
	if (amount <= 0) return 0;
	const s = slot(ref);
	const cap = maxLevelOf(ref);
	s.xp += amount;
	let gained = 0;
	while (s.level < cap && s.xp >= xpForLevel(ref, s.level + 1)) {
		s.level++;
		gained++;
	}
	emit();
	return gained;
}

export function resetProfessions(): void {
	state.clear();
	emit();
}

function emit(): void {
	for (const l of listeners) l();
}

export function subscribeProfessions(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

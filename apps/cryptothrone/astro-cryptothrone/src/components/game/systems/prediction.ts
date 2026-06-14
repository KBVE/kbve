import type { Dir } from '@kbve/laser';
import type { TileXY } from './netSync';

export type IsBlocked = (x: number, y: number) => boolean;

export const DIR_DELTA: Record<Dir, TileXY> = {
	Up: { x: 0, y: -1 },
	Down: { x: 0, y: 1 },
	Left: { x: -1, y: 0 },
	Right: { x: 1, y: 0 },
};

/**
 * Client-side movement prediction: a predicted cursor that walks one tile per
 * tick while the server runs its own authoritative move. `path` is the queued
 * click-route; `seeded` gates prediction until the local player first appears
 * in a snapshot (see netSync). Pure state — Phaser/gridEngine effects stay in
 * the scene, which mirrors `predicted` after each commit.
 */
export interface PredictState {
	predicted: TileXY;
	path: TileXY[];
	seeded: boolean;
}

/**
 * Resolve a keyboard step. Keyboard always interrupts an active click-path, so
 * `path` is cleared regardless. Returns the tile to advance onto, or null when
 * unseeded or the candidate is blocked (the caller still steps the server).
 */
export function stepDir(
	state: PredictState,
	dir: Dir,
	isBlocked: IsBlocked,
): TileXY | null {
	state.path = [];
	if (!state.seeded) return null;
	const delta = DIR_DELTA[dir];
	const cand = {
		x: state.predicted.x + delta.x,
		y: state.predicted.y + delta.y,
	};
	return isBlocked(cand.x, cand.y) ? null : cand;
}

/**
 * Advance one tile along the active click-path. Returns the next tile, or null
 * when the path is empty or its next tile became blocked — in which case the
 * stale path is dropped so prediction doesn't push into a wall.
 */
export function followPath(
	state: PredictState,
	isBlocked: IsBlocked,
): TileXY | null {
	if (state.path.length === 0) return null;
	const next = state.path.shift()!;
	if (isBlocked(next.x, next.y)) {
		state.path = [];
		return null;
	}
	return next;
}

/** Move the predicted cursor onto a committed tile. */
export function commitPredicted(state: PredictState, tile: TileXY): void {
	state.predicted = { x: tile.x, y: tile.y };
}

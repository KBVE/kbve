import type { Dir } from '@kbve/laser';
import type { TileXY } from '../iso';

export type IsBlocked = (x: number, y: number) => boolean;

export const DIR_DELTA: Record<Dir, TileXY> = {
	Up: { x: 0, y: -1 },
	Down: { x: 0, y: 1 },
	Left: { x: -1, y: 0 },
	Right: { x: 1, y: 0 },
};

export interface PredictState {
	predicted: TileXY;
	path: TileXY[];
	seeded: boolean;
}

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

export function commitPredicted(state: PredictState, tile: TileXY): void {
	state.predicted = { x: tile.x, y: tile.y };
}

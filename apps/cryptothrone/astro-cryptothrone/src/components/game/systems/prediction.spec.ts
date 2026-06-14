import { describe, it, expect } from 'vitest';
import {
	stepDir,
	followPath,
	commitPredicted,
	DIR_DELTA,
	type PredictState,
	type IsBlocked,
} from './prediction';

const OPEN: IsBlocked = () => false;
const wall =
	(...tiles: [number, number][]): IsBlocked =>
	(x, y) =>
		tiles.some(([tx, ty]) => tx === x && ty === y);

function state(p: Partial<PredictState> = {}): PredictState {
	return {
		predicted: { x: 5, y: 5 },
		path: [],
		seeded: true,
		...p,
	};
}

describe('DIR_DELTA', () => {
	it('maps the four cardinals to unit steps', () => {
		expect(DIR_DELTA.Up).toEqual({ x: 0, y: -1 });
		expect(DIR_DELTA.Down).toEqual({ x: 0, y: 1 });
		expect(DIR_DELTA.Left).toEqual({ x: -1, y: 0 });
		expect(DIR_DELTA.Right).toEqual({ x: 1, y: 0 });
	});
});

describe('stepDir', () => {
	it('returns the adjacent tile in the pressed direction', () => {
		expect(stepDir(state(), 'Right', OPEN)).toEqual({ x: 6, y: 5 });
		expect(stepDir(state(), 'Up', OPEN)).toEqual({ x: 5, y: 4 });
	});

	it('returns null when unseeded', () => {
		expect(stepDir(state({ seeded: false }), 'Right', OPEN)).toBeNull();
	});

	it('returns null when the candidate tile is blocked', () => {
		expect(stepDir(state(), 'Right', wall([6, 5]))).toBeNull();
	});

	it('clears an active click-path even when blocked (keyboard interrupts)', () => {
		const s = state({
			path: [
				{ x: 6, y: 5 },
				{ x: 7, y: 5 },
			],
		});
		stepDir(s, 'Right', wall([6, 5]));
		expect(s.path).toEqual([]);
	});
});

describe('followPath', () => {
	it('shifts and returns the next path tile', () => {
		const s = state({
			path: [
				{ x: 6, y: 5 },
				{ x: 7, y: 5 },
			],
		});
		expect(followPath(s, OPEN)).toEqual({ x: 6, y: 5 });
		expect(s.path).toEqual([{ x: 7, y: 5 }]);
	});

	it('returns null on an empty path', () => {
		expect(followPath(state(), OPEN)).toBeNull();
	});

	it('drops the whole path when the next tile is blocked', () => {
		const s = state({
			path: [
				{ x: 6, y: 5 },
				{ x: 7, y: 5 },
			],
		});
		expect(followPath(s, wall([6, 5]))).toBeNull();
		expect(s.path).toEqual([]);
	});
});

describe('commitPredicted', () => {
	it('moves the cursor and copies (no aliasing)', () => {
		const s = state();
		const tile = { x: 9, y: 2 };
		commitPredicted(s, tile);
		expect(s.predicted).toEqual({ x: 9, y: 2 });
		tile.x = 0;
		expect(s.predicted.x).toBe(9);
	});

	it('walks a click-path tile by tile to its destination', () => {
		const s = state({
			predicted: { x: 0, y: 0 },
			path: [
				{ x: 1, y: 0 },
				{ x: 2, y: 0 },
				{ x: 2, y: 1 },
			],
		});
		let next: ReturnType<typeof followPath>;
		while ((next = followPath(s, OPEN))) commitPredicted(s, next);
		expect(s.predicted).toEqual({ x: 2, y: 1 });
		expect(s.path).toEqual([]);
	});
});

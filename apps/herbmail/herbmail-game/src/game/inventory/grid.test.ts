import { describe, it, expect } from 'vitest';
import {
	COLS,
	ROWS,
	rotate,
	canPlace,
	firstFit,
	autoSort,
	type Rect,
	type SortItem,
} from './grid';

describe('rotate', () => {
	it('keeps footprint when rot=0', () => {
		expect(rotate({ w: 1, h: 3 }, 0)).toEqual({ w: 1, h: 3 });
	});
	it('swaps w/h when rot=1', () => {
		expect(rotate({ w: 1, h: 3 }, 1)).toEqual({ w: 3, h: 1 });
	});
});

describe('canPlace', () => {
	const occ: Rect[] = [{ uid: 1, x: 0, y: 0, w: 2, h: 2 }];

	it('rejects out-of-bounds', () => {
		expect(canPlace([], COLS - 1, 0, 2, 1)).toBe(false);
		expect(canPlace([], 0, ROWS - 1, 1, 2)).toBe(false);
		expect(canPlace([], -1, 0, 1, 1)).toBe(false);
	});
	it('rejects overlap', () => {
		expect(canPlace(occ, 1, 1, 2, 2)).toBe(false);
	});
	it('accepts a clear cell', () => {
		expect(canPlace(occ, 2, 0, 2, 2)).toBe(true);
	});
	it('ignores the moving item’s own cells', () => {
		expect(canPlace(occ, 0, 0, 2, 2)).toBe(false);
		expect(canPlace(occ, 0, 0, 2, 2, 1)).toBe(true);
	});
});

describe('firstFit', () => {
	it('finds top-left for an empty grid', () => {
		expect(firstFit([], 2, 2)).toEqual({ x: 0, y: 0 });
	});
	it('skips occupied cells', () => {
		const occ: Rect[] = [{ uid: 1, x: 0, y: 0, w: 2, h: 6 }];
		expect(firstFit(occ, 1, 1)).toEqual({ x: 2, y: 0 });
	});
	it('returns null when nothing fits', () => {
		const full: Rect[] = [{ uid: 1, x: 0, y: 0, w: COLS, h: ROWS }];
		expect(firstFit(full, 1, 1)).toBeNull();
	});
});

describe('autoSort', () => {
	it('packs largest first without overlap', () => {
		const items: SortItem[] = [
			{ uid: 1, fp: { w: 1, h: 1 } },
			{ uid: 2, fp: { w: 2, h: 2 } },
			{ uid: 3, fp: { w: 1, h: 3 } },
		];
		const out = autoSort(items);
		expect(out).toHaveLength(3);
		// no two placements share a cell
		const seen = new Set<number>();
		for (const p of out) {
			for (let dy = 0; dy < p.h; dy++)
				for (let dx = 0; dx < p.w; dx++) {
					const k = (p.y + dy) * COLS + (p.x + dx);
					expect(seen.has(k)).toBe(false);
					seen.add(k);
				}
		}
		// biggest (2x2) lands at origin
		const big = out.find((p) => p.uid === 2)!;
		expect(big).toMatchObject({ x: 0, y: 0 });
	});

	it('rotates a tall item to fit a short grid when needed', () => {
		// Fill everything but a 3x1 strip on the last row, then place a 1x3.
		const items: SortItem[] = [
			{ uid: 1, fp: { w: COLS, h: ROWS - 1 } },
			{ uid: 2, fp: { w: 1, h: 3 } },
		];
		const out = autoSort(items);
		const tall = out.find((p) => p.uid === 2)!;
		expect(tall.rot).toBe(1);
		expect(tall.w).toBe(3);
		expect(tall.h).toBe(1);
		expect(tall.y).toBe(ROWS - 1);
	});
});

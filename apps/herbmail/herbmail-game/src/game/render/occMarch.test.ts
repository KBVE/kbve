import { describe, it, expect } from 'vitest';
import { TILE } from '../config';
import {
	OCC_CELLS,
	OCC_NEAR,
	OCC_REACH,
	fixedStepCells,
	marchCells,
	type Cell,
} from './occMarch';

const key = (c: Cell) => `${c.x},${c.y}`;

// Deterministic spread of rays: angles that hit axis-aligned, diagonal and
// generic cases, over lengths short enough to terminate early and long enough
// to clip OCC_REACH.
function rays(): Array<[number, number, number, number]> {
	const out: Array<[number, number, number, number]> = [];
	const origins = [
		[0, 0],
		[1.5, 1.5],
		[-4.25, 7.75],
		[TILE, TILE * 2],
		[0.01, -0.01],
	];
	for (const [ox, oy] of origins) {
		for (let a = 0; a < 32; a++) {
			const th = (a / 32) * Math.PI * 2;
			for (const len of [0.7, 1.4, 3, 6.5, 11, 14, 25]) {
				out.push([
					ox,
					oy,
					ox + Math.cos(th) * len,
					oy + Math.sin(th) * len,
				]);
			}
		}
	}
	return out;
}

describe('occluder march', () => {
	// The safety property. The walk may test cells the fixed step strode over —
	// that is the point, corners stop leaking — but it must never miss one the
	// old loop checked, or shadows would disappear rather than appear.
	it('tests every cell the fixed-step march tested', () => {
		for (const [fx, fy, lx, ly] of rays()) {
			const walked = new Set(marchCells(fx, fy, lx, ly, 0, 0).map(key));
			for (const c of fixedStepCells(fx, fy, lx, ly, 0, 0)) {
				expect(walked.has(key(c))).toBe(true);
			}
		}
	});

	it('never exceeds the loop bound the shader compiles with', () => {
		for (const [fx, fy, lx, ly] of rays()) {
			expect(marchCells(fx, fy, lx, ly, 0, 0).length).toBeLessThanOrEqual(
				OCC_CELLS,
			);
		}
	});

	it('visits each cell at most once', () => {
		for (const [fx, fy, lx, ly] of rays()) {
			const cells = marchCells(fx, fy, lx, ly, 0, 0);
			expect(new Set(cells.map(key)).size).toBe(cells.length);
		}
	});

	// Adjacent in the traversal means sharing an edge. A jump of more than one
	// cell would mean skipping a wall the ray passed through.
	it('walks a connected path', () => {
		for (const [fx, fy, lx, ly] of rays()) {
			const cells = marchCells(fx, fy, lx, ly, 0, 0);
			for (let i = 1; i < cells.length; i++) {
				const d =
					Math.abs(cells[i].x - cells[i - 1].x) +
					Math.abs(cells[i].y - cells[i - 1].y);
				expect(d).toBe(1);
			}
		}
	});

	it('starts in the cell containing the near bound', () => {
		for (const [fx, fy, lx, ly] of rays()) {
			const cells = marchCells(fx, fy, lx, ly, 0, 0);
			if (!cells.length) continue;
			const len = Math.hypot(lx - fx, ly - fy);
			const ux = (lx - fx) / len;
			const uy = (ly - fy) / len;
			expect(cells[0]).toEqual({
				x: Math.floor((fx + ux * OCC_NEAR) / TILE),
				y: Math.floor((fy + uy * OCC_NEAR) / TILE),
			});
		}
	});

	// Reach is the whole reason far-off geometry does not suddenly start casting
	// shadows: a light 18 units away is only marched for the first ~11.
	it('stops at OCC_REACH regardless of how far the light is', () => {
		const far = marchCells(0, 0, 100, 0, 0, 0);
		const atReach = marchCells(0, 0, OCC_REACH + 0.45, 0, 0, 0);
		expect(far.length).toBe(atReach.length);
		expect(far[far.length - 1].x * TILE).toBeLessThanOrEqual(OCC_REACH);
	});

	it('returns nothing for lights inside the near cutoff', () => {
		expect(marchCells(0, 0, 0.5, 0, 0, 0)).toEqual([]);
		expect(fixedStepCells(0, 0, 0.5, 0, 0, 0)).toEqual([]);
	});

	// The win being claimed, stated as a test so it cannot silently regress.
	it('touches far fewer cells than the fixed step took samples', () => {
		let walked = 0;
		let stepped = 0;
		for (const [fx, fy, lx, ly] of rays()) {
			walked += marchCells(fx, fy, lx, ly, 0, 0).length;
			stepped += fixedStepCells(fx, fy, lx, ly, 0, 0).length;
		}
		expect(walked * 3).toBeLessThan(stepped);
	});

	// Translating the ray and the grid origin together must not change which
	// cells the ray occupies.
	//
	// Rays that begin within an epsilon of a cell boundary are excluded, and the
	// exact step order is not asserted. Both are floating point, not algorithm:
	// a start point whose true grid coordinate is 0 picks up a ~1e-16 term that
	// the shift's add-then-subtract absorbs, flipping the sign floor() sees; and
	// where a ray crosses precisely through a corner, tMax ties and rounding
	// decides which axis steps first. The old fixed march used the same floor()
	// and was ambiguous at boundaries in exactly the same way, so neither is a
	// property this change is free to guarantee.
	it('respects a shifted grid origin', () => {
		const ox = -12.5;
		const oy = 6.25;
		const EPS = 1e-9;
		const onBoundary = (v: number) => {
			const m = Math.abs(v / TILE - Math.round(v / TILE));
			return m < EPS;
		};

		let checked = 0;
		for (const [fx, fy, lx, ly] of rays()) {
			const len = Math.hypot(lx - fx, ly - fy);
			if (len < 0.6) continue;
			const sx = fx + ((lx - fx) / len) * OCC_NEAR;
			const sy = fy + ((ly - fy) / len) * OCC_NEAR;
			if (onBoundary(sx) || onBoundary(sy)) continue;

			const base = marchCells(fx, fy, lx, ly, 0, 0);
			const shifted = marchCells(
				fx + ox,
				fy + oy,
				lx + ox,
				ly + oy,
				ox,
				oy,
			);
			expect(shifted.length).toBe(base.length);
			if (!base.length) continue;
			expect(shifted[0]).toEqual(base[0]);
			expect(shifted[shifted.length - 1]).toEqual(base[base.length - 1]);
			checked++;
		}
		expect(checked).toBeGreaterThan(100);
	});
});

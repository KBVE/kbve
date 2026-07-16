import { describe, it, expect } from 'vitest';
import { genSectorDesc, SECTOR_TILES } from './generate';
import { DOORWAY } from '../geometry/grid';
import { WALL, ARCH } from '../geometry/grid';

const SEED = 1337;

describe('door generation', () => {
	it('records only in-bounds doorway tiles (OOB-wrap regression)', () => {
		for (let sy = -2; sy <= 2; sy++)
			for (let sx = -2; sx <= 2; sx++) {
				const d = genSectorDesc(SEED, sx, sy);
				for (const w of d.doorways) {
					expect(w.lc).toBeGreaterThanOrEqual(0);
					expect(w.lc).toBeLessThan(d.cols);
					expect(w.lr).toBeGreaterThanOrEqual(0);
					expect(w.lr).toBeLessThan(d.rows);
				}
			}
	});

	it('every doorway gap is an ARCH (DOORWAY) tile', () => {
		for (let sy = -1; sy <= 1; sy++)
			for (let sx = -1; sx <= 1; sx++) {
				const d = genSectorDesc(SEED, sx, sy);
				for (const w of d.doorways) {
					expect(
						d.tiles[w.lr * d.cols + w.lc] & DOORWAY,
					).toBeTruthy();
				}
			}
	});

	it('is deterministic for a given seed + sector', () => {
		const a = genSectorDesc(SEED, 3, -2);
		const b = genSectorDesc(SEED, 3, -2);
		expect(a.doorways).toEqual(b.doorways);
	});

	it('actually produces doors across a sector window', () => {
		let total = 0;
		for (let sy = -2; sy <= 2; sy++)
			for (let sx = -2; sx <= 2; sx++)
				total += genSectorDesc(SEED, sx, sy).doorways.length;
		expect(total).toBeGreaterThan(0);
	});

	it('doorway axis is always x or z', () => {
		const d = genSectorDesc(SEED, 0, 0);
		for (const w of d.doorways) {
			expect(w.axis === 'x' || w.axis === 'z').toBe(true);
		}
	});

	it('mirror gate narrows when the owner sector doors a border connector', () => {
		const edge = SECTOR_TILES - 1;
		for (let sy = -2; sy <= 2; sy++)
			for (let sx = -2; sx <= 2; sx++) {
				const d = genSectorDesc(SEED, sx, sy);
				const tile = (c: number, r: number) => d.tiles[r * d.cols + c];

				const north = genSectorDesc(SEED, sx, sy - 1);
				for (const w of north.doorways.filter((x) => x.lr === edge)) {
					expect(tile(w.lc, 0)).toBe(ARCH);
					expect(tile(w.lc - 1, 0)).toBe(WALL);
					expect(tile(w.lc + 1, 0)).toBe(WALL);
				}

				const west = genSectorDesc(SEED, sx - 1, sy);
				for (const w of west.doorways.filter((x) => x.lc === edge)) {
					expect(tile(0, w.lr)).toBe(ARCH);
					expect(tile(0, w.lr - 1)).toBe(WALL);
					expect(tile(0, w.lr + 1)).toBe(WALL);
				}
			}
	});

	it('no duplicate doorway tiles within a sector', () => {
		for (let sy = -1; sy <= 1; sy++)
			for (let sx = -1; sx <= 1; sx++) {
				const d = genSectorDesc(SEED, sx, sy);
				const keys = d.doorways.map((w) => `${w.lc}|${w.lr}`);
				expect(new Set(keys).size).toBe(keys.length);
			}
	});
});

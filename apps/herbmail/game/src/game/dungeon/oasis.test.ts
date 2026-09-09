import { describe, expect, it } from 'vitest';
import { genSectorDesc, SECTOR_TILES } from './generate';
import { FLOOR, OPEN, PIT, OASIS } from '../geometry/grid';

const SEED = 1337;

function findPoolSector(): ReturnType<typeof genSectorDesc> {
	for (let sy = 0; sy < 6; sy++)
		for (let sx = 0; sx < 6; sx++) {
			const d = genSectorDesc(SEED, sx, sy);
			if (d.oases.length) return d;
		}
	throw new Error('no pool sector in 6x6 scan');
}

describe('pool generation', () => {
	it('is deterministic and carves exactly the slot rect', () => {
		const d = findPoolSector();
		const again = genSectorDesc(SEED, d.cx, d.cy);
		expect(again.oases).toEqual(d.oases);

		let pit = 0;
		for (let i = 0; i < d.tiles.length; i++) if (d.tiles[i] & PIT) pit++;
		const expected = d.oases.reduce((s, p) => s + p.w * p.h, 0);
		expect(pit).toBe(expected);
		for (const p of d.oases)
			for (let r = p.row; r < p.row + p.h; r++)
				for (let c = p.col; c < p.col + p.w; c++)
					expect(d.tiles[r * d.cols + c]).toBe(OASIS | OPEN);
	});

	it('keeps a walkable floor ring around every basin', () => {
		const d = findPoolSector();
		for (const p of d.oases) {
			for (let c = p.col - 1; c <= p.col + p.w; c++) {
				expect(d.tiles[(p.row - 1) * d.cols + c] & ~OPEN).toBe(FLOOR);
				expect(d.tiles[(p.row + p.h) * d.cols + c] & ~OPEN).toBe(FLOOR);
			}
			for (let r = p.row - 1; r <= p.row + p.h; r++) {
				expect(d.tiles[r * d.cols + p.col - 1] & ~OPEN).toBe(FLOOR);
				expect(d.tiles[r * d.cols + p.col + p.w] & ~OPEN).toBe(FLOOR);
			}
			expect(p.col).toBeGreaterThan(0);
			expect(p.row).toBeGreaterThan(0);
			expect(p.col + p.w).toBeLessThan(SECTOR_TILES);
			expect(p.row + p.h).toBeLessThan(SECTOR_TILES);
		}
	});
});

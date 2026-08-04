import { describe, it, expect } from 'vitest';
import { PAD, dilateSky } from './occlusion';

// What skyAtWorld used to do per fragment: max the G channel over the 3x3 tile
// neighbourhood, skipping neighbours outside the grid. Kept here verbatim so the
// baked version is checked against the thing it replaced, not against itself.
function shaderSky(
	data: Uint8Array,
	cols: number,
	rows: number,
	col: number,
	row: number,
): number {
	let best = 0;
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			const c = col + dx;
			const r = row + dy;
			if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
			best = Math.max(best, data[(r * cols + c) * 2 + 1]);
		}
	}
	return best;
}

function grid(
	cols: number,
	rows: number,
	open: Array<[number, number]>,
): Uint8Array {
	const d = new Uint8Array(cols * rows * 2);
	for (const [c, r] of open) d[(r * cols + c) * 2 + 1] = 254;
	return d;
}

describe('dilateSky', () => {
	it('matches the 3x3 max the shader used to compute per fragment', () => {
		const cols = 9;
		const rows = 7;
		const open: Array<[number, number]> = [
			[4, 3],
			[5, 3],
			[1, 1],
			[8, 6],
			[0, 0],
		];
		const before = grid(cols, rows, open);
		const after = grid(cols, rows, open);
		dilateSky(after, cols, rows);

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				expect(after[(r * cols + c) * 2 + 1]).toBe(
					shaderSky(before, cols, rows, c, r),
				);
			}
		}
	});

	it('leaves the occluder channel untouched', () => {
		const cols = 5;
		const rows = 5;
		const d = new Uint8Array(cols * rows * 2);
		d[(2 * cols + 2) * 2] = 254;
		d[(2 * cols + 2) * 2 + 1] = 254;
		dilateSky(d, cols, rows);

		let occluders = 0;
		for (let i = 0; i < cols * rows; i++) if (d[i * 2]) occluders++;
		expect(occluders).toBe(1);
		expect(d[(2 * cols + 2) * 2]).toBe(254);
	});

	// The border is what makes the bake exact rather than approximate: without it
	// a tile just outside the grid still saw in-range neighbours in the shader,
	// and a single fetch at that centre would read nothing.
	it('reproduces the shader for centres outside the unpadded grid', () => {
		expect(PAD).toBeGreaterThanOrEqual(1);

		const inner = 5;
		const cols = inner + PAD * 2;
		const rows = inner + PAD * 2;
		// Open tile on the very edge of the unpadded region.
		const open: Array<[number, number]> = [[PAD, PAD]];
		const before = grid(cols, rows, open);
		const after = grid(cols, rows, open);
		dilateSky(after, cols, rows);

		// The centre one tile outside the unpadded grid: in the old shader this
		// was an out-of-range col that still maxed over its in-range neighbours.
		const c = PAD - 1;
		const r = PAD;
		expect(after[(r * cols + c) * 2 + 1]).toBe(254);
		expect(after[(r * cols + c) * 2 + 1]).toBe(
			shaderSky(before, cols, rows, c, r),
		);
	});

	it('is a no-op on a grid with no open sky', () => {
		const d = new Uint8Array(4 * 4 * 2).fill(0);
		for (let i = 0; i < 16; i++) d[i * 2] = 254;
		dilateSky(d, 4, 4);
		for (let i = 0; i < 16; i++) expect(d[i * 2 + 1]).toBe(0);
	});
});

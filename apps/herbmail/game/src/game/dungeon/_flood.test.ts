import { it, expect } from 'vitest';
import { genSectorDesc } from './generate';
import { WALL } from '../geometry/grid';

it('sector interior stays connected + gates reach interior after ring-wall', () => {
	for (let sy = -1; sy <= 1; sy++)
		for (let sx = -1; sx <= 1; sx++) {
			const d = genSectorDesc(1337, sx, sy);
			const { cols, rows, tiles } = d;
			let start = -1;
			let total = 0;
			for (let i = 0; i < tiles.length; i++)
				if (tiles[i] !== WALL) {
					total++;
					if (start < 0) start = i;
				}
			const seen = new Uint8Array(tiles.length);
			const stack = [start];
			seen[start] = 1;
			let reach = 0;
			while (stack.length) {
				const i = stack.pop()!;
				reach++;
				const c = i % cols;
				const r = (i - c) / cols;
				for (const [dc, dr] of [
					[1, 0],
					[-1, 0],
					[0, 1],
					[0, -1],
				] as const) {
					const nc = c + dc;
					const nr = r + dr;
					if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
					const ni = nr * cols + nc;
					if (seen[ni] || tiles[ni] === WALL) continue;
					seen[ni] = 1;
					stack.push(ni);
				}
			}
			expect(reach, `sector ${sx},${sy} sealed ${reach}/${total}`).toBe(
				total,
			);
		}
});

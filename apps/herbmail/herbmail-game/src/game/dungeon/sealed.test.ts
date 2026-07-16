import { describe, it, expect } from 'vitest';
import { genSectorDesc, CELL } from './generate';
import { genSector, cellIndex, OWNER_ROOM, SECTOR } from './sector';
import { FLOOR, SOLID, DOORWAY } from '../geometry/grid';

const SEED = 1337;

function seamTiles(
	d: { tiles: Uint8Array; cols: number },
	cx: number,
	cy: number,
	axis: 'x' | 'z',
): number[] {
	const out: number[] = [];
	if (axis === 'x') {
		const tc = (cx + 1) * CELL;
		for (let k = 0; k < CELL; k++)
			out.push(d.tiles[(cy * CELL + k) * d.cols + tc]);
	} else {
		const tr = (cy + 1) * CELL;
		for (let k = 0; k < CELL; k++)
			out.push(d.tiles[tr * d.cols + cx * CELL + k]);
	}
	return out;
}

describe('sealed rooms', () => {
	it('every room-boundary seam is walled with exactly one arch threshold', () => {
		for (let sy = -2; sy <= 2; sy++)
			for (let sx = -2; sx <= 2; sx++) {
				const d = genSectorDesc(SEED, sx, sy);
				const { cellOwner } = genSector(SEED, sx, sy);
				for (let cy = 0; cy < SECTOR; cy++)
					for (let cx = 0; cx < SECTOR; cx++) {
						const o = cellOwner.get(cellIndex(cx, cy));
						if (!o) continue;
						const check = (
							other: typeof o | undefined,
							axis: 'x' | 'z',
						) => {
							if (!other) return;
							const differs =
								o.kind !== other.kind || o.id !== other.id;
							const roomy =
								o.kind === OWNER_ROOM ||
								other.kind === OWNER_ROOM;
							if (!differs || !roomy) return;
							const seam = seamTiles(d, cx, cy, axis);
							const open = seam.filter((t) => t === FLOOR).length;
							const arches = seam.filter(
								(t) => t & DOORWAY,
							).length;
							expect(open).toBe(0);
							expect(arches).toBe(1);
						};
						if (cx + 1 < SECTOR)
							check(cellOwner.get(cellIndex(cx + 1, cy)), 'x');
						if (cy + 1 < SECTOR)
							check(cellOwner.get(cellIndex(cx, cy + 1)), 'z');
					}
			}
	});

	it('walkable tiles stay a single connected component per sector', () => {
		for (let sy = -1; sy <= 1; sy++)
			for (let sx = -1; sx <= 1; sx++) {
				const d = genSectorDesc(SEED, sx, sy);
				const walkable = (i: number) => !(d.tiles[i] & SOLID);
				const total = d.tiles.reduce(
					(n, _, i) => n + (walkable(i) ? 1 : 0),
					0,
				);
				const start = d.tiles.findIndex((_, i) => walkable(i));
				const seen = new Set<number>([start]);
				const stack = [start];
				while (stack.length) {
					const i = stack.pop()!;
					const c = i % d.cols;
					const r = (i - c) / d.cols;
					for (const [dc, dr] of [
						[1, 0],
						[-1, 0],
						[0, 1],
						[0, -1],
					]) {
						const nc = c + dc;
						const nr = r + dr;
						if (nc < 0 || nr < 0 || nc >= d.cols || nr >= d.rows)
							continue;
						const ni = nr * d.cols + nc;
						if (!seen.has(ni) && walkable(ni)) {
							seen.add(ni);
							stack.push(ni);
						}
					}
				}
				expect(seen.size).toBe(total);
			}
	});
});

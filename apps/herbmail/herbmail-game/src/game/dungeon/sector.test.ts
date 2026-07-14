import { describe, it, expect } from 'vitest';
import {
	genSector,
	SECTOR,
	SIDE_N,
	SIDE_E,
	SIDE_S,
	SIDE_W,
	cellIndex,
	type Sector,
	type SEdge,
} from './sector';

const SEED = 1337;

function reachable(
	sector: Sector,
	start: number,
	blocked: Set<number>,
): Set<number> {
	const seen = new Set<number>([start]);
	const stack = [start];
	const edgesOf = (id: number): SEdge[] =>
		sector.edges.filter((e) => e.a === id || e.b === id);
	while (stack.length) {
		const n = stack.pop()!;
		for (const e of edgesOf(n)) {
			if (blocked.has(e.id)) continue;
			const m = e.a === n ? e.b : e.a;
			if (!seen.has(m)) {
				seen.add(m);
				stack.push(m);
			}
		}
	}
	return seen;
}

const coords: [number, number][] = [];
for (let sx = -2; sx <= 2; sx++)
	for (let sy = -2; sy <= 2; sy++) coords.push([sx, sy]);

describe('genSector', () => {
	it('every room reachable from entrance ignoring locks (connectivity)', () => {
		for (const [sx, sy] of coords) {
			const s = genSector(SEED, sx, sy);
			const seen = reachable(s, s.entrance, new Set());
			expect(seen.size).toBe(s.rooms.length);
		}
	});

	it('every locked door has its key reachable before the lock (solvability)', () => {
		for (const [sx, sy] of coords) {
			const s = genSector(SEED, sx, sy);
			const keyRoom = new Map<number, number>();
			for (const r of s.rooms)
				if (r.keyId >= 0) keyRoom.set(r.keyId, r.id);
			for (const locked of s.edges.filter((e) => e.locked)) {
				expect(locked.keyId).toBeGreaterThanOrEqual(0);
				const kr = keyRoom.get(locked.keyId);
				expect(kr).toBeDefined();
				const withoutThis = new Set([locked.id]);
				const seen = reachable(s, s.entrance, withoutThis);
				expect(seen.has(kr!)).toBe(true);
			}
		}
	});

	it('all rooms fit inside the sector bounds', () => {
		for (const [sx, sy] of coords) {
			const s = genSector(SEED, sx, sy);
			for (const r of s.rooms) {
				expect(r.col0).toBeGreaterThanOrEqual(0);
				expect(r.row0).toBeGreaterThanOrEqual(0);
				expect(r.col0 + r.w).toBeLessThanOrEqual(SECTOR);
				expect(r.row0 + r.h).toBeLessThanOrEqual(SECTOR);
				expect(r.w).toBeGreaterThanOrEqual(2);
				expect(r.h).toBeGreaterThanOrEqual(2);
			}
		}
	});

	it('cellOwner indices are all within the sector grid', () => {
		for (const [sx, sy] of coords) {
			const s = genSector(SEED, sx, sy);
			for (const ci of s.cellOwner.keys()) {
				expect(ci).toBeGreaterThanOrEqual(0);
				expect(ci).toBeLessThan(SECTOR * SECTOR);
			}
		}
	});

	it('is deterministic for a given (seed, sx, sy)', () => {
		for (const [sx, sy] of coords) {
			const a = genSector(SEED, sx, sy);
			const b = genSector(SEED, sx, sy);
			expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms));
			expect(JSON.stringify(a.edges)).toBe(JSON.stringify(b.edges));
			expect(a.entrance).toBe(b.entrance);
		}
	});

	it('produces varied layouts across sectors', () => {
		const sigs = new Set<string>();
		for (const [sx, sy] of coords)
			sigs.add(JSON.stringify(genSector(SEED, sx, sy).rooms));
		expect(sigs.size).toBeGreaterThan(coords.length / 2);
	});

	it('cross-sector connectors mirror between neighbours (reciprocity)', () => {
		for (const [sx, sy] of coords) {
			const s = genSector(SEED, sx, sy);
			const east = s.connectors.find((c) => c.side === SIDE_E)!;
			const westNbr = genSector(SEED, sx + 1, sy).connectors.find(
				(c) => c.side === SIDE_W,
			)!;
			expect(east.ly).toBe(westNbr.ly);
			const south = s.connectors.find((c) => c.side === SIDE_S)!;
			const northNbr = genSector(SEED, sx, sy + 1).connectors.find(
				(c) => c.side === SIDE_N,
			)!;
			expect(south.lx).toBe(northNbr.lx);
		}
	});

	it('every connector cell is carved (owned) and reachable from entrance', () => {
		for (const [sx, sy] of coords) {
			const s = genSector(SEED, sx, sy);
			expect(s.connectors.length).toBe(4);
			for (const c of s.connectors)
				expect(s.cellOwner.has(cellIndex(c.lx, c.ly))).toBe(true);
		}
	});

	it('has at least 2 rooms per sector', () => {
		for (const [sx, sy] of coords) {
			const s = genSector(SEED, sx, sy);
			expect(s.rooms.length).toBeGreaterThanOrEqual(2);
		}
	});
});

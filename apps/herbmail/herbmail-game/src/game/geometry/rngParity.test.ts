import { describe, expect, it } from 'vitest';
import { hash01, hashInt, jitter } from './rng';

// Mirror of PINNED in apps/agones/herbmail/server/src/rng.rs.
//
// The dungeon is a pure function of a seed and is never transmitted, so the
// server has to derive byte-identical geometry from the same seed. These vectors
// are what holds the two implementations together. Neither side may be
// regenerated to match the other: if they diverge, the world itself has changed
// and every persisted position is suspect.
//
// Same discipline as simgrid/src/heightfield.rs::PINNED_BITS.
const PINNED: Array<[number, number, number, number]> = [
	[0, 0, 0, 0],
	[1, 0, 0, 2182377942],
	[0, 1, 0, 3299714085],
	[0, 0, 1, 978089601],
	[1, 1, 1, 1621154374],
	[-1, 0, 0, 2321422717],
	[0, -1, 0, 2314630687],
	[-1, -1, -1, 995778845],
	[1337, 0, 0, 2082178126],
	[48, 48, 0, 1098198025],
	[1000000, 1000000, 0, 2147371341],
	[-1000000, 999999, 7, 2431402538],
	[2147483647, 0, 0, 2363105273],
	[-2147483648, 0, 0, 4253351300],
	[123456789, 987654321, 42, 301882944],
];

describe('rng parity with herbmail-server', () => {
	it('hashInt matches the pinned vectors', () => {
		for (const [x, y, z, want] of PINNED) {
			expect(hashInt(x, y, z), `hashInt(${x}, ${y}, ${z})`).toBe(want);
		}
	});

	it('hash01 stays inside the unit range', () => {
		for (const [x, y, z] of PINNED) {
			const v = hash01(x, y, z);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}
	});

	it('jitter spans the doorway half-width range', () => {
		// The range the collision predicate actually uses: TILE * 0.28 .. 0.38.
		for (const [x, y, z] of PINNED) {
			const v = jitter(x, y, z, 3 * 0.28, 3 * 0.38);
			expect(v).toBeGreaterThanOrEqual(0.84);
			expect(v).toBeLessThanOrEqual(1.14);
		}
	});

	it('hash01 divides by u32::MAX, not 2^32', () => {
		// Rust mirrors this exactly; using 2**32 would drift every doorway width.
		expect(hash01(2147483647, 0, 0)).toBe(2363105273 / 4294967295);
	});
});

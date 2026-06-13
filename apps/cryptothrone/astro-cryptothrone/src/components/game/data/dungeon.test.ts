import { describe, it, expect } from 'vitest';
import {
	generateDungeon,
	generateTown,
	fingerprint,
	fingerprintRoles,
	roleBlocks,
	Role,
	DUNGEON_W,
	DUNGEON_H,
	TOWN_W,
	TOWN_H,
} from './dungeon';

function reachable(
	blocked: boolean[],
	w: number,
	h: number,
	si: number,
): number {
	const seen = new Set([si]);
	const q = [si];
	while (q.length) {
		const c = q.pop()!;
		const x = c % w;
		const y = Math.floor(c / w);
		for (const [dx, dy] of [
			[0, -1],
			[0, 1],
			[-1, 0],
			[1, 0],
		]) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
			const ni = ny * w + nx;
			if (seen.has(ni) || blocked[ni]) continue;
			seen.add(ni);
			q.push(ni);
		}
	}
	return seen.size;
}

describe('procedural dungeon (client/server parity)', () => {
	it('matches the Rust role + collision fingerprints for seed 1337', () => {
		// Frozen values from packages/rust/simgrid/src/dungeon.rs
		// (parity_fingerprint_1337). If these fail, the TS + Rust generators
		// have diverged and seeds no longer produce identical maps.
		const d = generateDungeon(1337, DUNGEON_W, DUNGEON_H);
		expect(fingerprintRoles(d.roles)).toBe(2259070045);
		expect(fingerprint(d.blocked)).toBe(532487171);
	});

	it('is deterministic and seed-varying', () => {
		expect(fingerprintRoles(generateDungeon(1337).roles)).toBe(
			fingerprintRoles(generateDungeon(1337).roles),
		);
		expect(fingerprintRoles(generateDungeon(1337).roles)).not.toBe(
			fingerprintRoles(generateDungeon(99).roles),
		);
	});

	it('spawn is walkable and every floor tile is reachable', () => {
		const d = generateDungeon(1337);
		const si = d.spawn.y * d.width + d.spawn.x;
		expect(d.blocked[si]).toBe(false);
		const floors = d.blocked.filter((b) => !b).length;
		expect(reachable(d.blocked, d.width, d.height, si)).toBe(floors);
	});
});

describe('procedural town (client/server parity)', () => {
	it('matches the Rust role + collision fingerprints for seed 2024', () => {
		const t = generateTown(2024, TOWN_W, TOWN_H);
		expect(fingerprintRoles(t.roles)).toBe(1965805562);
		expect(fingerprint(t.blocked)).toBe(4102275285);
	});

	it('is deterministic and seed-varying', () => {
		expect(fingerprintRoles(generateTown(2024).roles)).toBe(
			fingerprintRoles(generateTown(2024).roles),
		);
		expect(fingerprintRoles(generateTown(2024).roles)).not.toBe(
			fingerprintRoles(generateTown(7).roles),
		);
	});

	it('plaza spawn is walkable, buildings exist, streets fully connect', () => {
		const t = generateTown(2024);
		expect(t.buildings.length).toBeGreaterThan(0);
		const si = t.spawn.y * t.width + t.spawn.x;
		expect(t.roles[si]).toBe(Role.PLAZA);
		expect(t.blocked[si]).toBe(false);
		const ground = t.blocked.filter((b) => !b).length;
		expect(reachable(t.blocked, t.width, t.height, si)).toBe(ground);
	});

	it('collision exactly tracks role blocking', () => {
		const t = generateTown(2024);
		expect(t.roles.every((r, i) => roleBlocks(r) === t.blocked[i])).toBe(
			true,
		);
	});
});

import { describe, it, expect } from 'vitest';
import {
	generateDungeon,
	generateTown,
	fingerprint,
	DUNGEON_W,
	DUNGEON_H,
	TOWN_W,
	TOWN_H,
} from './dungeon';

describe('procedural dungeon (client/server parity)', () => {
	it('matches the Rust generator fingerprint for seed 1337', () => {
		// Frozen value from packages/rust/simgrid/src/dungeon.rs
		// (parity_fingerprint_1337). If this fails, the TS + Rust generators
		// have diverged and seeds no longer produce identical dungeons.
		const d = generateDungeon(1337, DUNGEON_W, DUNGEON_H);
		expect(fingerprint(d.blocked)).toBe(532487171);
	});

	it('is deterministic and seed-varying', () => {
		expect(fingerprint(generateDungeon(1337).blocked)).toBe(
			fingerprint(generateDungeon(1337).blocked),
		);
		expect(fingerprint(generateDungeon(1337).blocked)).not.toBe(
			fingerprint(generateDungeon(99).blocked),
		);
	});

	it('spawn is walkable and every floor tile is reachable', () => {
		const d = generateDungeon(1337);
		const si = d.spawn.y * d.width + d.spawn.x;
		expect(d.blocked[si]).toBe(false);
		const floors = d.blocked.filter((b) => !b).length;
		const seen = new Set([si]);
		const q = [si];
		while (q.length) {
			const c = q.pop()!;
			const x = c % d.width;
			const y = Math.floor(c / d.width);
			for (const [dx, dy] of [
				[0, -1],
				[0, 1],
				[-1, 0],
				[1, 0],
			]) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= d.width || ny >= d.height)
					continue;
				const ni = ny * d.width + nx;
				if (seen.has(ni) || d.blocked[ni]) continue;
				seen.add(ni);
				q.push(ni);
			}
		}
		expect(seen.size).toBe(floors);
	});
});

describe('procedural town (client/server parity)', () => {
	it('matches the Rust generator fingerprint for seed 2024', () => {
		// Frozen value from packages/rust/simgrid/src/dungeon.rs
		// (parity_town_fingerprint_2024).
		const t = generateTown(2024, TOWN_W, TOWN_H);
		expect(fingerprint(t.blocked)).toBe(330823508);
	});

	it('is deterministic and seed-varying', () => {
		expect(fingerprint(generateTown(2024).blocked)).toBe(
			fingerprint(generateTown(2024).blocked),
		);
		expect(fingerprint(generateTown(2024).blocked)).not.toBe(
			fingerprint(generateTown(7).blocked),
		);
	});

	it('has buildings and a fully connected street network', () => {
		const t = generateTown(2024);
		expect(t.buildings.length).toBeGreaterThan(0);
		const si = t.spawn.y * t.width + t.spawn.x;
		expect(t.blocked[si]).toBe(false);
		const ground = t.blocked.filter((b) => !b).length;
		const seen = new Set([si]);
		const q = [si];
		while (q.length) {
			const c = q.pop()!;
			const x = c % t.width;
			const y = Math.floor(c / t.width);
			for (const [dx, dy] of [
				[0, -1],
				[0, 1],
				[-1, 0],
				[1, 0],
			]) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= t.width || ny >= t.height)
					continue;
				const ni = ny * t.width + nx;
				if (seen.has(ni) || t.blocked[ni]) continue;
				seen.add(ni);
				q.push(ni);
			}
		}
		expect(seen.size).toBe(ground);
	});
});

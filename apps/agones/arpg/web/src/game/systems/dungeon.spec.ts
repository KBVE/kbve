import { describe, it, expect } from 'vitest';
import {
	fingerprint,
	floorSeed,
	isFloorAt,
	chunkGate,
	generateChunk,
	CHUNK_SIZE,
	stairTile,
	StairKind,
} from './dungeon';

const SEED = 0x5eed1;

describe('arpg dungeon parity', () => {
	it('matches the frozen Rust fingerprint (simgrid arpg_dungeon)', () => {
		// FROZEN — equals simgrid::arpg_dungeon::fingerprint(0x5eed1, 0,0, 80,80).
		// If this changes, the server + client dungeons have diverged; update
		// BOTH the Rust frozen value and this one together.
		expect(fingerprint(SEED, 0, 0, 80, 80)).toBe(1764795750);
	});

	it('is deterministic across calls', () => {
		expect(fingerprint(SEED, -40, -40, 120, 120)).toBe(
			fingerprint(SEED, -40, -40, 120, 120),
		);
	});

	it('changes layout with the seed', () => {
		expect(fingerprint(SEED, 0, 0, 80, 80)).not.toBe(
			fingerprint(0x1234, 0, 0, 80, 80),
		);
	});

	it('floor 0 is the ground layout (floorSeed identity)', () => {
		// Mirrors the Rust floor_seed(seed, 0) == seed, keeping the frozen
		// floor-0 fingerprint valid.
		expect(floorSeed(SEED, 0)).toBe(SEED >>> 0);
		expect(fingerprint(floorSeed(SEED, 0), 0, 0, 80, 80)).toBe(1764795750);
	});

	it('each floor is a distinct dungeon', () => {
		const f0 = fingerprint(floorSeed(SEED, 0), 0, 0, 80, 80);
		const f1 = fingerprint(floorSeed(SEED, 1), 0, 0, 80, 80);
		const f2 = fingerprint(floorSeed(SEED, 2), 0, 0, 80, 80);
		expect(f0).not.toBe(f1);
		expect(f1).not.toBe(f2);
		expect(f0).not.toBe(f2);
	});

	it('room centers are always floor', () => {
		for (const [cx, cy] of [
			[0, 0],
			[1, 0],
			[0, 1],
			[-1, -1],
			[3, -2],
		]) {
			const g = chunkGate(SEED, cx, cy);
			expect(isFloorAt(SEED, g.x, g.y)).toBe(true);
		}
	});

	it('corridors connect neighbours (east elbow is floor)', () => {
		const a = chunkGate(SEED, 0, 0);
		const b = chunkGate(SEED, 1, 0);
		expect(isFloorAt(SEED, b.x, a.y)).toBe(true);
	});

	it('stair tiles match the frozen Rust stair_tile (parity)', () => {
		// FROZEN — equals simgrid::arpg_dungeon::stair_tile(0x5eed1, z, kind). The
		// client renders the stair prop on this exact tile; the server's
		// Stairs::at triggers the floor change on it. Update BOTH sides together.
		const frozen: Record<
			number,
			{ down: [number, number]; up: [number, number] }
		> = {
			0: { down: [-30, -28], up: [46, -6] },
			1: { down: [33, 27], up: [46, -10] },
			2: { down: [-30, 14], up: [10, -34] },
		};
		for (const z of [0, 1, 2]) {
			const fs = floorSeed(SEED, z);
			const d = stairTile(fs, StairKind.Down);
			const u = stairTile(fs, StairKind.Up);
			expect([d.x, d.y]).toEqual(frozen[z].down);
			expect([u.x, u.y]).toEqual(frozen[z].up);
			// Both endpoints are walkable on their floor.
			expect(isFloorAt(fs, d.x, d.y)).toBe(true);
			expect(isFloorAt(fs, u.x, u.y)).toBe(true);
		}
	});

	it('isFloorAt agrees with a generated chunk floor set', () => {
		// Spot-check the pure test against the streamed generator over one chunk.
		const chunk = generateChunk(SEED, 0, 0);
		for (let y = 0; y < CHUNK_SIZE; y++) {
			for (let x = 0; x < CHUNK_SIZE; x++) {
				if (chunk.floor.has(`${x},${y}`)) {
					expect(isFloorAt(SEED, x, y)).toBe(true);
				}
			}
		}
	});
});

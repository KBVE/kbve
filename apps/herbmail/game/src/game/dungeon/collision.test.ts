import { describe, it, expect, beforeEach } from 'vitest';
import { resetDungeon } from './store';
import { solidAtWorld } from './collision';
import { genSectorDesc, makeLocalGrid } from './generate';
import { archTiles } from '../geometry/faces';
import { ARCH_SALT } from '../geometry/arches';
import { jitter } from '../geometry/rng';
import { TILE } from '../config';

const SEED = 1337;

describe('archway orientation', () => {
	it('connector-gate arch tiles align with the border wall line', () => {
		const d = genSectorDesc(SEED, 0, 0);
		const tiles = archTiles(makeLocalGrid(d));
		const gate = tiles.filter((a) => a.col === 47);
		expect(gate.length).toBeGreaterThan(0);
		for (const a of gate) expect(a.axis).toBe('x');
	});
});

describe('arch jamb collision', () => {
	beforeEach(() => {
		resetDungeon();
	});

	it('blocks the jamb but not the opening of an undoored gate arch', () => {
		const d = genSectorDesc(SEED, 0, 0);
		const salt = d.variant * ARCH_SALT;
		const openHW = jitter(47, 9, 1 + salt, TILE * 0.28, TILE * 0.38);
		const cx = 47.5 * TILE;
		const cz = 9.5 * TILE;
		expect(solidAtWorld(cx, cz)).toBe(false);
		expect(solidAtWorld(cx, cz + openHW + 0.1)).toBe(true);
		expect(solidAtWorld(cx, cz - openHW - 0.1)).toBe(true);
	});
});

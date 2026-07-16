import { describe, it, expect, beforeEach } from 'vitest';
import {
	resetDungeon,
	updatePlayerWorld,
	getDungeon,
	MOUNT_MARGIN,
} from './store';
import { PHASE_MOUNTED } from './ecs';
import { SECTOR_TILES } from './generate';
import { TILE } from '../config';

const SPAN = SECTOR_TILES * TILE;

function mounted(sx: number, sy: number): boolean {
	const dw = getDungeon();
	const eid = dw.sectorEidAt(sx, sy);
	return eid !== undefined && dw.phase(eid) === PHASE_MOUNTED;
}

function gap(p: number, lo: number, hi: number): number {
	if (p < lo) return lo - p;
	if (p > hi) return p - hi;
	return 0;
}

function expectedMount(x: number, z: number, sx: number, sy: number): boolean {
	if (sx === Math.floor(x / SPAN) && sy === Math.floor(z / SPAN)) return true;
	const gx = gap(x, sx * SPAN, (sx + 1) * SPAN);
	const gz = gap(z, sy * SPAN, (sy + 1) * SPAN);
	return Math.hypot(gx, gz) <= MOUNT_MARGIN;
}

const PROBES: [number, number][] = [
	[SPAN / 2, SPAN / 2],
	[SPAN - TILE, SPAN / 2],
	[TILE, TILE],
	[SPAN / 2, SPAN - TILE],
	[SPAN + TILE, SPAN / 2],
];

describe('sector mount streaming', () => {
	beforeEach(() => {
		resetDungeon();
	});

	it('mount set always matches the margin rule at the current position', () => {
		for (const [x, z] of PROBES) {
			updatePlayerWorld(x, z);
			const sx = Math.floor(x / SPAN);
			const sy = Math.floor(z / SPAN);
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					expect(
						mounted(sx + dx, sy + dy),
						`probe (${x},${z}) sector (${sx + dx},${sy + dy})`,
					).toBe(expectedMount(x, z, sx + dx, sy + dy));
				}
		}
	});

	it('remounts correctly after crossing a border and returning', () => {
		updatePlayerWorld(SPAN / 2, SPAN / 2);
		updatePlayerWorld(SPAN + TILE, SPAN / 2);
		updatePlayerWorld(SPAN / 2, SPAN / 2);
		expect(mounted(0, 0)).toBe(true);
		expect(mounted(1, 0)).toBe(expectedMount(SPAN / 2, SPAN / 2, 1, 0));
	});
});

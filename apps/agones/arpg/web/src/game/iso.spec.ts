import { afterEach, describe, expect, it } from 'vitest';
import {
	worldToScreen,
	worldToScreenFlat,
	screenToWorldF,
	setIsoHeightSeed,
	setIsoHeightEnabled,
	isoHeightActive,
	terrainLiftPx,
	HEIGHT_PX_PER_UU,
} from './iso';
import { heightAt, seedFromWorld, HEIGHT_AMPLITUDE } from '@kbve/laser';

const SEED = 0xc1a55e5a;

afterEach(() => {
	setIsoHeightEnabled(false);
});

describe('iso height projection', () => {
	it('is flat until a seed is installed and enabled', () => {
		setIsoHeightEnabled(false);
		const p = worldToScreen(12, 34);
		expect(p).toEqual(worldToScreenFlat(12, 34));
		expect(terrainLiftPx(12, 34)).toBe(0);
	});

	it('lifts by the shared heightfield when enabled', () => {
		setIsoHeightSeed(SEED);
		setIsoHeightEnabled(true);
		expect(isoHeightActive()).toBe(true);
		const tx = 64.25;
		const ty = -18.5;
		const expectedLift =
			heightAt(seedFromWorld(SEED), tx, ty) * HEIGHT_PX_PER_UU;
		const flat = worldToScreenFlat(tx, ty);
		const lifted = worldToScreen(tx, ty);
		expect(lifted.x).toBe(flat.x);
		expect(flat.y - lifted.y).toBeCloseTo(expectedLift, 6);
		expect(Math.abs(expectedLift)).toBeLessThanOrEqual(
			HEIGHT_AMPLITUDE * HEIGHT_PX_PER_UU,
		);
	});

	it('screenToWorldF inverts the displaced projection', () => {
		setIsoHeightSeed(SEED);
		setIsoHeightEnabled(true);
		const samples: Array<[number, number]> = [
			[0, 0],
			[10.5, 3.25],
			[-40, 87],
			[123.75, -55.5],
			[300, 300],
		];
		for (const [tx, ty] of samples) {
			const p = worldToScreen(tx, ty);
			const back = screenToWorldF(p.x, p.y);
			// The raycast returns the VISIBLE surface under the pixel — when the
			// input tile is occluded by nearer terrain that is a different (deeper)
			// tile, so assert re-projection consistency, not tile identity.
			const rp = worldToScreen(back.x, back.y);
			expect(rp.x).toBeCloseTo(p.x, 1);
			expect(rp.y).toBeCloseTo(p.y, 1);
			expect(back.x + back.y).toBeGreaterThanOrEqual(tx + ty - 1e-3);
		}
	});

	it('stays flat on dungeon floors even with a seed installed', () => {
		setIsoHeightSeed(SEED);
		setIsoHeightEnabled(false);
		expect(isoHeightActive()).toBe(false);
		const p = worldToScreen(64.25, -18.5);
		expect(p).toEqual(worldToScreenFlat(64.25, -18.5));
	});
});

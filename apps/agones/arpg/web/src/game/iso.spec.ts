import { describe, expect, it } from 'vitest';
import { worldToScreen, screenToWorld, screenToWorldF, tileDepth } from './iso';

const SAMPLES: Array<[number, number]> = [
	[0, 0],
	[10.5, 3.25],
	[-40, 87],
	[123.75, -55.5],
	[300, 300],
];

describe('iso projection', () => {
	it('round-trips screenToWorldF through worldToScreen', () => {
		for (const [tx, ty] of SAMPLES) {
			const p = worldToScreen(tx, ty);
			const back = screenToWorldF(p.x, p.y);
			expect(back.x).toBeCloseTo(tx, 9);
			expect(back.y).toBeCloseTo(ty, 9);
		}
	});

	it('screenToWorld rounds to the containing tile', () => {
		const p = worldToScreen(12.4, 33.6);
		expect(screenToWorld(p.x, p.y)).toEqual({ x: 12, y: 34 });
	});

	it('is linear — no translation term', () => {
		const a = worldToScreen(7, -3);
		const b = worldToScreen(14, -6);
		expect(b.x).toBeCloseTo(a.x * 2, 9);
		expect(b.y).toBeCloseTo(a.y * 2, 9);
		expect(worldToScreen(0, 0)).toEqual({ x: 0, y: 0 });
	});

	it('depth follows tx + ty', () => {
		expect(tileDepth(3, 4)).toBe(7);
		expect(tileDepth(-2.5, 1.5)).toBe(-1);
	});
});

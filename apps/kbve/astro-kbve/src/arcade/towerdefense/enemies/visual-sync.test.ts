import { describe, expect, it } from 'vitest';
import { lerpHpColor } from './visual-sync';

function rgb(color: number): [number, number, number] {
	return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

describe('lerpHpColor', () => {
	it('full hp leans green', () => {
		const [r, g, b] = rgb(lerpHpColor(1));
		expect(g).toBeGreaterThan(r);
		expect(g).toBeGreaterThan(b);
	});

	it('half hp leans orange', () => {
		const [r, g, b] = rgb(lerpHpColor(0.5));
		expect(r).toBeGreaterThan(b);
		expect(g).toBeGreaterThan(b);
	});

	it('zero hp leans red', () => {
		const [r, g, b] = rgb(lerpHpColor(0));
		expect(r).toBeGreaterThan(g);
		expect(r).toBeGreaterThan(b);
	});

	it('clamps inputs outside [0,1]', () => {
		const above = lerpHpColor(2);
		const at1 = lerpHpColor(1);
		const below = lerpHpColor(-3);
		const at0 = lerpHpColor(0);
		expect(above).toBe(at1);
		expect(below).toBe(at0);
	});

	it('produces monotonic green channel as ratio increases', () => {
		const greens: number[] = [];
		for (let r = 0; r <= 1; r += 0.1) {
			const [, g] = rgb(lerpHpColor(r));
			greens.push(g);
		}
		for (let i = 1; i < greens.length; i++) {
			expect(greens[i]).toBeGreaterThanOrEqual(greens[i - 1] - 1);
		}
	});
});

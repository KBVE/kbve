import { describe, it, expect } from 'vitest';
import {
	newInterp,
	pushSample,
	resetInterp,
	sampleAt,
	INTERP_DELAY_MS,
	type InterpBuffer,
} from './interp';

/** Feed a straight uniform run of samples, one per `step` ms. */
function line(count: number, step = 100): InterpBuffer {
	const b = newInterp(0, 0, 0);
	for (let i = 1; i < count; i++) pushSample(b, i * step, i, 0);
	return b;
}

describe('pushSample', () => {
	it('seeds the buffer with a single sample', () => {
		expect(newInterp(5, 1, 2).buf).toEqual([{ t: 5, x: 1, y: 2 }]);
	});

	it('ignores a repeat of the current position', () => {
		const b = newInterp(0, 3, 4);
		pushSample(b, 100, 3, 4);
		pushSample(b, 200, 3, 4);
		expect(b.buf).toHaveLength(1);
	});

	it('appends once the position actually changes', () => {
		const b = newInterp(0, 3, 4);
		pushSample(b, 100, 3, 4);
		pushSample(b, 200, 3, 5);
		expect(b.buf).toHaveLength(2);
		expect(b.buf[1]).toEqual({ t: 200, x: 3, y: 5 });
	});

	it('caps the ring and drops the oldest sample', () => {
		const b = line(12);
		expect(b.buf).toHaveLength(6);
		// Oldest kept is the 7th pushed (x=6), newest is x=11.
		expect(b.buf[0].x).toBe(6);
		expect(b.buf[b.buf.length - 1].x).toBe(11);
	});

	it('resets to a single fresh sample', () => {
		const b = line(5);
		resetInterp(b, 999, 42, 43);
		expect(b.buf).toEqual([{ t: 999, x: 42, y: 43 }]);
	});
});

describe('sampleAt', () => {
	it('returns null for an empty buffer', () => {
		expect(sampleAt({ buf: [] }, 0)).toBeNull();
	});

	it('holds still on a single sample', () => {
		const r = sampleAt(newInterp(0, 7, 8), 500)!;
		expect(r).toEqual({ x: 7, y: 8, vx: 0, vy: 0, moving: false });
	});

	it('snaps to the newest sample once render time catches up', () => {
		const b = line(4);
		const last = b.buf[b.buf.length - 1];
		const r = sampleAt(b, last.t + 1000)!;
		expect(r.x).toBe(last.x);
		expect(r.y).toBe(last.y);
		expect(r.moving).toBe(false);
		expect(r.vx).toBe(0);
	});

	it('clamps to the oldest sample when render time lags behind it', () => {
		const b = line(4);
		const r = sampleAt(b, b.buf[0].t - 500)!;
		expect(r.x).toBe(b.buf[0].x);
		expect(r.y).toBe(b.buf[0].y);
		// Still flagged moving — the entity is mid-run, the buffer just hasn't
		// caught up, so it should keep its walk animation rather than idle.
		expect(r.moving).toBe(true);
	});

	it('lands between the bracketing samples mid-segment', () => {
		const b = line(4);
		const r = sampleAt(b, 150)!;
		expect(r.x).toBeGreaterThan(1);
		expect(r.x).toBeLessThan(2);
		expect(r.moving).toBe(true);
	});

	it('reproduces a straight uniform run linearly', () => {
		const b = line(5);
		// Catmull-Rom through evenly spaced collinear points is the line itself.
		for (const [t, x] of [
			[100, 1],
			[150, 1.5],
			[250, 2.5],
			[300, 3],
		]) {
			expect(sampleAt(b, t)!.x).toBeCloseTo(x, 6);
		}
	});

	it('stays on the segment the render time falls in', () => {
		const b = line(6);
		// Straddle each interior boundary; x must track the segment index.
		expect(sampleAt(b, 299)!.x).toBeCloseTo(2.99, 4);
		expect(sampleAt(b, 301)!.x).toBeCloseTo(3.01, 4);
	});

	it('reports velocity pointing along the direction of travel', () => {
		const b = newInterp(0, 0, 0);
		pushSample(b, 100, 0, 5);
		pushSample(b, 200, 0, 10);
		const r = sampleAt(b, 150)!;
		expect(r.vy).toBeGreaterThan(0);
		expect(Math.abs(r.vx)).toBeLessThan(1e-9);
	});

	it('advances monotonically along a straight run', () => {
		const b = line(5);
		let prev = -Infinity;
		for (let t = 10; t <= 390; t += 10) {
			const x = sampleAt(b, t)!.x;
			expect(x).toBeGreaterThanOrEqual(prev - 1e-9);
			prev = x;
		}
	});

	it('emits finite values when samples share a timestamp', () => {
		// Two arrivals stamped the same ms is normal under a burst. The segment
		// search can never *select* the zero-length pair (the render-time bounds
		// checks return first), but the surrounding maths still has to stay
		// finite — a NaN here would poison the sprite transform for good.
		const b: InterpBuffer = {
			buf: [
				{ t: 0, x: 0, y: 0 },
				{ t: 100, x: 5, y: 0 },
				{ t: 100, x: 9, y: 0 },
				{ t: 200, x: 14, y: 0 },
			],
		};
		for (const t of [50, 100, 150, 199]) {
			const r = sampleAt(b, t)!;
			expect(Number.isFinite(r.x), `x at ${t}`).toBe(true);
			expect(Number.isFinite(r.y), `y at ${t}`).toBe(true);
			expect(Number.isFinite(r.vx), `vx at ${t}`).toBe(true);
			expect(Number.isFinite(r.vy), `vy at ${t}`).toBe(true);
		}
	});

	it('exposes a delay long enough to bracket a sample gap', () => {
		// The render clock runs INTERP_DELAY_MS behind so there is normally a
		// future sample to interpolate toward instead of extrapolating.
		expect(INTERP_DELAY_MS).toBeGreaterThan(0);
		const b = line(4);
		const newest = b.buf[b.buf.length - 1].t;
		const r = sampleAt(b, newest - INTERP_DELAY_MS)!;
		expect(r.moving).toBe(true);
	});
});

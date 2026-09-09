import { describe, it, expect } from 'vitest';
import { classifyStrafe, strafeBin, LEG_TWIST_MAX } from './strafe';

const D = Math.PI / 180;

describe('strafe classifier', () => {
	it('forward travel: normal playback, no twist', () => {
		const s = classifyStrafe(0);
		expect(s.reverse).toBe(false);
		expect(s.legTwist).toBe(0);
	});

	it('slight diagonal: twists legs toward travel, clamped', () => {
		const s = classifyStrafe(40 * D);
		expect(s.reverse).toBe(false);
		expect(s.legTwist).toBeCloseTo(40 * D, 5);
		const clamped = classifyStrafe(85 * D);
		expect(clamped.legTwist).toBeCloseTo(LEG_TWIST_MAX, 5);
	});

	it('backpedal: reversed playback, twist mirrors around rear axis', () => {
		const s = classifyStrafe(180 * D);
		expect(s.reverse).toBe(true);
		expect(s.legTwist).toBeCloseTo(0, 5);
		const diag = classifyStrafe(150 * D);
		expect(diag.reverse).toBe(true);
		expect(diag.legTwist).toBeCloseTo(-30 * D, 5);
	});

	it('symmetry: left mirrors right', () => {
		const l = classifyStrafe(60 * D);
		const r = classifyStrafe(-60 * D);
		expect(l.legTwist).toBeCloseTo(-r.legTwist, 5);
		expect(l.reverse).toBe(r.reverse);
	});

	it('angles normalize beyond ±180°', () => {
		const s = classifyStrafe(200 * D);
		expect(s.reverse).toBe(true);
		expect(s.legTwist).toBeCloseTo(classifyStrafe(-160 * D).legTwist, 5);
	});
});

describe('strafe direction bins', () => {
	it('maps 8 directions, positive offset = left', () => {
		expect(strafeBin(0)).toBe('Fwd');
		expect(strafeBin(45 * D)).toBe('FwdL');
		expect(strafeBin(-45 * D)).toBe('FwdR');
		expect(strafeBin(90 * D)).toBe('L');
		expect(strafeBin(-90 * D)).toBe('R');
		expect(strafeBin(135 * D)).toBe('BwdL');
		expect(strafeBin(-135 * D)).toBe('BwdR');
		expect(strafeBin(180 * D)).toBe('Bwd');
	});

	it('bin edges at 22.5° boundaries and wraps', () => {
		expect(strafeBin(22 * D)).toBe('Fwd');
		expect(strafeBin(23 * D)).toBe('FwdL');
		expect(strafeBin(-112 * D)).toBe('R');
		expect(strafeBin(-113 * D)).toBe('BwdR');
		expect(strafeBin(220 * D)).toBe('BwdR');
	});
});

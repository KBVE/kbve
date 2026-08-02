import { describe, it, expect } from 'vitest';
import {
	isPowerOfTwo,
	plannedSize,
	preservesPowerOfTwo,
} from './textureSize';

describe('plannedSize', () => {
	it('halves a 512 square to the 256 budget', () => {
		expect(plannedSize({ width: 512, height: 512 }, 256)).toEqual({
			width: 256,
			height: 256,
		});
	});

	it('skips art already within budget', () => {
		expect(plannedSize({ width: 256, height: 256 }, 256)).toBeNull();
		expect(plannedSize({ width: 64, height: 64 }, 256)).toBeNull();
	});

	it('clamps the longest edge and keeps aspect', () => {
		expect(plannedSize({ width: 1024, height: 512 }, 256)).toEqual({
			width: 256,
			height: 128,
		});
	});

	it('never rounds an edge away to zero', () => {
		const out = plannedSize({ width: 4096, height: 1 }, 256)!;
		expect(out.height).toBeGreaterThanOrEqual(1);
	});

	it('keeps power-of-two art power-of-two', () => {
		for (const src of [512, 1024, 2048]) {
			const out = plannedSize({ width: src, height: src }, 256)!;
			expect(preservesPowerOfTwo({ width: src, height: src }, out)).toBe(
				true,
			);
		}
	});

	it('flags a non-power-of-two result for power-of-two source', () => {
		expect(
			preservesPowerOfTwo(
				{ width: 512, height: 512 },
				{ width: 300, height: 300 },
			),
		).toBe(false);
	});

	it('does not constrain art that was never power-of-two', () => {
		expect(
			preservesPowerOfTwo(
				{ width: 640, height: 480 },
				{ width: 256, height: 192 },
			),
		).toBe(true);
	});
});

describe('isPowerOfTwo', () => {
	it('classifies sizes', () => {
		expect([1, 2, 64, 256, 512].every(isPowerOfTwo)).toBe(true);
		expect([0, 3, 100, 513].some(isPowerOfTwo)).toBe(false);
	});
});

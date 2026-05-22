import { describe, expect, it } from 'vitest';
import { mulberry32, parseSeed, randomSeed } from './rng';

describe('mulberry32', () => {
	it('produces deterministic stream for fixed seed', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		const av = [a(), a(), a(), a()];
		const bv = [b(), b(), b(), b()];
		expect(av).toEqual(bv);
	});

	it('different seeds produce different streams', () => {
		const a = mulberry32(1);
		const b = mulberry32(2);
		expect(a()).not.toBe(b());
	});

	it('outputs stay in [0, 1)', () => {
		const r = mulberry32(99);
		for (let i = 0; i < 200; i++) {
			const v = r();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});

describe('parseSeed', () => {
	it('reads positive integer strings', () => {
		expect(parseSeed('42')).toBe(42);
		expect(parseSeed('  100  ')).toBe(100);
	});

	it('hashes non-numeric strings', () => {
		const a = parseSeed('hello');
		const b = parseSeed('world');
		expect(a).not.toBe(null);
		expect(b).not.toBe(null);
		expect(a).not.toBe(b);
	});

	it('returns null for empty + nullish input', () => {
		expect(parseSeed(null)).toBe(null);
		expect(parseSeed(undefined)).toBe(null);
		expect(parseSeed('')).toBe(null);
		expect(parseSeed('   ')).toBe(null);
	});

	it('coerces u32 range', () => {
		const v = parseSeed('hello');
		expect(v).toBeGreaterThanOrEqual(0);
		expect(v).toBeLessThanOrEqual(0xffffffff);
	});
});

describe('randomSeed', () => {
	it('returns a u32 integer', () => {
		const v = randomSeed();
		expect(Number.isInteger(v)).toBe(true);
		expect(v).toBeGreaterThanOrEqual(0);
		expect(v).toBeLessThanOrEqual(0xffffffff);
	});
});

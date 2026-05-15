import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatCompact } from './format';

describe('formatCompact', () => {
	describe('null / undefined / NaN guards', () => {
		it('returns em dash for null', () => {
			expect(formatCompact(null)).toBe('—');
		});

		it('returns em dash for undefined', () => {
			expect(formatCompact(undefined)).toBe('—');
		});

		it('returns em dash for NaN', () => {
			expect(formatCompact(Number.NaN)).toBe('—');
		});

		it('returns em dash for Infinity', () => {
			expect(formatCompact(Number.POSITIVE_INFINITY)).toBe('—');
			expect(formatCompact(Number.NEGATIVE_INFINITY)).toBe('—');
		});
	});

	describe('small integers stay raw', () => {
		it.each([
			[0, '0'],
			[1, '1'],
			[42, '42'],
			[999, '999'],
		])('formatCompact(%i) → %s', (input, expected) => {
			expect(formatCompact(input)).toBe(expected);
		});
	});

	describe('thousands collapse to K', () => {
		it('1000 → 1K', () => {
			expect(formatCompact(1000)).toBe('1K');
		});

		it('1234 → 1.2K (one decimal under 10)', () => {
			expect(formatCompact(1234)).toBe('1.2K');
		});

		it('12345 → 12.3K (Intl keeps one decimal)', () => {
			expect(formatCompact(12345)).toBe('12.3K');
		});

		it('123456 → 123.5K', () => {
			expect(formatCompact(123456)).toBe('123.5K');
		});

		it('999999 rounds up to 1M (boundary)', () => {
			expect(formatCompact(999999)).toBe('1M');
		});
	});

	describe('millions collapse to M', () => {
		it('1000000 → 1M', () => {
			expect(formatCompact(1_000_000)).toBe('1M');
		});

		it('1234567 → 1.2M', () => {
			expect(formatCompact(1_234_567)).toBe('1.2M');
		});

		it('12345678 → 12.3M', () => {
			expect(formatCompact(12_345_678)).toBe('12.3M');
		});
	});

	describe('billions collapse to B', () => {
		it('1000000000 → 1B', () => {
			expect(formatCompact(1_000_000_000)).toBe('1B');
		});
	});

	describe('negative numbers', () => {
		it('-1234 → -1.2K (preserves sign)', () => {
			expect(formatCompact(-1234)).toBe('-1.2K');
		});

		it('-12345 → -12.3K', () => {
			expect(formatCompact(-12345)).toBe('-12.3K');
		});
	});

	describe('fuzz', () => {
		it('always returns a non-empty string for any finite number', () => {
			fc.assert(
				fc.property(
					fc.double({
						noNaN: true,
						min: -1e15,
						max: 1e15,
					}),
					(n) => {
						const out = formatCompact(n);
						return typeof out === 'string' && out.length > 0;
					},
				),
				{ numRuns: 500 },
			);
		});

		it('never throws for any value, including pathological cases', () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.double(),
						fc.constant(Number.NaN),
						fc.constant(Number.POSITIVE_INFINITY),
						fc.constant(Number.NEGATIVE_INFINITY),
						fc.constant(0),
						fc.constant(-0),
						fc.integer(),
						fc.bigInt().map((b) => Number(b)),
					),
					(n) => {
						expect(() => formatCompact(n)).not.toThrow();
					},
				),
				{ numRuns: 500 },
			);
		});

		it('produces em dash for non-finite, real output otherwise', () => {
			fc.assert(
				fc.property(fc.double(), (n) => {
					const out = formatCompact(n);
					if (!Number.isFinite(n)) {
						return out === '—';
					}
					return out !== '—';
				}),
				{ numRuns: 500 },
			);
		});

		it('monotonic-ish: larger magnitudes do not shrink output length too aggressively', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1000, max: 1_000_000_000 }),
					(n) => {
						const out = formatCompact(n);
						return out.length <= 6;
					},
				),
				{ numRuns: 300 },
			);
		});
	});
});

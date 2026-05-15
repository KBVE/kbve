import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cn } from './utils';

describe('cn', () => {
	it('joins multiple classes with a single space', () => {
		expect(cn('a', 'b', 'c')).toBe('a b c');
	});

	it('drops falsy values', () => {
		expect(cn('a', false, null, undefined, 0, 'b')).toBe('a b');
	});

	it('handles objects with truthy values', () => {
		expect(cn('a', { b: true, c: false, d: 1 })).toBe('a b d');
	});

	it('flattens arrays', () => {
		expect(cn(['a', 'b'], 'c', ['d', ['e']])).toBe('a b c d e');
	});

	it('tailwind-merge resolves conflicts (later wins)', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4');
		expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
	});

	it('preserves non-conflicting tailwind utilities', () => {
		const out = cn('p-2', 'm-4', 'text-red-500');
		expect(out).toContain('p-2');
		expect(out).toContain('m-4');
		expect(out).toContain('text-red-500');
	});

	it('returns empty string with no inputs', () => {
		expect(cn()).toBe('');
	});

	it('fuzz: never throws on arbitrary scalar inputs', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.oneof(
						fc.string(),
						fc.boolean(),
						fc.constant(null),
						fc.constant(undefined),
						fc.integer(),
					),
				),
				(parts) => {
					expect(() => cn(...parts)).not.toThrow();
					expect(typeof cn(...parts)).toBe('string');
				},
			),
			{ numRuns: 300 },
		);
	});

	it('fuzz: output is always a single-line whitespace-separated string', () => {
		fc.assert(
			fc.property(fc.array(fc.string()), (parts) => {
				const out = cn(...parts);
				return !out.includes('\n');
			}),
			{ numRuns: 300 },
		);
	});
});

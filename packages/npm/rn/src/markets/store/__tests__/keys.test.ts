import { describe, it, expect } from 'vitest';
import { newIdempotencyKey } from '../keys';

describe('newIdempotencyKey', () => {
	it('returns a unique non-empty string each call', () => {
		const a = newIdempotencyKey();
		const b = newIdempotencyKey();
		expect(a).toBeTruthy();
		expect(typeof a).toBe('string');
		expect(a).not.toBe(b);
	});
});

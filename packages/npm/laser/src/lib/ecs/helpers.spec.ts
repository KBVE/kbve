import { describe, it, expect } from 'vitest';
import { packTile } from './helpers';

describe('packTile', () => {
	it('is deterministic', () => {
		expect(packTile(3, -7)).toBe(packTile(3, -7));
	});

	it('produces a unique key per tile across a grid incl. negatives', () => {
		const seen = new Map<number, string>();
		for (let x = -40; x <= 40; x++) {
			for (let y = -40; y <= 40; y++) {
				const key = packTile(x, y);
				const tag = `${x},${y}`;
				const prev = seen.get(key);
				expect(prev, `collision ${tag} vs ${prev}`).toBeUndefined();
				seen.set(key, tag);
			}
		}
	});

	it('keeps x and y independent (swapping differs off the diagonal)', () => {
		expect(packTile(2, 5)).not.toBe(packTile(5, 2));
		expect(packTile(-2, 5)).not.toBe(packTile(5, -2));
	});

	it('returns a non-negative integer for negative coords', () => {
		const k = packTile(-1, -1);
		expect(Number.isInteger(k)).toBe(true);
		expect(k).toBeGreaterThanOrEqual(0);
	});
});

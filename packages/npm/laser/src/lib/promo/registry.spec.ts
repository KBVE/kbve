import { describe, it, expect } from 'vitest';
import { pickAd, AdRegistry } from './registry';
import type { AdCreative } from './types';

const ad = (id: string, weight?: number): AdCreative => ({
	id,
	title: id,
	url: `https://example.com/${id}`,
	weight,
});

describe('pickAd', () => {
	it('returns null for an empty pool', () => {
		expect(pickAd([])).toBeNull();
	});

	it('returns null when every weight is non-positive', () => {
		expect(pickAd([ad('a', 0), ad('b', -3)])).toBeNull();
	});

	it('honors weighted boundaries with an injected rng', () => {
		const pool = [ad('a', 1), ad('b', 3)];
		expect(pickAd(pool, () => 0)?.id).toBe('a');
		expect(pickAd(pool, () => 0.2)?.id).toBe('a');
		expect(pickAd(pool, () => 0.3)?.id).toBe('b');
		expect(pickAd(pool, () => 0.99)?.id).toBe('b');
	});

	it('skips zero-weight entries', () => {
		const pool = [ad('a', 0), ad('b', 1)];
		expect(pickAd(pool, () => 0)?.id).toBe('b');
	});
});

describe('AdRegistry', () => {
	it('registers, dedupes by id, removes, and picks', () => {
		const reg = new AdRegistry();
		reg.register(ad('a'), ad('b'));
		reg.register({ ...ad('a'), title: 'updated' });
		expect(reg.list()).toHaveLength(2);
		expect(reg.list().find((c) => c.id === 'a')?.title).toBe('updated');
		reg.remove('b');
		expect(reg.pick(() => 0)?.id).toBe('a');
		reg.clear();
		expect(reg.pick()).toBeNull();
	});
});

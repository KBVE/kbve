import { describe, expect, it } from 'vitest';
import { CARD_POOL, pickCards, pickCardsForWave } from './pool';

describe('cards/pool', () => {
	it('pickCards returns requested count clamped by pool size', () => {
		const three = pickCards(3);
		expect(three).toHaveLength(3);
		const max = pickCards(99);
		expect(max).toHaveLength(CARD_POOL.length);
	});

	it('pickCards returns unique cards (no duplicates)', () => {
		const five = pickCards(5);
		const ids = five.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('pickCardsForWave returns 3 by default, 5 at wave 20+', () => {
		expect(pickCardsForWave(1)).toHaveLength(3);
		expect(pickCardsForWave(19)).toHaveLength(3);
		expect(pickCardsForWave(20)).toHaveLength(5);
		expect(pickCardsForWave(50)).toHaveLength(5);
	});

	it('CARD_POOL ids are unique', () => {
		const ids = CARD_POOL.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

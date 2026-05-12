import { describe, expect, it } from 'vitest';

import {
	buildShoe,
	cardId,
	cardPoints,
	cardRank,
	cardSuit,
	encodeCard,
	isBlackjack,
	valueHand,
} from './cards';

describe('blackjack card encoding', () => {
	it('packs and decodes suit and rank into a card byte', () => {
		const card = encodeCard('diamonds', '9');

		expect(card).toBeTypeOf('number');
		expect(card).toBeLessThanOrEqual(0xff);
		expect(cardId(card)).toBe('diamonds-9');
		expect(cardSuit(card)).toBe('diamonds');
		expect(cardRank(card)).toBe('9');
		expect(cardPoints(card)).toBe(9);
	});

	it('builds multi-deck shoes without object card allocation', () => {
		const shoe = buildShoe(6);

		expect(shoe).toHaveLength(312);
		expect(shoe.every((card) => typeof card === 'number')).toBe(true);
		expect(new Set(shoe.map(cardId))).toHaveLength(52);
	});

	it('keeps blackjack hand valuation semantics', () => {
		const ace = encodeCard('spades', 'A');
		const king = encodeCard('hearts', 'K');
		const nine = encodeCard('clubs', '9');

		expect(isBlackjack([ace, king])).toBe(true);
		expect(valueHand([ace, nine, king])).toEqual({
			total: 20,
			soft: false,
		});
	});
});

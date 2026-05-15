import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	buildShoe,
	cardId,
	cardPoints,
	cardRank,
	cardSuit,
	encodeCard,
	handFingerprint,
	isBlackjack,
	shuffleCards,
	shuffleCardsInPlace,
	valueHand,
} from './cards';

describe('blackjack card encoding', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

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
		const queen = encodeCard('diamonds', 'Q');
		const nine = encodeCard('clubs', '9');

		expect(isBlackjack([ace, king])).toBe(true);
		expect(isBlackjack([queen, king])).toBe(false);
		expect(isBlackjack([ace, nine, king])).toBe(false);
		expect(valueHand([ace, nine, king])).toEqual({
			total: 20,
			soft: false,
		});
	});

	it('supports immutable and in-place card shuffles', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const cards = [
			encodeCard('spades', 'A'),
			encodeCard('hearts', 'K'),
			encodeCard('clubs', '9'),
		];

		const shuffled = shuffleCards(cards);
		const mutable = [...cards];
		const inPlace = shuffleCardsInPlace(mutable);

		expect(shuffled).toEqual([
			encodeCard('hearts', 'K'),
			encodeCard('clubs', '9'),
			encodeCard('spades', 'A'),
		]);
		expect(cards).toEqual([
			encodeCard('spades', 'A'),
			encodeCard('hearts', 'K'),
			encodeCard('clubs', '9'),
		]);
		expect(inPlace).toBe(mutable);
		expect(mutable).toEqual(shuffled);
	});

	it('builds stable bit-packed hand fingerprints', () => {
		const hand = [
			encodeCard('spades', 'A'),
			encodeCard('hearts', '9'),
			encodeCard('clubs', 'J'),
		];
		const reordered = [hand[1], hand[0], hand[2]];
		const longHand = [
			...hand,
			encodeCard('diamonds', '2'),
			encodeCard('spades', '3'),
			encodeCard('hearts', '4'),
		];

		expect(handFingerprint(hand)).toBe(handFingerprint([...hand]));
		expect(handFingerprint(hand)).not.toBe(handFingerprint(reordered));
		expect(handFingerprint(longHand)).toBe(handFingerprint([...longHand]));
		expect(handFingerprint(longHand)).not.toBe(handFingerprint(hand));
	});
});

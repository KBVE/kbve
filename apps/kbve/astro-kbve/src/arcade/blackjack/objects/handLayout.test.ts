import { describe, expect, it } from 'vitest';

import { encodeCard } from '../cards';
import { CARD_SIZE } from '../config';
import { HandLayout } from './handLayout';

describe('blackjack hand layout', () => {
	it('precomputes centered card placements with stable spacing', () => {
		const layout = new HandLayout((card) => `card-${card}`);
		const cards = [
			encodeCard('spades', 'A'),
			encodeCard('clubs', 'K'),
			encodeCard('diamonds', '3'),
		];
		const cardGap = 18;
		const cardStride = CARD_SIZE.width + cardGap;
		const firstX = 640 - (CARD_SIZE.width * cards.length + cardGap * 2) / 2;

		const placements = layout.cardPlacements(
			cards,
			640,
			420,
			false,
			'player',
		);

		expect(placements).toHaveLength(3);
		expect(placements.map((placement) => placement.x)).toEqual([
			firstX,
			firstX + cardStride,
			firstX + cardStride * 2,
		]);
		expect(placements.map((placement) => placement.y)).toEqual([
			420, 420, 420,
		]);
	});

	it('reuses cached placements when the hand layout inputs are unchanged', () => {
		const layout = new HandLayout((card) => `card-${card}`);
		const cards = [encodeCard('hearts', '9'), encodeCard('clubs', 'K')];

		const first = layout.cardPlacements(cards, 640, 166, false, 'dealer');
		const second = layout.cardPlacements(
			[...cards],
			640,
			166,
			false,
			'dealer',
		);

		expect(second).toBe(first);
	});

	it('refreshes cached placements when hole card visibility changes', () => {
		const layout = new HandLayout((card) =>
			card === 'back' ? 'card-back' : `card-${card}`,
		);
		const cards = [encodeCard('hearts', '9'), encodeCard('clubs', 'K')];

		const hidden = layout.cardPlacements(cards, 640, 166, true, 'dealer');
		const visible = layout.cardPlacements(cards, 640, 166, false, 'dealer');

		expect(hidden).not.toBe(visible);
		expect(hidden[1].textureKey).toBe('card-back');
		expect(visible[1].textureKey).toBe(`card-${cards[1]}`);
	});
});

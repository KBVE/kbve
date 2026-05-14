import { describe, expect, it } from 'vitest';

import { encodeCard } from '../cards';
import { HandValueFormatter } from './handValueFormatter';

describe('blackjack hand value formatter', () => {
	it('formats empty, soft, and natural hand labels', () => {
		const formatter = new HandValueFormatter();
		const ace = encodeCard('spades', 'A');
		const king = encodeCard('hearts', 'K');

		expect(formatter.label('dealer', 'Dealer', [])).toBe('Dealer: -');
		expect(formatter.label('dealer', 'Dealer', [ace])).toBe(
			'Dealer  11 soft',
		);
		expect(formatter.label('player', 'Player', [ace, king])).toBe(
			'Player  21 soft blackjack',
		);
	});

	it('formats only visible cards when the dealer hole card is hidden', () => {
		const formatter = new HandValueFormatter();
		const dealer = [encodeCard('spades', '9'), encodeCard('hearts', 'K')];

		expect(formatter.label('dealer', 'Dealer', dealer, 1)).toBe(
			'Dealer  9',
		);
		expect(formatter.label('dealer', 'Dealer', dealer)).toBe('Dealer  19');
	});

	it('refreshes cached labels when cards change behind the same key', () => {
		const formatter = new HandValueFormatter();

		expect(
			formatter.label('player', 'Player', [
				encodeCard('clubs', '8'),
				encodeCard('diamonds', '2'),
			]),
		).toBe('Player  10');
		expect(
			formatter.label('player', 'Player', [
				encodeCard('clubs', '8'),
				encodeCard('diamonds', '3'),
			]),
		).toBe('Player  11');
	});
});

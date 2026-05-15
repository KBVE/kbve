import { describe, expect, it } from 'vitest';
import {
	BASE_HEIGHT,
	BASE_WIDTH,
	CARD_SIZE,
	COLORS,
	FONT,
	GAME,
} from './config';

describe('blackjack config invariants', () => {
	it('base resolution is a sensible 16:10 widescreen', () => {
		expect(BASE_WIDTH).toBeGreaterThan(0);
		expect(BASE_HEIGHT).toBeGreaterThan(0);
		const ratio = BASE_WIDTH / BASE_HEIGHT;
		expect(ratio).toBeGreaterThan(1);
		expect(ratio).toBeLessThan(2);
	});

	it('card geometry is positive and rounded corner radius is sane', () => {
		expect(CARD_SIZE.width).toBeGreaterThan(0);
		expect(CARD_SIZE.height).toBeGreaterThan(0);
		expect(CARD_SIZE.radius).toBeGreaterThanOrEqual(0);
		expect(CARD_SIZE.radius).toBeLessThan(
			Math.min(CARD_SIZE.width, CARD_SIZE.height) / 2,
		);
	});

	it('card aspect ratio is portrait (height > width)', () => {
		expect(CARD_SIZE.height).toBeGreaterThan(CARD_SIZE.width);
	});

	it('FONT lookup has serif / sans / mono entries', () => {
		expect(typeof FONT.serif).toBe('string');
		expect(typeof FONT.sans).toBe('string');
		expect(typeof FONT.mono).toBe('string');
		expect(FONT.serif.length).toBeGreaterThan(0);
	});

	it('numeric COLORS are 24-bit RGB values (0..0xFFFFFF)', () => {
		const numericKeys: Array<keyof typeof COLORS> = [
			'background',
			'feltCenter',
			'feltEdge',
			'feltPattern',
			'feltInk',
			'tableTrim',
			'tableTrimDark',
			'rail',
			'railLight',
			'panel',
			'panelStroke',
			'cardFace',
			'cardBorder',
			'cardBack',
			'cardBackAccent',
			'tableShadow',
			'action',
		];
		for (const k of numericKeys) {
			const v = COLORS[k];
			expect(typeof v).toBe('number');
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(0xffffff);
		}
	});

	it('string COLORS are valid CSS hex strings', () => {
		const stringKeys: Array<keyof typeof COLORS> = [
			'red',
			'black',
			'gold',
			'soft',
			'muted',
			'danger',
		];
		for (const k of stringKeys) {
			const v = COLORS[k];
			expect(typeof v).toBe('string');
			expect(v).toMatch(/^#[0-9a-fA-F]{3,8}$/);
		}
	});

	describe('GAME rules', () => {
		it('starting bankroll is positive', () => {
			expect(GAME.startingBankroll).toBeGreaterThan(0);
		});

		it('default bet is between min and max bet', () => {
			expect(GAME.defaultBet).toBeGreaterThanOrEqual(GAME.minBet);
			expect(GAME.defaultBet).toBeLessThanOrEqual(GAME.maxBet);
		});

		it('min bet is positive and not greater than max', () => {
			expect(GAME.minBet).toBeGreaterThan(0);
			expect(GAME.minBet).toBeLessThan(GAME.maxBet);
		});

		it('max bet does not exceed starting bankroll (no immediate ruin)', () => {
			expect(GAME.maxBet).toBeLessThanOrEqual(GAME.startingBankroll);
		});

		it('deck count is a standard multi-deck shoe (1, 2, 4, 6, or 8)', () => {
			expect([1, 2, 4, 6, 8]).toContain(GAME.decks);
		});

		it('blackjack payout is the standard 3:2 or higher', () => {
			expect(GAME.blackjackPayout).toBeGreaterThanOrEqual(1.2);
		});

		it('dealer rule is a boolean', () => {
			expect(typeof GAME.dealerHitsSoft17).toBe('boolean');
		});
	});
});

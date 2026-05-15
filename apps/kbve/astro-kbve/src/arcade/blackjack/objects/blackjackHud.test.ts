import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import { BlackjackHud, type BlackjackHudValues } from './blackjackHud';

class MockGraphics {
	readonly fillStyle = vi.fn(() => this);
	readonly fillRoundedRect = vi.fn(() => this);
	readonly lineStyle = vi.fn(() => this);
	readonly strokeRoundedRect = vi.fn(() => this);
}

class MockImage {
	readonly setOrigin = vi.fn(() => this);
}

class MockText {
	readonly setOrigin = vi.fn(() => this);
	readonly setText = vi.fn(() => this);
	readonly setColor = vi.fn(() => this);
}

function createHud() {
	const texts: MockText[] = [];
	const scene = {
		add: {
			graphics: vi.fn(() => new MockGraphics()),
			image: vi.fn(() => new MockImage()),
			text: vi.fn(() => {
				const text = new MockText();
				texts.push(text);
				return text;
			}),
		},
	};
	const layer = { add: vi.fn() };
	const hud = new BlackjackHud(scene as never, layer as never, 'chip');
	hud.create();
	return { hud, texts };
}

const values: BlackjackHudValues = {
	bankroll: 'Bankroll $1000\nBet $25',
	status: 'Place your bet.',
	statusColor: '#ffffff',
	strategy: '',
	betChip: '$25',
	dealerValue: 'Dealer: -',
	playerValue: 'Player: -',
	shoe: 'Shoe 312 cards\nRound 0',
	stats: 'Session  W 0  L 0  P 0\nBJ 0  Best $1000',
};

describe('blackjack HUD', () => {
	it('skips field cache checks when the same values object is reused', () => {
		const { hud, texts } = createHud();

		hud.update(values);
		hud.update(values);

		const textUpdates = texts.reduce(
			(total, text) => total + text.setText.mock.calls.length,
			0,
		);
		const colorUpdates = texts.reduce(
			(total, text) => total + text.setColor.mock.calls.length,
			0,
		);

		expect(textUpdates).toBe(8);
		expect(colorUpdates).toBe(1);
	});

	it('still skips unchanged fields when a new values object has equal text', () => {
		const { hud, texts } = createHud();

		hud.update(values);
		hud.update({ ...values });

		const textUpdates = texts.reduce(
			(total, text) => total + text.setText.mock.calls.length,
			0,
		);
		const colorUpdates = texts.reduce(
			(total, text) => total + text.setColor.mock.calls.length,
			0,
		);

		expect(textUpdates).toBe(8);
		expect(colorUpdates).toBe(1);
	});
});

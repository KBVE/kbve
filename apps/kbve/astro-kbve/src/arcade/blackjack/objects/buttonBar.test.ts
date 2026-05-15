import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import { ButtonBar, type ButtonSpec } from './buttonBar';

class MockImage {
	readonly setOrigin = vi.fn(() => this);
	readonly setDisplaySize = vi.fn(() => this);
	readonly setTexture = vi.fn(() => this);
}

class MockText {
	readonly setOrigin = vi.fn(() => this);
	readonly setAlpha = vi.fn(() => this);
}

class MockZone {
	private pointerUp: (() => void) | undefined;
	readonly setOrigin = vi.fn(() => this);
	readonly setInteractive = vi.fn(() => this);
	readonly on = vi.fn((_event: string, callback: () => void) => {
		this.pointerUp = callback;
		return this;
	});

	click() {
		this.pointerUp?.();
	}
}

function createHarness(spec: ButtonSpec) {
	const image = new MockImage();
	const text = new MockText();
	const zone = new MockZone();
	const scene = {
		add: {
			image: vi.fn(() => image),
			text: vi.fn(() => text),
			zone: vi.fn(() => zone),
		},
	};
	const layer = { add: vi.fn() };
	const bar = new ButtonBar(
		scene as never,
		layer as never,
		(enabled) => (enabled ? 'button-on' : 'button-off'),
		vi.fn(),
	);

	bar.create([spec]);
	return { bar, image, text, zone };
}

describe('blackjack button bar', () => {
	it('skips unchanged alpha and texture updates across renders', () => {
		const spec: ButtonSpec = {
			key: 'deal',
			label: 'Deal',
			x: 0,
			y: 0,
			w: 92,
			enabled: () => true,
			action: vi.fn(),
		};
		const { bar, image, text } = createHarness(spec);

		bar.update();
		bar.update();

		expect(image.setTexture).not.toHaveBeenCalled();
		expect(text.setAlpha).not.toHaveBeenCalled();
	});

	it('updates alpha and texture when enabled state changes', () => {
		let enabled = true;
		const spec: ButtonSpec = {
			key: 'hit',
			label: 'Hit',
			x: 0,
			y: 0,
			w: 82,
			enabled: () => enabled,
			action: vi.fn(),
		};
		const { bar, image, text } = createHarness(spec);

		bar.update();
		enabled = false;
		bar.update();

		expect(image.setTexture).toHaveBeenCalledTimes(1);
		expect(text.setAlpha).toHaveBeenCalledTimes(1);
	});

	it('seeds disabled alpha during creation', () => {
		const spec: ButtonSpec = {
			key: 'hit',
			label: 'Hit',
			x: 0,
			y: 0,
			w: 82,
			enabled: () => false,
			action: vi.fn(),
		};
		const { bar, image, text } = createHarness(spec);

		bar.update();

		expect(image.setTexture).not.toHaveBeenCalled();
		expect(text.setAlpha).toHaveBeenCalledTimes(1);
		expect(text.setAlpha).toHaveBeenCalledWith(0.42);
	});

	it('runs actions through the keyed view cache', () => {
		const action = vi.fn();
		const spec: ButtonSpec = {
			key: 'stand',
			label: 'Stand',
			x: 0,
			y: 0,
			w: 92,
			enabled: () => true,
			action,
		};
		const { bar } = createHarness(spec);

		expect(bar.run('stand')).toBe(true);
		expect(bar.run('deal')).toBe(false);
		expect(action).toHaveBeenCalledTimes(1);
	});
});

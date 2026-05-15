import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import { createBlackjackState, type BlackjackState } from '../state';
import { BlackjackControls } from './blackjackControls';

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
	readonly setOrigin = vi.fn(() => this);
	readonly setInteractive = vi.fn(() => this);
	readonly on = vi.fn(() => this);
}

function createHarness() {
	let state: BlackjackState = createBlackjackState();
	const images: MockImage[] = [];
	const texts: MockText[] = [];
	const scene = {
		add: {
			image: vi.fn(() => {
				const image = new MockImage();
				images.push(image);
				return image;
			}),
			text: vi.fn(() => {
				const text = new MockText();
				texts.push(text);
				return text;
			}),
			zone: vi.fn(() => new MockZone()),
		},
		input: {
			keyboard: {
				on: vi.fn(),
			},
		},
	};
	const controls = new BlackjackControls({
		scene: scene as never,
		layer: { add: vi.fn() } as never,
		textureKey: (enabled) => (enabled ? 'button-on' : 'button-off'),
		getState: () => state,
		setState: (next) => {
			state = next;
		},
		onAction: vi.fn(),
	});

	controls.create();
	return { controls, images, texts, state };
}

function countImageTextures(images: readonly MockImage[]): number {
	return images.reduce(
		(total, image) => total + image.setTexture.mock.calls.length,
		0,
	);
}

function countTextAlphas(texts: readonly MockText[]): number {
	return texts.reduce(
		(total, text) => total + text.setAlpha.mock.calls.length,
		0,
	);
}

describe('blackjack controls', () => {
	it('skips button updates while the visual enabled state is unchanged', () => {
		const { controls, images, texts, state } = createHarness();

		controls.update();
		const firstTextureUpdates = countImageTextures(images);
		const firstAlphaUpdates = countTextAlphas(texts);

		state.bet += 25;
		controls.update();

		expect(countImageTextures(images)).toBe(firstTextureUpdates);
		expect(countTextAlphas(texts)).toBe(firstAlphaUpdates);
	});

	it('refreshes buttons when phase or double availability changes', () => {
		const { controls, images, texts, state } = createHarness();

		controls.update();
		const firstTextureUpdates = countImageTextures(images);
		const firstAlphaUpdates = countTextAlphas(texts);

		state.phase = 'player-turn';
		controls.update();

		expect(countImageTextures(images)).toBeGreaterThan(firstTextureUpdates);
		expect(countTextAlphas(texts)).toBeGreaterThan(firstAlphaUpdates);
	});
});

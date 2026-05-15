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
	const keyHandlers = new Map<string, () => void>();
	const onAction = vi.fn();
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
				on: vi.fn((event: string, callback: () => void) => {
					keyHandlers.set(event, callback);
				}),
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
		onAction,
	});

	controls.create();
	return {
		controls,
		images,
		texts,
		keyHandlers,
		onAction,
		getState: () => state,
	};
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
		const { controls, images, texts, getState } = createHarness();
		const state = getState();

		controls.update();
		const firstTextureUpdates = countImageTextures(images);
		const firstAlphaUpdates = countTextAlphas(texts);

		state.bet += 25;
		controls.update();

		expect(countImageTextures(images)).toBe(firstTextureUpdates);
		expect(countTextAlphas(texts)).toBe(firstAlphaUpdates);
	});

	it('refreshes buttons when phase or double availability changes', () => {
		const { controls, images, texts, getState } = createHarness();
		const state = getState();

		controls.update();
		const firstTextureUpdates = countImageTextures(images);
		const firstAlphaUpdates = countTextAlphas(texts);

		state.phase = 'player-turn';
		controls.update();

		expect(countImageTextures(images)).toBeGreaterThan(firstTextureUpdates);
		expect(countTextAlphas(texts)).toBeGreaterThan(firstAlphaUpdates);
	});

	it('runs keyboard actions only when the matching button is enabled', () => {
		const { keyHandlers, onAction, getState } = createHarness();
		const state = getState();

		keyHandlers.get('keydown-H')?.();
		expect(onAction).not.toHaveBeenCalled();

		state.phase = 'player-turn';
		state.player = [];
		state.dealer = [1, 2];
		state.shoe = [
			3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
			22,
		];
		keyHandlers.get('keydown-H')?.();

		expect(onAction).toHaveBeenCalledTimes(1);
		expect(state.player).toHaveLength(1);
	});

	it('maps keyboard shortcuts to betting and reset actions', () => {
		const { keyHandlers, onAction, getState } = createHarness();
		let state = getState();

		keyHandlers.get('keydown-UP')?.();
		expect(state.bet).toBe(50);
		expect(state.message).toBe('Bet set to $50.');

		keyHandlers.get('keydown-DOWN')?.();
		expect(state.bet).toBe(25);

		keyHandlers.get('keydown-ENTER')?.();
		expect(state.phase).not.toBe('betting');

		state.phase = 'round-over';
		state.player = [1];
		state.dealer = [2];
		keyHandlers.get('keydown-ENTER')?.();
		expect(state.phase).toBe('betting');
		expect(state.player).toEqual([]);

		keyHandlers.get('keydown-N')?.();
		state = getState();
		expect(state.phase).toBe('betting');
		expect(state.bankroll).toBe(1000);
		expect(onAction).toHaveBeenCalled();
	});

	it('maps stand and double keyboard shortcuts to player actions', () => {
		const { keyHandlers, onAction, getState } = createHarness();
		const state = getState();

		state.phase = 'player-turn';
		state.player = [9, 10];
		state.dealer = [22, 7];
		state.shoe = [
			3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
			22,
		];
		keyHandlers.get('keydown-S')?.();

		expect(state.phase).toBe('round-over');
		expect(state.outcome).toBe('win');

		state.phase = 'player-turn';
		state.player = [4, 5];
		state.dealer = [22, 7];
		state.shoe = [
			3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
			22,
		];
		state.canDouble = true;
		state.bankroll = 1000;
		state.bet = 25;
		keyHandlers.get('keydown-D')?.();

		expect(state.bet).toBe(50);
		expect(state.phase).toBe('round-over');
		expect(onAction).toHaveBeenCalledTimes(2);
	});
});

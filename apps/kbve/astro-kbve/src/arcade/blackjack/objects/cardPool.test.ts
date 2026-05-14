import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import { CardPool } from './cardPool';

class MockImage {
	active = false;
	visible = false;
	textureKey = '';
	x = 0;
	y = 0;
	readonly setTexture = vi.fn((textureKey: string) => {
		this.textureKey = textureKey;
		return this;
	});
	readonly setPosition = vi.fn((x: number, y: number) => {
		this.x = x;
		this.y = y;
		return this;
	});
	readonly setVisible = vi.fn((visible: boolean) => {
		this.visible = visible;
		return this;
	});
	readonly setActive = vi.fn((active: boolean) => {
		this.active = active;
		return this;
	});
	readonly setOrigin = vi.fn(() => this);
}

describe('blackjack card pool', () => {
	it('skips unchanged texture and position setters on reused views', () => {
		const images: MockImage[] = [];
		const scene = {
			add: {
				image: () => {
					const image = new MockImage();
					images.push(image);
					return image;
				},
			},
		};
		const layer = { add: vi.fn() };
		const pool = new CardPool(scene as never, layer as never, 'slot');

		pool.begin();
		pool.place('spades-A', 320, 420);
		pool.hideUnused();
		pool.begin();
		pool.place('spades-A', 320, 420);

		expect(images).toHaveLength(1);
		expect(layer.add).toHaveBeenCalledTimes(1);
		expect(images[0].setTexture).toHaveBeenCalledTimes(1);
		expect(images[0].setPosition).toHaveBeenCalledTimes(1);
	});

	it('updates a reused view when its placement changes', () => {
		const image = new MockImage();
		const scene = {
			add: {
				image: () => image,
			},
		};
		const pool = new CardPool(
			scene as never,
			{ add: vi.fn() } as never,
			'slot',
		);

		pool.begin();
		pool.place('spades-A', 320, 420);
		pool.begin();
		pool.place('hearts-K', 360, 420);

		expect(image.setTexture).toHaveBeenCalledTimes(2);
		expect(image.setPosition).toHaveBeenCalledTimes(2);
	});
});

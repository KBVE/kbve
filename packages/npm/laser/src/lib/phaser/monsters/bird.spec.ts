import { describe, it, expect, vi } from 'vitest';
import {
	getBirdNum,
	isBird,
	createBirdSprites,
	createShadowSprites,
	createBirdAnimation,
} from './bird';

vi.mock('phaser', () => ({
	Scene: class Scene {},
}));

function createMockScene() {
	const sprite = {
		setCrop: vi.fn().mockReturnThis(),
		scale: 1,
	};
	return {
		add: {
			sprite: vi.fn().mockReturnValue(sprite),
		},
		anims: {
			create: vi.fn(),
			generateFrameNumbers: vi.fn().mockReturnValue([]),
		},
		_sprite: sprite,
	};
}

describe('bird utilities', () => {
	describe('getBirdNum', () => {
		it('should extract the bird number from a char id', () => {
			expect(getBirdNum('monster_bird_0')).toBe(0);
			expect(getBirdNum('monster_bird_5')).toBe(5);
			expect(getBirdNum('monster_bird_9')).toBe(9);
		});
	});

	describe('isBird', () => {
		it('should return true for bird char ids', () => {
			expect(isBird('monster_bird_0')).toBe(true);
			expect(isBird('monster_bird_5')).toBe(true);
		});

		it('should return false for shadow char ids', () => {
			expect(isBird('monster_bird_shadow_0')).toBe(false);
		});

		it('should return false for non-bird char ids', () => {
			expect(isBird('player')).toBe(false);
			expect(isBird('npc')).toBe(false);
		});
	});

	describe('createBirdSprites', () => {
		it('should create 10 bird sprites', () => {
			const scene = createMockScene();
			const sprites = createBirdSprites(scene as any);
			expect(sprites.length).toBe(10);
			expect(scene.add.sprite).toHaveBeenCalledTimes(10);
		});

		it('should crop sprites to the bird frame', () => {
			const scene = createMockScene();
			createBirdSprites(scene as any);
			expect(scene._sprite.setCrop).toHaveBeenCalledWith(0, 0, 61, 47);
		});
	});

	describe('createShadowSprites', () => {
		it('should create 10 shadow sprites', () => {
			const scene = createMockScene();
			const sprites = createShadowSprites(scene as any);
			expect(sprites.length).toBe(10);
		});

		it('should crop sprites to the shadow frame', () => {
			const scene = createMockScene();
			createShadowSprites(scene as any);
			expect(scene._sprite.setCrop).toHaveBeenCalledWith(22, 47, 16, 10);
		});
	});

	describe('createBirdAnimation', () => {
		it('should create a bird animation', () => {
			const scene = createMockScene();
			createBirdAnimation(scene as any);
			expect(scene.anims.create).toHaveBeenCalledWith(
				expect.objectContaining({
					key: 'bird',
					frameRate: 10,
					repeat: -1,
					yoyo: true,
				}),
			);
		});
	});
});

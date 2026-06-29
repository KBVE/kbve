import { describe, it, expect, vi } from 'vitest';
import {
	createArrowPool,
	animateArrowProjectile,
} from './arrow-projectile';

vi.mock('phaser', () => ({ default: {} }));

function makeRect() {
	return {
		setOrigin: vi.fn().mockReturnThis(),
		setDepth: vi.fn().mockReturnThis(),
		setActive: vi.fn().mockReturnThis(),
		setVisible: vi.fn().mockReturnThis(),
		setPosition: vi.fn().mockReturnThis(),
		setFillStyle: vi.fn().mockReturnThis(),
		setRotation: vi.fn().mockReturnThis(),
	};
}

function makeScene(rect = makeRect()) {
	const add = { rectangle: vi.fn().mockReturnValue(rect) };
	const tweens = { add: vi.fn() };
	return { scene: { add, tweens } as never, add, tweens, rect };
}

describe('createArrowPool', () => {
	it('builds rect visuals with the configured size + depth on demand', () => {
		const { scene, add, rect } = makeScene();
		const pool = createArrowPool(scene, { width: 9, height: 3, depth: 50 });
		expect(add.rectangle).not.toHaveBeenCalled();
		const r = pool.acquire();
		expect(r).toBe(rect);
		expect(add.rectangle).toHaveBeenCalledWith(0, 0, 9, 3, 0xffffff);
		expect(rect.setDepth).toHaveBeenCalledWith(50);
	});
});

describe('animateArrowProjectile', () => {
	it('aims, colours and tweens a pooled rect, releasing it on complete', () => {
		const { scene, rect, tweens, add } = makeScene();
		const pool = createArrowPool(scene);
		animateArrowProjectile(scene, pool, {
			fromX: 0,
			fromY: 0,
			toX: 10,
			toY: 0,
			color: 0xfcd34d,
			duration: 200,
		});
		expect(rect.setPosition).toHaveBeenCalledWith(0, 0);
		expect(rect.setFillStyle).toHaveBeenCalledWith(0xfcd34d);
		expect(rect.setRotation).toHaveBeenCalledWith(0);
		const cfg = tweens.add.mock.calls[0][0];
		expect(cfg).toMatchObject({ x: 10, y: 0, duration: 200 });

		cfg.onComplete();
		expect(rect.setActive).toHaveBeenLastCalledWith(false);
		// reused, not recreated
		add.rectangle.mockClear();
		const again = pool.acquire();
		expect(again).toBe(rect);
		expect(add.rectangle).not.toHaveBeenCalled();
	});
});

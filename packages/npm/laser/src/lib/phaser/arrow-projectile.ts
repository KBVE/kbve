import Phaser from 'phaser';
import { GameObjectPool } from './object-pool';

export type ArrowPool = GameObjectPool<Phaser.GameObjects.Rectangle>;

export interface ArrowPoolOptions {
	width?: number;
	height?: number;
	depth?: number;
}

/**
 * Build a reuse pool of rectangle "arrow" visuals for a scene. Hold the returned
 * pool on the scene and pass it to animateArrowProjectile per shot — the rect is
 * recycled instead of created/destroyed, cutting GC churn during sustained fire.
 */
export function createArrowPool(
	scene: Phaser.Scene,
	{ width = 7, height = 2, depth = 0 }: ArrowPoolOptions = {},
): ArrowPool {
	return new GameObjectPool(() => {
		const r = scene.add.rectangle(0, 0, width, height, 0xffffff);
		r.setOrigin(0.5, 0.5);
		r.setDepth(depth);
		return r;
	});
}

export interface ArrowShot {
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
	color: number;
	duration?: number;
}

/**
 * Fly a pooled arrow visual from `from` to `to`: acquire a rect, colour + rotate
 * it along the travel vector, tween it across, and release it back to the pool on
 * arrival. Returns the rect (already tweening) for callers that want to track it.
 */
export function animateArrowProjectile(
	scene: Phaser.Scene,
	pool: ArrowPool,
	shot: ArrowShot,
): Phaser.GameObjects.Rectangle {
	const r = pool.acquire();
	r.setPosition(shot.fromX, shot.fromY);
	r.setFillStyle(shot.color);
	r.setRotation(Math.atan2(shot.toY - shot.fromY, shot.toX - shot.fromX));
	scene.tweens.add({
		targets: r,
		x: shot.toX,
		y: shot.toY,
		duration: shot.duration ?? 140,
		onComplete: () => pool.release(r),
	});
	return r;
}

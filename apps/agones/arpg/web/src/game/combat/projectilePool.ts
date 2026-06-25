import Phaser from 'phaser';

/**
 * Tiny reuse pool for short-lived projectile GameObjects (arrows, impact sparks).
 * Acquiring pops an idle object (or makes one on a cold pool); releasing parks it
 * inactive + invisible so Phaser's update loop skips it. Avoids the per-shot
 * create/destroy churn — objects live for the scene and are torn down with it.
 */
export class GameObjectPool<
	T extends Phaser.GameObjects.GameObject &
		Phaser.GameObjects.Components.Visible,
> {
	private idle: T[] = [];

	constructor(private readonly make: () => T) {}

	acquire(): T {
		const o = this.idle.pop() ?? this.make();
		o.setActive(true).setVisible(true);
		return o;
	}

	release(o: T): void {
		o.setActive(false).setVisible(false);
		this.idle.push(o);
	}
}

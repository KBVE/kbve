import type Phaser from 'phaser';

export interface ParticleBurstDeps {
	scene: Phaser.Scene;
	acquireArc: (
		x: number,
		y: number,
		radius: number,
		color: number,
		alpha?: number,
	) => Phaser.GameObjects.Arc;
	releaseArc: (sprite: Phaser.GameObjects.Arc) => void;
}

export function spawnParticleBurst(
	deps: ParticleBurstDeps,
	x: number,
	y: number,
	color: number,
	count = 6,
	spread = 24,
	duration = 380,
): void {
	for (let i = 0; i < count; i++) {
		const angle = (i / count) * Math.PI * 2;
		const sprite = deps.acquireArc(
			x,
			y,
			2 + Math.random() * 1.5,
			color,
			0.85,
		);
		const tx = x + Math.cos(angle) * spread;
		const ty = y + Math.sin(angle) * spread;
		deps.scene.tweens.add({
			targets: sprite,
			x: tx,
			y: ty,
			alpha: 0,
			scale: 0.4,
			duration,
			ease: 'Cubic.easeOut',
			onComplete: () => deps.releaseArc(sprite),
		});
	}
}

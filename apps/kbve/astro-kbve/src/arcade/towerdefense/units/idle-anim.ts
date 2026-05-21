import type Phaser from 'phaser';
import type { SoldierVisual } from '../components';

export function attachSoldierIdleAnim(
	scene: Phaser.Scene,
	eid: number,
	visual: SoldierVisual,
): void {
	const baseX = visual.sprite.scaleX;
	const baseY = visual.sprite.scaleY;
	visual.idleTween = scene.tweens.add({
		targets: visual.sprite,
		scaleX: baseX * 1.12,
		scaleY: baseY * 1.12,
		duration: 520 + (eid % 4) * 90,
		yoyo: true,
		repeat: -1,
		ease: 'Sine.easeInOut',
	});
}

import type Phaser from 'phaser';
import { TILE } from '../config';
import type { Building } from '../types';

export interface BuildingAmbience {
	sprites: Phaser.GameObjects.GameObject[];
	tweens: Phaser.Tweens.Tween[];
}

export function createBuildingAmbience(
	scene: Phaser.Scene,
	b: Building,
): BuildingAmbience | null {
	const x = b.x;
	const y = b.y;
	switch (b.spec.id) {
		case 'diesel': {
			const sprites: Phaser.GameObjects.GameObject[] = [];
			const tweens: Phaser.Tweens.Tween[] = [];
			for (let i = 0; i < 3; i++) {
				const startX = x - TILE * 0.05 + (i - 1) * TILE * 0.12;
				const startY = y - TILE * 0.4;
				const puff = scene.add
					.circle(startX, startY, TILE * 0.14, 0x1a202c, 0.92)
					.setStrokeStyle(1, 0x4a5568, 0.5)
					.setDepth(b.sprite.depth + 1);
				sprites.push(puff);
				tweens.push(
					scene.tweens.add({
						targets: puff,
						y: y - TILE * 1.3,
						x: startX + (i - 1) * TILE * 0.18,
						scale: 2.2,
						alpha: 0,
						duration: 1800,
						delay: i * 520,
						repeat: -1,
						ease: 'Sine.easeOut',
						onRepeat: () => {
							puff.setPosition(startX, startY);
							puff.setScale(1);
							puff.setAlpha(0.92);
						},
					}),
				);
			}
			return { sprites, tweens };
		}
		case 'nuclear': {
			const halo = scene.add
				.circle(x, y, TILE * 0.55, 0x9ae6b4, 0.18)
				.setStrokeStyle(2, 0x9ae6b4, 0.6)
				.setDepth(b.sprite.depth - 1);
			return {
				sprites: [halo],
				tweens: [
					scene.tweens.add({
						targets: halo,
						scale: 1.18,
						alpha: 0.42,
						duration: 1100,
						yoyo: true,
						repeat: -1,
						ease: 'Sine.easeInOut',
					}),
				],
			};
		}
		case 'solar': {
			const glint = scene.add
				.rectangle(x, y - TILE * 0.1, TILE * 0.55, 3, 0xfff5b1, 0.55)
				.setDepth(b.sprite.depth + 1);
			return {
				sprites: [glint],
				tweens: [
					scene.tweens.add({
						targets: glint,
						alpha: 0.05,
						duration: 1600,
						yoyo: true,
						repeat: -1,
						ease: 'Sine.easeInOut',
					}),
				],
			};
		}
		case 'battery': {
			const spark = scene.add
				.circle(x, y - TILE * 0.05, TILE * 0.06, 0xf6e05e, 0.85)
				.setDepth(b.sprite.depth + 1);
			return {
				sprites: [spark],
				tweens: [
					scene.tweens.add({
						targets: spark,
						alpha: 0.15,
						duration: 320,
						yoyo: true,
						repeat: -1,
						ease: 'Cubic.easeInOut',
					}),
				],
			};
		}
		case 'repair': {
			const ring = scene.add
				.circle(x, y, TILE * 0.45, 0x68d391, 0.0)
				.setStrokeStyle(2, 0x68d391, 0.65)
				.setDepth(b.sprite.depth - 1);
			return {
				sprites: [ring],
				tweens: [
					scene.tweens.add({
						targets: ring,
						scale: 1.5,
						alpha: 0,
						duration: 1600,
						repeat: -1,
						ease: 'Sine.easeOut',
						onRepeat: () => {
							ring.setScale(1);
							ring.setAlpha(0.5);
						},
					}),
				],
			};
		}
		case 'armoury': {
			const banner = scene.add
				.rectangle(
					x + TILE * 0.32,
					y - TILE * 0.05,
					3,
					TILE * 0.35,
					0xf6ad55,
					0.85,
				)
				.setDepth(b.sprite.depth + 1);
			return {
				sprites: [banner],
				tweens: [
					scene.tweens.add({
						targets: banner,
						scaleY: 0.7,
						duration: 900,
						yoyo: true,
						repeat: -1,
						ease: 'Sine.easeInOut',
					}),
				],
			};
		}
		case 'fire': {
			const flame = scene.add
				.circle(x, y - TILE * 0.35, TILE * 0.08, 0xff7a45, 0.85)
				.setDepth(b.sprite.depth + 1);
			return {
				sprites: [flame],
				tweens: [
					scene.tweens.add({
						targets: flame,
						scale: 1.4,
						alpha: 0.45,
						duration: 380,
						yoyo: true,
						repeat: -1,
						ease: 'Sine.easeInOut',
					}),
				],
			};
		}
		case 'ice': {
			const sparkle = scene.add
				.circle(x, y - TILE * 0.3, 2, 0xffffff, 0.9)
				.setDepth(b.sprite.depth + 1);
			return {
				sprites: [sparkle],
				tweens: [
					scene.tweens.add({
						targets: sparkle,
						alpha: 0.1,
						duration: 700,
						yoyo: true,
						repeat: -1,
						ease: 'Sine.easeInOut',
					}),
				],
			};
		}
		default:
			return null;
	}
}

export function disposeBuildingAmbience(amb: BuildingAmbience): void {
	for (const t of amb.tweens) t.remove();
	for (const s of amb.sprites) s.destroy();
}

import type Phaser from 'phaser';
import { COLORS, TILE, type EnemyType } from '../config';
import { enemyTextureKey } from '../art/sprite-mint';
import type { EnemyVisual } from '../components';

export interface EnemyVisualDeps {
	scene: Phaser.Scene;
	acquireImage: (
		x: number,
		y: number,
		key: string,
	) => Phaser.GameObjects.Image;
	acquireGraphics: () => Phaser.GameObjects.Graphics;
	acquireRect: (
		x: number,
		y: number,
		w: number,
		h: number,
		color: number,
		alpha?: number,
	) => Phaser.GameObjects.Rectangle;
}

export function createEnemyVisual(
	deps: EnemyVisualDeps,
	type: EnemyType,
	x: number,
	y: number,
	radius: number,
): EnemyVisual {
	const sprite = deps.acquireImage(x, y, enemyTextureKey(type.id));
	sprite.setScale((radius * 2) / 24);
	const statusRing = deps.acquireGraphics();
	statusRing.setVisible(false);
	const ringRadius = radius + 4;
	const barWidth = Math.min(
		TILE * 1.2,
		Math.max(TILE * 0.4, TILE * type.sizeRadius * 2),
	);
	const hpBarBg = deps.acquireRect(
		x,
		y - TILE * 0.5,
		barWidth,
		4,
		COLORS.enemyHpBarBg,
	);
	const hpBar = deps.acquireRect(
		x - barWidth / 2,
		y - TILE * 0.5,
		barWidth,
		4,
		COLORS.enemyHpBar,
	);
	hpBar.setOrigin(0, 0.5);
	hpBar.setVisible(false);
	hpBarBg.setVisible(false);
	return {
		sprite,
		statusRing,
		hpBar,
		hpBarBg,
		ringRadius,
		barWidth,
		statusVisible: false,
		lastX: x,
		lastY: y,
		walkPhase: 0,
		facing: 1,
	};
}

import type Phaser from 'phaser';
import { COLORS, TILE } from '../config';
import type { SoldierVisual } from '../components';
import { unitTextureKey, type UnitVariantId } from '../art/sprite-mint';

export interface UnitVisualDeps {
	scene: Phaser.Scene;
	acquireRect: (
		x: number,
		y: number,
		w: number,
		h: number,
		color: number,
		alpha?: number,
	) => Phaser.GameObjects.Rectangle;
}

export interface CreateUnitVisualParams {
	x: number;
	y: number;
	variant: UnitVariantId;
	displaySize: number;
}

const HP_BAR_WIDTH = TILE * 0.5;
const HP_BAR_THICKNESS = 3;
const HP_BAR_Y_OFFSET = TILE * 0.32;

export function createUnitVisual(
	deps: UnitVisualDeps,
	{ x, y, variant, displaySize }: CreateUnitVisualParams,
): SoldierVisual {
	const sprite = deps.scene.add
		.image(x, y, unitTextureKey(variant))
		.setOrigin(0.5)
		.setDisplaySize(displaySize, displaySize);
	const hpBarBg = deps.acquireRect(
		x,
		y - HP_BAR_Y_OFFSET,
		HP_BAR_WIDTH,
		HP_BAR_THICKNESS,
		COLORS.enemyHpBarBg,
	);
	const hpBar = deps.acquireRect(
		x - HP_BAR_WIDTH / 2,
		y - HP_BAR_Y_OFFSET,
		HP_BAR_WIDTH,
		HP_BAR_THICKNESS,
		COLORS.enemyHpBar,
	);
	hpBar.setOrigin(0, 0.5);
	return {
		sprite,
		hpBar,
		hpBarBg,
		lastX: x,
		lastY: y,
		walkPhase: 0,
		facing: 1,
	};
}

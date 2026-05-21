import type Phaser from 'phaser';
import type { BuildId } from '../config';
import { COLORS, TILE } from '../config';
import { buildingTextureKey } from '../art/sprite-mint';

export interface BuildingBaseVisual {
	sprite: Phaser.GameObjects.Image;
	hpBar: Phaser.GameObjects.Rectangle;
	hpBarBg: Phaser.GameObjects.Rectangle;
	armorBar: Phaser.GameObjects.Rectangle;
	armorBarBg: Phaser.GameObjects.Rectangle;
}

const BAR_WIDTH = TILE * 0.7;
const HP_BAR_Y = TILE * 0.55;
const ARMOR_BAR_OFFSET = 5;

export function createBuildingBaseVisual(
	scene: Phaser.Scene,
	id: BuildId,
	x: number,
	y: number,
): BuildingBaseVisual {
	const sprite = scene.add.image(x, y, buildingTextureKey(id)).setOrigin(0.5);
	const hpBarBg = scene.add
		.rectangle(x, y - HP_BAR_Y, BAR_WIDTH, 4, COLORS.buildingHpBarBg)
		.setOrigin(0.5)
		.setVisible(false);
	const hpBar = scene.add
		.rectangle(
			x - BAR_WIDTH / 2,
			y - HP_BAR_Y,
			BAR_WIDTH,
			4,
			COLORS.buildingHpBar,
		)
		.setOrigin(0, 0.5)
		.setVisible(false);
	const armorBarBg = scene.add
		.rectangle(
			x,
			y - HP_BAR_Y - ARMOR_BAR_OFFSET,
			BAR_WIDTH,
			3,
			COLORS.buildingHpBarBg,
		)
		.setOrigin(0.5)
		.setVisible(false);
	const armorBar = scene.add
		.rectangle(
			x - BAR_WIDTH / 2,
			y - HP_BAR_Y - ARMOR_BAR_OFFSET,
			BAR_WIDTH,
			3,
			0x63b3ed,
		)
		.setOrigin(0, 0.5)
		.setVisible(false);
	return { sprite, hpBar, hpBarBg, armorBar, armorBarBg };
}

export function createPowerIndicator(
	scene: Phaser.Scene,
	x: number,
	y: number,
): Phaser.GameObjects.Arc {
	return scene.add.circle(x + TILE * 0.3, y - TILE * 0.3, 4, 0x9ae6b4);
}

export function createChargeBar(
	scene: Phaser.Scene,
	x: number,
	y: number,
): {
	chargeBar: Phaser.GameObjects.Rectangle;
	chargeBarBg: Phaser.GameObjects.Rectangle;
} {
	const chargeBarBg = scene.add
		.rectangle(x, y + TILE * 0.5, BAR_WIDTH, 3, COLORS.buildingHpBarBg)
		.setOrigin(0.5);
	const chargeBar = scene.add
		.rectangle(x - BAR_WIDTH / 2, y + TILE * 0.5, BAR_WIDTH, 3, 0xf6e05e)
		.setOrigin(0, 0.5);
	return { chargeBar, chargeBarBg };
}

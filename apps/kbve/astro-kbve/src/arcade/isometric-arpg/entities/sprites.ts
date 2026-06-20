import Phaser from 'phaser';
import { COLORS, DEPTH_UI } from '../config';
import {
	KIND_CAT_ITEM,
	KIND_CAT_PLAYER,
	type KindResolvers,
} from '../systems/kindResolvers';

export interface EntityRefs {
	sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
	nameplate?: Phaser.GameObjects.Text;
	hpBar?: Phaser.GameObjects.Graphics;
}

function bodyColor(cat: number, hostile: boolean): number {
	if (cat === KIND_CAT_PLAYER) return COLORS.player;
	if (cat === KIND_CAT_ITEM) return COLORS.npc;
	return hostile ? COLORS.enemy : COLORS.npc;
}

export function makeSprite(
	scene: Phaser.Scene,
	kinds: KindResolvers,
	kind: number,
	hostile: boolean,
): Phaser.GameObjects.Rectangle {
	const cat = kinds.cat(kind);
	const isItem = cat === KIND_CAT_ITEM;
	const w = isItem ? 16 : 22;
	const h = isItem ? 16 : 34;
	const rect = scene.add.rectangle(0, 0, w, h, bodyColor(cat, hostile));
	rect.setStrokeStyle(2, 0x000000, 0.5);
	rect.setOrigin(0.5, 1);
	return rect;
}

export function makeNameplate(
	scene: Phaser.Scene,
	label: string,
): Phaser.GameObjects.Text {
	return scene.add
		.text(0, 0, label, {
			fontFamily: 'monospace',
			fontSize: '11px',
			color: '#fcd34d',
			stroke: '#000000',
			strokeThickness: 3,
		})
		.setOrigin(0.5, 1)
		.setDepth(DEPTH_UI + 1);
}

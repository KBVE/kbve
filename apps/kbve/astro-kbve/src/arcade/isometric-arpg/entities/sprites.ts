import Phaser from 'phaser';
import { COLORS, DEPTH_UI } from '../config';
import {
	KIND_CAT_ITEM,
	KIND_CAT_PLAYER,
	type KindResolvers,
} from '../systems/kindResolvers';
import {
	CLASS_ANGLES,
	classTextureKey,
	nearestClassAngle,
	resolvePlayerClass,
	type ClassDef,
	type ClassState,
} from './classes';

/** Per-player directional pose state, tracked on the entity refs. */
export interface ClassView {
	def: ClassDef;
	angle: string;
	state: ClassState;
}

export interface EntityRefs {
	sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
	nameplate?: Phaser.GameObjects.Text;
	hpBar?: Phaser.GameObjects.Graphics;
	cls?: ClassView;
}

function bodyColor(cat: number, hostile: boolean): number {
	if (cat === KIND_CAT_ITEM) return COLORS.npc;
	return hostile ? COLORS.enemy : COLORS.npc;
}

export function isPlayerKind(kinds: KindResolvers, kind: number): boolean {
	return kinds.cat(kind) === KIND_CAT_PLAYER;
}

/** Spawn a player's class character sprite (idle, facing south). */
export function makeClassSprite(
	scene: Phaser.Scene,
	classRef: string | null,
): { sprite: Phaser.GameObjects.Sprite; cls: ClassView } {
	const def = resolvePlayerClass(classRef);
	const angle = CLASS_ANGLES[4];
	const sprite = scene.add.sprite(0, 0, classTextureKey(def, 'Idle', angle));
	sprite.setOrigin(0.5, def.originY);
	sprite.setDisplaySize(def.displaySize, def.displaySize);
	return { sprite, cls: { def, angle, state: 'Idle' } };
}

/** Swap a class sprite's pose, optionally re-facing from a movement delta. */
export function setClassPose(
	sprite: Phaser.GameObjects.Sprite,
	view: ClassView,
	state: ClassState,
	facing?: { dx: number; dy: number },
): void {
	if (facing && (facing.dx !== 0 || facing.dy !== 0)) {
		view.angle = nearestClassAngle(facing.dx, facing.dy);
	}
	view.state = state;
	sprite.setTexture(classTextureKey(view.def, state, view.angle));
	sprite.setDisplaySize(view.def.displaySize, view.def.displaySize);
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

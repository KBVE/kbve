import Phaser from 'phaser';
import { arpgAsset } from '../config';

/**
 * A static environment prop (campfire, …). Unlike player classes these have no
 * 16-angle rig — a single spritesheet looped as an idle animation, anchored on
 * its tile. Keyed by the kind registry `ref` the server sends in the Welcome
 * registry (category KIND_CAT_ENV).
 */
export interface EnvDef {
	ref: string;
	sheet: string;
	frameWidth: number;
	frameHeight: number;
	frames: number;
	frameRate: number;
	displayWidth: number;
	displayHeight: number;
	originY: number;
}

export const CAMPFIRE_ENV: EnvDef = {
	ref: 'campfire',
	sheet: '/assets/arcade/arpg/environment/hazards/campfire/campfire-Sheet.png',
	frameWidth: 36,
	frameHeight: 48,
	frames: 6,
	frameRate: 8,
	displayWidth: 40,
	displayHeight: 54,
	originY: 0.9,
};

export const ENV_REGISTRY: Map<string, EnvDef> = new Map([
	[CAMPFIRE_ENV.ref, CAMPFIRE_ENV],
]);

const sheetKey = (def: EnvDef): string => `env:${def.ref}`;
const animKey = (def: EnvDef): string => `anim:env:${def.ref}`;

export function preloadEnv(scene: Phaser.Scene, def: EnvDef): void {
	scene.load.spritesheet(sheetKey(def), arpgAsset(def.sheet), {
		frameWidth: def.frameWidth,
		frameHeight: def.frameHeight,
	});
}

export function registerEnvAnims(scene: Phaser.Scene, def: EnvDef): void {
	const key = animKey(def);
	if (scene.anims.exists(key)) return;
	scene.anims.create({
		key,
		frames: scene.anims.generateFrameNumbers(sheetKey(def), {
			start: 0,
			end: def.frames - 1,
		}),
		frameRate: def.frameRate,
		repeat: -1,
	});
}

/**
 * Build a looping prop sprite for an env `ref`. Returns null when the ref has no
 * registered def so the caller can fall back to the placeholder rectangle.
 */
export function makeEnvSprite(
	scene: Phaser.Scene,
	ref: string | null,
): Phaser.GameObjects.Sprite | null {
	const def = ref ? ENV_REGISTRY.get(ref) : undefined;
	if (!def) return null;
	const sprite = scene.add.sprite(0, 0, sheetKey(def), 0);
	sprite.setOrigin(0.5, def.originY);
	sprite.setDisplaySize(def.displayWidth, def.displayHeight);
	sprite.play(animKey(def));
	return sprite;
}

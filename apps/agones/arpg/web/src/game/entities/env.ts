import Phaser from 'phaser';
import { arpgAsset } from '../config';

/**
 * A static environment prop (campfire, …). Unlike player classes these have no
 * 16-angle rig — a single spritesheet looped as an idle animation, anchored on
 * its tile. Keyed by the kind registry `ref` the server sends in the Welcome
 * registry (category KIND_CAT_ENV).
 */
/** Optional warm point-light a prop casts (campfire glow). Pure cosmetic. */
export interface EnvLight {
	color: number;
	/** Glow radius in px (~32 = one tile). */
	radius: number;
	/** Base alpha of the glow at full flicker. */
	intensity: number;
}

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
	light?: EnvLight;
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
	light: { color: 0xff9a3c, radius: 96, intensity: 0.5 },
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

const GLOW_TEX = 'env-glow';

/** Lazily build the soft radial glow texture shared by all env lights. */
function ensureGlowTexture(scene: Phaser.Scene): void {
	if (scene.textures.exists(GLOW_TEX)) return;
	const r = 64;
	const g = scene.make.graphics({ x: 0, y: 0 }, false);
	for (let i = r; i > 0; i--) {
		g.fillStyle(0xffffff, (1 - i / r) * 0.06);
		g.fillCircle(r, r, i);
	}
	g.generateTexture(GLOW_TEX, r * 2, r * 2);
	g.destroy();
}

/**
 * Attach a flickering warm glow under a placed prop that declares a `light`
 * (campfire). Additive, sits just below the prop so the fire draws over its own
 * core. Lifetime is bound to the prop's Sprite — when the prop is destroyed the
 * glow + its flicker tween go with it, so no extra teardown bookkeeping. Call
 * AFTER the prop has been positioned so the glow lands on its tile.
 */
export function attachEnvLight(
	scene: Phaser.Scene,
	sprite: Phaser.GameObjects.GameObject &
		Phaser.GameObjects.Components.Transform &
		Phaser.GameObjects.Components.Depth,
	ref: string | null,
): void {
	const def = ref ? ENV_REGISTRY.get(ref) : undefined;
	if (!def?.light) return;
	ensureGlowTexture(scene);
	const { color, radius, intensity } = def.light;
	const glow = scene.add.image(sprite.x, sprite.y, GLOW_TEX);
	glow.setBlendMode(Phaser.BlendModes.ADD);
	glow.setTint(color);
	glow.setAlpha(intensity);
	glow.setDisplaySize(radius * 2, radius * 2);
	glow.setDepth(sprite.depth - 1);
	// Fire flicker: a quick irregular alpha + scale wobble around the base.
	const tween = scene.tweens.add({
		targets: glow,
		alpha: { from: intensity, to: intensity * 0.6 },
		scaleX: { from: glow.scaleX, to: glow.scaleX * 0.92 },
		scaleY: { from: glow.scaleY, to: glow.scaleY * 0.92 },
		duration: 110,
		yoyo: true,
		repeat: -1,
		repeatDelay: 40,
		ease: 'Sine.easeInOut',
	});
	sprite.once('destroy', () => {
		tween.remove();
		glow.destroy();
	});
}

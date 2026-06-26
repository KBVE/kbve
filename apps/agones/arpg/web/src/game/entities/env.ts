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
	/** Animation frames PER direction (one row of the sheet). */
	frames: number;
	frameRate: number;
	displayWidth: number;
	displayHeight: number;
	originY: number;
	/**
	 * Number of facing rows packed in the sheet (row-major: row = facing, col =
	 * anim frame). Defaults to 1 (campfire — no rotation). A rotatable prop
	 * (candelabrum, 4) is placed with `R` and renders the row its `sub` byte names.
	 */
	directions?: number;
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

// Candelabrum Stand — a ROTATABLE mana-font prop. Sheet is 4 facing rows x 3
// flame-flicker frames of 64x96; `sub` (0..3) picks the row. Warm candle glow.
export const CANDELABRUM_ENV: EnvDef = {
	ref: 'candelabrum',
	sheet: '/assets/arcade/arpg/environment/lightsources/candelabrum-stand/Anim_Infernus_Lightsources_1.png',
	frameWidth: 64,
	frameHeight: 96,
	frames: 3,
	frameRate: 6,
	displayWidth: 56,
	displayHeight: 84,
	originY: 0.86,
	directions: 4,
	light: { color: 0xffc46b, radius: 80, intensity: 0.42 },
};

export const ENV_REGISTRY: Map<string, EnvDef> = new Map([
	[CAMPFIRE_ENV.ref, CAMPFIRE_ENV],
	[CANDELABRUM_ENV.ref, CANDELABRUM_ENV],
]);

/** Facing count for a def (rotatable props pack >1 row). */
export const envDirections = (def: EnvDef): number =>
	Math.max(1, def.directions ?? 1);

const sheetKey = (def: EnvDef): string => `env:${def.ref}`;
const animKey = (def: EnvDef, dir: number): string =>
	`anim:env:${def.ref}:${dir}`;

export function preloadEnv(scene: Phaser.Scene, def: EnvDef): void {
	scene.load.spritesheet(sheetKey(def), arpgAsset(def.sheet), {
		frameWidth: def.frameWidth,
		frameHeight: def.frameHeight,
	});
}

export function registerEnvAnims(scene: Phaser.Scene, def: EnvDef): void {
	// One looping anim per facing row; row-major frame index = dir * frames + f.
	for (let dir = 0; dir < envDirections(def); dir++) {
		const key = animKey(def, dir);
		if (scene.anims.exists(key)) continue;
		const start = dir * def.frames;
		scene.anims.create({
			key,
			frames: scene.anims.generateFrameNumbers(sheetKey(def), {
				start,
				end: start + def.frames - 1,
			}),
			frameRate: def.frameRate,
			repeat: -1,
		});
	}
}

/**
 * Build a looping prop sprite for an env `ref`, facing `dir` (its `sub` byte;
 * clamped to the def's row count). Returns null when the ref has no registered
 * def so the caller can fall back to the placeholder rectangle.
 */
export function makeEnvSprite(
	scene: Phaser.Scene,
	ref: string | null,
	dir = 0,
): Phaser.GameObjects.Sprite | null {
	const def = ref ? ENV_REGISTRY.get(ref) : undefined;
	if (!def) return null;
	const d = Math.min(Math.max(dir, 0), envDirections(def) - 1);
	const sprite = scene.add.sprite(0, 0, sheetKey(def), d * def.frames);
	sprite.setOrigin(0.5, def.originY);
	sprite.setDisplaySize(def.displayWidth, def.displayHeight);
	sprite.play(animKey(def, d));
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
	const baseScale = glow.scaleX;
	const shimmer = scene.tweens.add({
		targets: glow,
		alpha: { from: intensity, to: intensity * 0.88 },
		duration: 720,
		yoyo: true,
		repeat: -1,
		ease: 'Sine.easeInOut',
	});
	const breathe = scene.tweens.add({
		targets: glow,
		scaleX: { from: baseScale, to: baseScale * 1.04 },
		scaleY: { from: baseScale, to: baseScale * 1.04 },
		duration: 1100,
		yoyo: true,
		repeat: -1,
		ease: 'Sine.easeInOut',
	});
	sprite.once('destroy', () => {
		shimmer.remove();
		breathe.remove();
		glow.destroy();
	});
}

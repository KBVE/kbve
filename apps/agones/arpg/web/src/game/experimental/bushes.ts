import Phaser from 'phaser';
import { stream, Domain } from '@kbve/laser';
import { arpgAsset } from '../config';

// Bushes ship as one packed sheet baked from the leafy tree canopies
// (scripts/gen-bush-sheet.py): 1920x1344 of 192x192 cells = 10 COLS x 7 ROWS.
// Each cell is a low wide shrub with its trunk cropped, anchored on its tile.
// Harvesting leaves the same cell drawn dim + shrunk (no bare twin sheet yet).
const SHEET = '/assets/arcade/arpg/environment/bushes/bush_01.webp';
const BUSH_TEX = 'env:bushes_01';

/** Env kind ref the server tags bush entities with. */
export const BUSH_REF = 'bush';

// Per-mille of surface tiles that carry a bush. MUST match simgrid
// BUSH_DENSITY_PER_MILLE (sim.rs) — the field is a shared deterministic roll.
const BUSH_DENSITY_PER_MILLE = 30;

/**
 * Deterministic surface bush field — byte-for-byte mirror of simgrid `bush_at`
 * (sim.rs), built on the shared `stream` RNG + `Domain.BUSH`. Returns the visual
 * variant for a tile that carries a bush, else null. A bush never shares a tile
 * with a tree, so callers must pass null here when `treeAt` already claimed it.
 */
export function bushAt(seed: number, x: number, y: number): number | null {
	const next = stream(seed, Domain.BUSH, [x, y]);
	if (next() % 1000 >= BUSH_DENSITY_PER_MILLE) return null;
	return next() % BUSH_VARIANTS;
}

/**
 * Per-bush state rides the `EntityDelta.sub` byte: low 7 bits = variant (0..69),
 * bit 7 = harvested. Decodes the wire byte the server packs.
 */
export function decodeBushSub(sub: number): {
	variant: number;
	harvested: boolean;
} {
	return { variant: sub & 0x7f, harvested: (sub & 0x80) !== 0 };
}

export const BUSH_FRAME_W = 192;
export const BUSH_FRAME_H = 192;
export const BUSH_COLS = 10;
export const BUSH_ROWS = 7;
/** Distinct bush variants (7 rows x 10 cols). */
export const BUSH_VARIANTS = BUSH_COLS * BUSH_ROWS;

// On-screen footprint (tile is 64px wide). A bush reads as a low shrub a bit
// wider than its tile, anchored near its base so it plants on the ground.
export const BUSH_DISPLAY_W = 84;
export const BUSH_DISPLAY_H = 56;
export const BUSH_ORIGIN_Y = 0.84;

/** Sheet frame index for a variant (wrapped into range). */
export function bushFrame(variant: number): number {
	return ((variant % BUSH_VARIANTS) + BUSH_VARIANTS) % BUSH_VARIANTS;
}

export function preloadBushes(scene: Phaser.Scene): void {
	if (scene.textures.exists(BUSH_TEX)) return;
	scene.load.spritesheet(BUSH_TEX, arpgAsset(SHEET), {
		frameWidth: BUSH_FRAME_W,
		frameHeight: BUSH_FRAME_H,
	});
}

/** Build a static bush sprite for a variant, standing or harvested (dim stub). */
export function makeBushSprite(
	scene: Phaser.Scene,
	variant: number,
	harvested = false,
): Phaser.GameObjects.Sprite {
	const sprite = scene.add.sprite(0, 0, BUSH_TEX, bushFrame(variant));
	return reskinBushSprite(sprite, variant, harvested);
}

/** Reset a (possibly pooled) bush sprite. A harvested bush is left as a faded,
 * shrunken remnant in place rather than a separate bare frame. */
export function reskinBushSprite(
	sprite: Phaser.GameObjects.Sprite,
	variant: number,
	harvested: boolean,
): Phaser.GameObjects.Sprite {
	sprite.setTexture(BUSH_TEX, bushFrame(variant));
	sprite.setOrigin(0.5, BUSH_ORIGIN_Y);
	sprite.setAngle(0);
	if (harvested) {
		sprite.setDisplaySize(BUSH_DISPLAY_W * 0.6, BUSH_DISPLAY_H * 0.55);
		sprite.setTint(0x6f7a5a);
		sprite.setAlpha(0.85);
	} else {
		sprite.setDisplaySize(BUSH_DISPLAY_W, BUSH_DISPLAY_H);
		sprite.clearTint();
		sprite.setAlpha(1);
	}
	sprite.setActive(true).setVisible(true);
	return sprite;
}

const LEAF_TEX = 'bush-leaf';

function ensureLeafTexture(scene: Phaser.Scene): string {
	if (scene.textures.exists(LEAF_TEX)) return LEAF_TEX;
	const g = scene.make.graphics({ x: 0, y: 0 }, false);
	g.fillStyle(0xffffff, 1);
	g.fillEllipse(6, 4, 12, 8);
	g.generateTexture(LEAF_TEX, 12, 8);
	g.destroy();
	return LEAF_TEX;
}

/**
 * Harvest a standing bush: puff a few leaves and shrink+fade the sprite down to
 * its picked remnant in place. `onSettled` fires once the remnant is set so the
 * caller can sync. Mirrors the tree fell fx at shrub scale.
 */
export function harvestBushSprite(
	scene: Phaser.Scene,
	sprite: Phaser.GameObjects.Sprite,
	variant: number,
	onSettled?: () => void,
): void {
	const leaf = ensureLeafTexture(scene);
	const burst = scene.add.particles(
		sprite.x,
		sprite.y - BUSH_DISPLAY_H * (BUSH_ORIGIN_Y - 0.4),
		leaf,
		{
			speed: { min: 20, max: 80 },
			angle: { min: 200, max: 340 },
			gravityY: 220,
			lifespan: { min: 360, max: 700 },
			scale: { start: 1, end: 0.2 },
			alpha: { start: 1, end: 0 },
			rotate: { min: 0, max: 360 },
			tint: [0x3f6e2e, 0x5b8c3a, 0x6fae46, 0x86b24a],
			emitting: false,
		},
	);
	burst.setDepth(sprite.depth + 1);
	burst.explode(10);
	scene.time.delayedCall(800, () => burst.destroy());

	scene.tweens.add({
		targets: sprite,
		displayWidth: BUSH_DISPLAY_W * 0.6,
		displayHeight: BUSH_DISPLAY_H * 0.55,
		alpha: 0.85,
		duration: 320,
		ease: 'Quad.easeOut',
		onComplete: () => {
			reskinBushSprite(sprite, variant, true);
			onSettled?.();
		},
	});
}

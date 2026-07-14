import Phaser from 'phaser';
import { stream, Domain } from '@kbve/laser';
import { arpgAsset } from '../config';

// Trees ship as one packed sheet: 3840x10752 of 384x768 cells = 10 COLS x 14
// ROWS. The top 7 rows are leafy (live) trees; the bottom 7 are the BARE twin of
// the leafy cell directly above (same column, row + 7). A felled tree swaps its
// leafy frame for that bare twin. Cells are a uniform 1:2 box — canopy art varies
// in height inside the cell, so base-anchoring is what makes "some trees taller"
// read correctly without per-variant tuning.
const SHEET = '/assets/arcade/arpg/environment/trees/trees_01.webp';
const TREE_TEX = 'env:trees_01';

/** Env kind ref the server tags tree entities with. */
export const TREE_REF = 'tree';

// Per-mille of surface tiles that carry a tree. MUST match simgrid
// TREE_DENSITY_PER_MILLE (sim.rs) — the forest is a shared deterministic field.
const TREE_DENSITY_PER_MILLE = 22;

/**
 * Deterministic surface tree field — byte-for-byte mirror of simgrid `tree_at`
 * (sim.rs), built on the shared `stream` RNG + `Domain.TREE`. Returns the visual
 * variant for a tile that carries a tree, else null. Placement only; callers apply
 * the same tile exclusions (spawn, stairs) the server does.
 */
export function treeAt(seed: number, x: number, y: number): number | null {
	const next = stream(seed, Domain.TREE, [x, y]);
	if (next() % 1000 >= TREE_DENSITY_PER_MILLE) return null;
	return next() % TREE_VARIANTS;
}

/**
 * Per-tree state rides the `EntityDelta.sub` byte: low 7 bits = variant (0..69),
 * bit 7 = felled. Decodes the wire byte the server packs.
 */
export function decodeTreeSub(sub: number): {
	variant: number;
	felled: boolean;
} {
	return { variant: sub & 0x7f, felled: (sub & 0x80) !== 0 };
}

// Sheet shipped at 1920x5376 (384x768 cells downscaled 2x -> 192x384) to stay
// under the 8192 WebGL max-texture size; the 10x14 grid is unchanged.
export const TREE_FRAME_W = 192;
export const TREE_FRAME_H = 384;
export const TREE_COLS = 10;
export const TREE_LEAFY_ROWS = 7;
/** Distinct leafy tree variants (rows 0..6 x 10 cols). */
export const TREE_VARIANTS = TREE_COLS * TREE_LEAFY_ROWS;

// On-screen footprint (tile is 64px wide). Keep the cell's 1:2 ratio and anchor
// near the trunk base so the tree plants on its tile and the canopy rises off it.
export const TREE_DISPLAY_W = 192;
export const TREE_DISPLAY_H = 384;
export const TREE_ORIGIN_Y = 0.92;

/** Sheet frame index for a leafy variant (wrapped into range). */
export function leafyFrame(variant: number): number {
	return ((variant % TREE_VARIANTS) + TREE_VARIANTS) % TREE_VARIANTS;
}

const LEAF_TEX = 'tree-leaf';

/** Lazily build the small leaf particle the fell burst scatters. */
function ensureLeafTexture(scene: Phaser.Scene): string {
	if (scene.textures.exists(LEAF_TEX)) return LEAF_TEX;
	const g = scene.make.graphics({ x: 0, y: 0 }, false);
	g.fillStyle(0xffffff, 1);
	g.fillEllipse(7, 5, 14, 10);
	g.generateTexture(LEAF_TEX, 14, 10);
	g.destroy();
	return LEAF_TEX;
}

export function preloadTrees(scene: Phaser.Scene): void {
	if (scene.textures.exists(TREE_TEX)) return;
	scene.load.spritesheet(TREE_TEX, arpgAsset(SHEET), {
		frameWidth: TREE_FRAME_W,
		frameHeight: TREE_FRAME_H,
	});
}

/** Build a static tree sprite for a variant, standing (leafy) or felled (bare). */
export function makeTreeSprite(
	scene: Phaser.Scene,
	variant: number,
	felled = false,
): Phaser.GameObjects.Sprite {
	const sprite = scene.add.sprite(0, 0, TREE_TEX, leafyFrame(variant));
	return reskinTreeSprite(sprite, variant, felled);
}

/** Reset a (possibly pooled) tree sprite to a clean standing tree. A felled tree
 * leaves nothing behind, so it's reset hidden. */
export function reskinTreeSprite(
	sprite: Phaser.GameObjects.Sprite,
	variant: number,
	felled: boolean,
): Phaser.GameObjects.Sprite {
	sprite.setTexture(TREE_TEX, leafyFrame(variant));
	sprite.setOrigin(0.5, TREE_ORIGIN_Y);
	sprite.setDisplaySize(TREE_DISPLAY_W, TREE_DISPLAY_H);
	sprite.setAngle(0);
	sprite.setAlpha(1);
	sprite.setActive(!felled).setVisible(!felled);
	return sprite;
}

/**
 * Fell a standing tree: burst its canopy into scattering leaves while the trunk
 * topples + fades, then vanish (no lingering stump). `toRight` picks the fall
 * direction; `onSettled` fires once the sprite is hidden so the caller can sync.
 * The sprite is left hidden + reset so a pool can reuse it.
 */
export function fellTreeSprite(
	scene: Phaser.Scene,
	sprite: Phaser.GameObjects.Sprite,
	toRight: boolean,
	onSettled?: () => void,
): void {
	const leaf = ensureLeafTexture(scene);
	const burst = scene.add.particles(
		sprite.x,
		sprite.y - TREE_DISPLAY_H * (TREE_ORIGIN_Y - 0.35),
		leaf,
		{
			speed: { min: 30, max: 130 },
			angle: { min: 195, max: 345 },
			gravityY: 260,
			lifespan: { min: 480, max: 950 },
			scale: { start: 1, end: 0.2 },
			alpha: { start: 1, end: 0 },
			rotate: { min: 0, max: 360 },
			tint: [0x3f6e2e, 0x5b8c3a, 0x6fae46, 0x86b24a],
			emitting: false,
		},
	);
	burst.setDepth(sprite.depth + 1);
	burst.explode(20);
	scene.time.delayedCall(1100, () => burst.destroy());

	const sx = sprite.scaleX;
	const sy = sprite.scaleY;
	scene.tweens.add({
		targets: sprite,
		angle: toRight ? 80 : -80,
		alpha: 0,
		scaleX: sx * 0.82,
		scaleY: sy * 0.82,
		duration: 560,
		ease: 'Quad.easeIn',
		onComplete: () => {
			sprite
				.setActive(false)
				.setVisible(false)
				.setAngle(0)
				.setAlpha(1)
				.setScale(sx, sy);
			onSettled?.();
		},
	});
}

import Phaser from 'phaser';
import { arpgAsset } from '../config';

// Trees ship as one packed sheet: 3840x10752 of 384x768 cells = 10 COLS x 14
// ROWS. The top 7 rows are leafy (live) trees; the bottom 7 are the BARE twin of
// the leafy cell directly above (same column, row + 7). A felled tree swaps its
// leafy frame for that bare twin. Cells are a uniform 1:2 box — canopy art varies
// in height inside the cell, so base-anchoring is what makes "some trees taller"
// read correctly without per-variant tuning.
const SHEET = '/assets/arcade/arpg/environment/trees/trees_01.png';
const TREE_TEX = 'env:trees_01';

/** Env kind ref the server tags tree entities with. */
export const TREE_REF = 'tree';

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
/** Frame delta from a leafy cell to its bare twin (7 rows down). */
const BARE_FRAME_OFFSET = TREE_COLS * TREE_LEAFY_ROWS;

// On-screen footprint (tile is 64px wide). Keep the cell's 1:2 ratio and anchor
// near the trunk base so the tree plants on its tile and the canopy rises off it.
export const TREE_DISPLAY_W = 144;
export const TREE_DISPLAY_H = 288;
export const TREE_ORIGIN_Y = 0.92;

/** Sheet frame index for a leafy variant (wrapped into range). */
export function leafyFrame(variant: number): number {
	return ((variant % TREE_VARIANTS) + TREE_VARIANTS) % TREE_VARIANTS;
}

/** Sheet frame index for a variant's bare twin (the felled remnant). */
export function bareFrame(variant: number): number {
	return leafyFrame(variant) + BARE_FRAME_OFFSET;
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

/** Reset a (possibly pooled) tree sprite to a clean standing/felled variant. */
export function reskinTreeSprite(
	sprite: Phaser.GameObjects.Sprite,
	variant: number,
	felled: boolean,
): Phaser.GameObjects.Sprite {
	sprite.setTexture(
		TREE_TEX,
		felled ? bareFrame(variant) : leafyFrame(variant),
	);
	sprite.setOrigin(0.5, TREE_ORIGIN_Y);
	sprite.setDisplaySize(TREE_DISPLAY_W, TREE_DISPLAY_H);
	sprite.setAngle(0);
	sprite.setActive(true).setVisible(true);
	return sprite;
}

/**
 * Play the fell animation on a standing tree sprite: the leafy canopy fades while
 * the trunk topples over, then it settles to the bare twin frame (upright, full
 * alpha) as the lingering remnant. `toRight` picks the fall direction. Resolves
 * via `onSettled` once the bare remnant is in place so the caller can drop the
 * tile's collision in sync.
 */
export function fellTreeSprite(
	scene: Phaser.Scene,
	sprite: Phaser.GameObjects.Sprite,
	variant: number,
	toRight: boolean,
	onSettled?: () => void,
): void {
	scene.tweens.add({
		targets: sprite,
		angle: toRight ? 82 : -82,
		alpha: 0,
		duration: 640,
		ease: 'Quad.easeIn',
		onComplete: () => {
			sprite.setAngle(0);
			sprite.setTexture(TREE_TEX, bareFrame(variant));
			sprite.setAlpha(0);
			scene.tweens.add({
				targets: sprite,
				alpha: 1,
				duration: 260,
				ease: 'Quad.easeOut',
				onComplete: () => onSettled?.(),
			});
		},
	});
}

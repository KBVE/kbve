import Phaser from 'phaser';
import { arpgAsset } from '../config';
import { ATLAS_URL, TILE_SIZE, atlasFrame } from './itemAtlas.generated';

// The itemdb atlas as a Phaser spritesheet — frame index == item key (identity
// slot map, same as the HUD's CSS-cropped ItemIcon). Ground loot crops its tile
// straight from here, so a "?" placeholder shows now and real art appears the
// moment an item gets `img:` in its MDX and the atlas is regenerated.
const ITEM_ATLAS_KEY = 'item-atlas';
// On-tile display size (px). Matches the old ground-loot rectangle footprint.
const ITEM_DISPLAY = 24;

export function preloadItemAtlas(scene: Phaser.Scene): void {
	scene.load.spritesheet(ITEM_ATLAS_KEY, arpgAsset(ATLAS_URL), {
		frameWidth: TILE_SIZE,
		frameHeight: TILE_SIZE,
	});
}

/** Ground-item sprite cropped from the itemdb atlas by key (frame == key). */
export function makeItemSprite(
	scene: Phaser.Scene,
	key: number,
): Phaser.GameObjects.Sprite {
	const sprite = scene.add.sprite(0, 0, ITEM_ATLAS_KEY, atlasFrame(key));
	sprite.setOrigin(0.5, 1);
	sprite.setDisplaySize(ITEM_DISPLAY, ITEM_DISPLAY);
	return sprite;
}

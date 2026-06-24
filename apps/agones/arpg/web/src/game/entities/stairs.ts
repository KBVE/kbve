import Phaser from 'phaser';
import { arpgAsset } from '../config';

/**
 * Stair material set from the PVGames Infernus pack. Each material ships the same
 * 12-sprite layout, so the id meaning is shared across materials. Add a new set
 * by dropping its `stairs_<material>_1..12.png` in and appending the name here.
 */
export type StairMaterial = 'grey_stone' | 'dark_obsidian';
export const STAIR_MATERIALS: StairMaterial[] = ['grey_stone', 'dark_obsidian'];

/** Sprite number in the set: 1-8 raised, 9-12 inverted (sunken pits). */
export type StairId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

const STAIR_IDS: StairId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

interface StairDef {
	displayWidth: number;
	displayHeight: number;
	originY: number;
}

const STAIR_BASE = '/assets/arcade/arpg/environment/structures/stairs';

// id geometry is shared across materials. 1-8 = raised steps, 9-12 = inverted
// pits; #6 is the 128px diamond cap, the rest 64x96. originY anchors the base.
const overrides: Partial<Record<StairId, Partial<StairDef>>> = {
	6: { displayWidth: 128, displayHeight: 128, originY: 0.7 },
	9: { originY: 0.66 },
	10: { originY: 0.66 },
	11: { originY: 0.66 },
	12: { originY: 0.66 },
};

const defOf = (id: StairId): StairDef => ({
	displayWidth: 64,
	displayHeight: 96,
	originY: 0.82,
	...overrides[id],
});

const texKey = (material: StairMaterial, id: StairId): string =>
	`stair:${material}:${id}`;

export function preloadStairs(scene: Phaser.Scene): void {
	for (const material of STAIR_MATERIALS) {
		for (const id of STAIR_IDS) {
			scene.load.image(
				texKey(material, id),
				arpgAsset(`${STAIR_BASE}/stairs_${material}_${id}.png`),
			);
		}
	}
}

/** Place stair sprite #id (1-12) of a material, anchored on its tile. */
export function makeStairSprite(
	scene: Phaser.Scene,
	material: StairMaterial,
	id: StairId,
): Phaser.GameObjects.Image {
	const d = defOf(id);
	const sprite = scene.add.image(0, 0, texKey(material, id));
	sprite.setOrigin(0.5, d.originY);
	sprite.setDisplaySize(d.displayWidth, d.displayHeight);
	return sprite;
}

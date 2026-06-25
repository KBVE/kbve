import Phaser from 'phaser';
import { arpgAsset } from '../../config';
import {
	type CreatureDef,
	type CreatureDir,
	type CreatureState,
	CREATURE_DIRS,
} from './model';
import { creatureAnimKey, frameRange, sheetKey } from './frames';

/** Load every packed sheet a creature uses (deduped across states). */
export function preloadCreature(scene: Phaser.Scene, def: CreatureDef): void {
	const seen = new Set<string>();
	for (const anim of Object.values(def.anims)) {
		if (!anim || seen.has(anim.sheet)) continue;
		seen.add(anim.sheet);
		scene.load.spritesheet(
			sheetKey(def, anim.sheet),
			arpgAsset(`${def.assetPath}/${anim.sheet}.png`),
			{ frameWidth: def.frameSize, frameHeight: def.frameSize },
		);
	}
}

/** Register every state+direction animation once the sheets are loaded. */
export function registerCreatureAnims(
	scene: Phaser.Scene,
	def: CreatureDef,
): void {
	for (const state of Object.keys(def.anims) as CreatureState[]) {
		const anim = def.anims[state];
		if (!anim) continue;
		const dirs: CreatureDir[] = anim.dirless ? ['N'] : [...CREATURE_DIRS];
		for (const dir of dirs) {
			const key = creatureAnimKey(def, state, dir);
			if (scene.anims.exists(key)) continue;
			const { start, end } = frameRange(anim, dir, def.dirBlocks);
			scene.anims.create({
				key,
				frames: scene.anims.generateFrameNumbers(
					sheetKey(def, anim.sheet),
					{
						start,
						end,
					},
				),
				frameRate: anim.frameRate,
				repeat: anim.loop ? -1 : 0,
			});
		}
	}
}

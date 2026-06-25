import { arpgAsset } from '../../config';
import {
	type CreatureAnim,
	type CreatureDef,
	type CreatureDir,
	type CreatureState,
	type DirBlocks,
	DIAGONAL_DIRS,
} from './model';

/** Texture key for a creature's packed sheet (one texture per Sprite_N). */
export function sheetKey(def: CreatureDef, sheet: string): string {
	return `creature:${def.id}:${sheet}`;
}

/** Phaser animation key for one state+direction of a creature. */
export function creatureAnimKey(
	def: CreatureDef,
	state: CreatureState,
	dir: CreatureDir,
): string {
	const anim = def.anims[state];
	if (anim?.dirless) return `canim:${def.id}:${state}`;
	return `canim:${def.id}:${state}:${dir}`;
}

/** Inclusive [start,end] frame range for a state+direction within its sheet. */
export function frameRange(
	anim: CreatureAnim,
	dir: CreatureDir,
	dirBlocks: DirBlocks,
): { start: number; end: number } {
	if (anim.dirless) {
		return {
			start: anim.cardinalBase,
			end: anim.cardinalBase + anim.framesPerDir - 1,
		};
	}
	const base = DIAGONAL_DIRS.has(dir) ? anim.diagonalBase : anim.cardinalBase;
	const stride = anim.dirStride ?? anim.framesPerDir;
	const start = base + dirBlocks[dir] * stride;
	return { start, end: start + anim.framesPerDir - 1 };
}

/** States a creature actually ships, in declaration order. */
export function creatureStates(def: CreatureDef): CreatureState[] {
	return Object.keys(def.anims) as CreatureState[];
}

/** Public frame range for a state+direction (honors the creature's dirBlocks). */
export function creatureFrameRange(
	def: CreatureDef,
	state: CreatureState,
	dir: CreatureDir,
): { start: number; end: number } | null {
	const anim = def.anims[state];
	return anim ? frameRange(anim, dir, def.dirBlocks) : null;
}

/** Resolved URL of the sheet a state lives on. */
export function creatureSheetUrl(
	def: CreatureDef,
	state: CreatureState,
): string | null {
	const anim = def.anims[state];
	return anim ? arpgAsset(`${def.assetPath}/${anim.sheet}.png`) : null;
}

/** First-frame texture key + frame for a state+direction (initial sprite). */
export function creatureFirstFrame(
	def: CreatureDef,
	state: CreatureState,
	dir: CreatureDir,
): { key: string; frame: number } {
	const anim = def.anims[state] ?? def.anims.Idle!;
	return {
		key: sheetKey(def, anim.sheet),
		frame: frameRange(anim, dir, def.dirBlocks).start,
	};
}

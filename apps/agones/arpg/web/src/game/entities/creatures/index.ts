export {
	DEBUG_CREATURE_DIRS,
	CREATURE_DIRS,
	NAIVE_DIR_BLOCKS,
	CREATURE_LOCOMOTION,
	CREATURE_SHEET_COLS,
	type CreatureDir,
	type DirBlocks,
	type CreatureState,
	type CreatureAnim,
	type CreatureDef,
} from './model';
export {
	creatureAnimKey,
	creatureStates,
	creatureFrameRange,
	creatureSheetUrl,
	creatureFirstFrame,
} from './frames';
export {
	preloadCreature,
	registerCreatureAnims,
	isCreatureLoaded,
	unloadCreature,
} from './render';
export { dirFromDeg, nearestCreatureDir, CREATURE_SOUTH } from './direction';
export { resolveCreature, CREATURES } from './registry';
export { APEX_PREDATOR } from './data/apex-predator';
export { WYVERN_AIR, WYVERN_WATER, WYVERN_FIRE } from './data/wyvern';

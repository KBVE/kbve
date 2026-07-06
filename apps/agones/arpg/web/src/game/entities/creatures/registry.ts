import { type CreatureDef } from './model';
import { APEX_PREDATOR } from './data/apex-predator';
import { GOBLIN } from './data/goblin';
import { TRAINER } from './data/trainer';
import { WYVERN_AIR, WYVERN_FIRE, WYVERN_WATER } from './data/wyvern';

// Every creature def, keyed by its sim kind ref. Add a creature by dropping a
// new data module under ./data and listing it here — nothing else wires it.
const CREATURE_REGISTRY: Record<string, CreatureDef> = {
	apex_predator: APEX_PREDATOR,
	goblin: GOBLIN,
	trainer: TRAINER,
	wyvern_air: WYVERN_AIR,
	wyvern_water: WYVERN_WATER,
	wyvern_fire: WYVERN_FIRE,
};

/** Look up a creature def by its kind ref, or null if the ref isn't a creature. */
export function resolveCreature(ref: string | null): CreatureDef | null {
	return ref ? (CREATURE_REGISTRY[ref] ?? null) : null;
}

/** Every registered creature, for the in-game bestiary/codex. */
export const CREATURES: CreatureDef[] = Object.values(CREATURE_REGISTRY);

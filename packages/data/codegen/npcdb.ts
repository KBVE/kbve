/**
 * Runtime npcdb barrel — the single typed entry point for the proto-canonical
 * NPC pool.
 *
 * The codegen (gen-npcdb-data.mjs) emits `npcdb-data.json` in proto-canonical
 * form: camelCase keys + prefixed enum values (NPC_RARITY_*, MOVEMENT_TYPE_*).
 * The unified type (`Npc`, from the proto-generated `npcdb-schema.ts`) describes
 * the authoring shape: snake_case keys + bare enum values. This loader inverts
 * the exact transform the generator applies, so every consumer (cryptothrone,
 * factorio, …) reads ONE typed pool through the same `Npc` type instead of
 * hand-rolling its own.
 */
import rawNpcdb from './generated/npcdb-data.json';
import type { Npc, NpcRegistry } from './generated/npcdb-schema';

export type {
	Npc,
	NpcRegistry,
	NpcStats,
	NpcAbility,
	BehaviorTraits,
	FactionInfo,
	NpcRarityValue,
	NpcRankValue,
	PersonalityValue,
	CreatureFamilyValue,
	MovementTypeValue,
} from './generated/npcdb-schema';

// Mirror of ENUM_PREFIX in gen-npcdb-data.mjs (keyed by camelCase field name).
const ENUM_PREFIX: Record<string, string> = {
	personality: 'PERSONALITY_',
	element: 'ELEMENT_',
	rarity: 'NPC_RARITY_',
	rank: 'NPC_RANK_',
	creatureFamily: 'CREATURE_FAMILY_',
	movementType: 'MOVEMENT_TYPE_',
	difficulty: 'DIFFICULTY_',
	slot: 'EQUIP_SLOT_',
	anim: 'SPRITE_ANIM_',
};

function camelToSnake(key: string): string {
	return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/** Invert gen-npcdb-data's `transform`: camelCase→snake_case keys + de-prefix
 * the enum string leaves whose parent field carries a known prefix. */
function reverse(node: unknown, parentCamelKey = ''): unknown {
	if (node === null || node === undefined) return node;
	if (Array.isArray(node)) {
		return node.map((child) => reverse(child, parentCamelKey));
	}
	if (typeof node === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(node)) {
			out[camelToSnake(key)] = reverse(value, key);
		}
		return out;
	}
	if (typeof node === 'string' && ENUM_PREFIX[parentCamelKey]) {
		const prefix = ENUM_PREFIX[parentCamelKey];
		const bare = node.startsWith(prefix) ? node.slice(prefix.length) : node;
		return bare.toLowerCase();
	}
	return node;
}

let npcCache: Npc[] | null = null;

/** The full NPC pool, normalized to the unified `Npc` (authoring) shape. */
export function loadNpcs(): Npc[] {
	if (!npcCache) {
		const pool = (rawNpcdb as { npcs?: unknown[] }).npcs ?? [];
		npcCache = pool.map((n) => reverse(n) as Npc);
	}
	return npcCache;
}

/** The pool wrapped as an `NpcRegistry` (matches `NpcRegistrySchema`). */
export function loadNpcRegistry(): NpcRegistry {
	return { npcs: loadNpcs() } as NpcRegistry;
}

let refIndex: Map<string, Npc> | null = null;

/** Look up a single NPC by its `ref`. */
export function getNpc(ref: string): Npc | undefined {
	if (!refIndex) {
		refIndex = new Map(loadNpcs().map((n) => [n.ref, n]));
	}
	return refIndex.get(ref);
}

/**
 * Runtime spelldb barrel — the single typed entry point for the proto-canonical
 * spell pool.
 *
 * The codegen (gen-spelldb-data.mjs) emits `spelldb-data.json` in proto-canonical
 * form: camelCase keys + prefixed enum values (SPELL_SCHOOL_*, SPELL_TARGET_*).
 * The unified type (`Spell`, from the proto-generated `spelldb-schema.ts`)
 * describes the authoring shape: snake_case keys + bare enum values. This loader
 * inverts the exact transform the generator applies, so every consumer reads ONE
 * typed pool through the same `Spell` type.
 */
import rawSpelldb from './generated/spelldb-data.json';
import type { Spell, SpellRegistry } from './generated/spelldb-schema';

export type {
	Spell,
	SpellRegistry,
	SpellSchoolValue,
	SpellTargetValue,
	SpellEffectValue,
	SpellRarityValue,
} from './generated/spelldb-schema';

// Mirror of ENUM_PREFIX in gen-spelldb-data.mjs (keyed by camelCase field name).
const ENUM_PREFIX: Record<string, string> = {
	school: 'SPELL_SCHOOL_',
	target: 'SPELL_TARGET_',
	effect: 'SPELL_EFFECT_',
	rarity: 'SPELL_RARITY_',
};

function camelToSnake(key: string): string {
	return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/** Invert gen-spelldb-data's `transform`: camelCase→snake_case keys + de-prefix
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

let spellCache: Spell[] | null = null;

/** The full spell pool, normalized to the unified `Spell` (authoring) shape. */
export function loadSpells(): Spell[] {
	if (!spellCache) {
		const pool = (rawSpelldb as { spells?: unknown[] }).spells ?? [];
		spellCache = pool.map((s) => reverse(s) as Spell);
	}
	return spellCache;
}

/** The pool wrapped as a `SpellRegistry` (matches `SpellRegistrySchema`). */
export function loadSpellRegistry(): SpellRegistry {
	return { spells: loadSpells() } as SpellRegistry;
}

let refIndex: Map<string, Spell> | null = null;

/** Look up a single spell by its `ref`. */
export function getSpell(ref: string): Spell | undefined {
	if (!refIndex) {
		refIndex = new Map(loadSpells().map((s) => [s.ref, s]));
	}
	return refIndex.get(ref);
}

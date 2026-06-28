// Client-side spelldb lookup. The canonical data is the MDX-sourced spelldb,
// bundled at build via the `@kbve/spelldb-data` alias (generated/spelldb-data.json)
// so the HUD shows names/school/mana instead of raw refs with no network round
// trip. Enum values arrive proto-prefixed (SPELL_SCHOOL_FIRE) and are stripped to
// the de-prefixed lowercase form (fire). SoT stays the spelldb.

import spelldb from '@kbve/spelldb-data';
import { rarityColor } from './itemMeta';

export { rarityColor };

export interface SpellMeta {
	ref: string;
	name: string;
	key: number;
	emoji?: string;
	school: string;
	effect: string;
	manaCost: number;
	cooldownMs: number;
	range: number;
	radius: number;
	durationMs: number;
	target: string;
	power: number;
	rarity: string;
}

function strip(value: string | undefined, prefix: string): string {
	if (!value) return '';
	const v = value.startsWith(prefix) ? value.slice(prefix.length) : value;
	return v.toLowerCase();
}

let cache: Map<string, SpellMeta> | null = null;

function buildSpellMeta(): Map<string, SpellMeta> {
	const map = new Map<string, SpellMeta>();
	const spells = (spelldb as { spells?: any[] }).spells ?? [];
	for (const sp of spells) {
		if (!sp?.ref) continue;
		map.set(sp.ref, {
			ref: sp.ref,
			name: sp.name ?? sp.ref,
			key: sp.key ?? 0,
			emoji: sp.emoji,
			school: strip(sp.school, 'SPELL_SCHOOL_'),
			effect: strip(sp.effect, 'SPELL_EFFECT_'),
			manaCost: sp.manaCost ?? 0,
			cooldownMs: sp.cooldownMs ?? 0,
			range: sp.range ?? 0,
			radius: sp.radius ?? 0,
			durationMs: sp.durationMs ?? 0,
			target: strip(sp.target, 'SPELL_TARGET_'),
			power: sp.power ?? 0,
			rarity: strip(sp.rarity, 'SPELL_RARITY_'),
		});
	}
	return map;
}

/** Resolve the spelldb map (built once from the bundled data). */
export function loadSpellMeta(): Promise<Map<string, SpellMeta>> {
	if (!cache) cache = buildSpellMeta();
	return Promise.resolve(cache);
}

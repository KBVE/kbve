import Phaser from 'phaser';
import { GameClient, EntityStore, Cat } from '@kbve/laser';
import { floatTile, type FloatState } from './floatMotion';
import { loadSpellMeta, type SpellMeta } from '../entities/spellMeta';
import { emitSpellLoadout } from './hud';
import { playSpellVfx } from '../entities/projectiles/spells/spellVfx';
import type { EntityRefs } from '../entities/sprites';
import type { TileXY } from '../iso';

/**
 * Spell loadout + casting. Loadout is the first 9 spells from spelldb (keys 1-9,
 * bound to the bare number keys); casting auto-acquires the nearest hostile for
 * targeted schools and fires the local VFX. The server is authoritative on
 * whether a cast actually lands.
 */
export interface SpellState {
	meta: Map<string, SpellMeta>;
	loadout: (string | undefined)[];
}

export function makeSpellState(): SpellState {
	return { meta: new Map(), loadout: [] };
}

export interface SpellDeps {
	scene: Phaser.Scene;
	client(): GameClient | null;
	store: EntityStore<EntityRefs>;
	floatState: FloatState;
	predicted(): TileXY;
	isHostile(serverEid: number): boolean;
}

/** Load spelldb meta + publish the first-9 loadout to the HUD spell bar. */
export function initSpellLoadout(st: SpellState): void {
	void loadSpellMeta().then((meta) => {
		st.meta = meta;
		const ordered = [...meta.values()].sort((a, b) => a.key - b.key);
		st.loadout = ordered.slice(0, 9).map((s) => s.ref);
		emitSpellLoadout(ordered.slice(0, 9));
	});
}

export function castSpellSlot(
	st: SpellState,
	deps: SpellDeps,
	idx: number,
): void {
	const ref = st.loadout[idx];
	if (!ref) return;
	const meta = st.meta.get(ref);
	const targeted = meta?.effect === 'damage' || meta?.effect === 'status';
	const target = targeted ? nearestHostile(deps, meta?.range ?? 0) : null;
	deps.client()?.castSpell(ref, target);
	playSpellVfxAt(st, deps, meta, target);
}

function playSpellVfxAt(
	_st: SpellState,
	deps: SpellDeps,
	meta: SpellMeta | undefined,
	target: number | null,
): void {
	if (!meta) return;
	const from = deps.predicted();
	const to =
		(target != null ? deps.store.tile(target) : null) ??
		floatTile(deps.floatState);
	playSpellVfx(deps.scene, meta.school, meta.effect, from, to);
}

/**
 * Nearest hostile NPC to the player, within `range` tiles (0 = unbounded).
 * Returns the server eid or null when none is in range. v1 spell targeting is
 * auto-acquire (no aim ray) — an honest nearest-in-range pick, not a fake hit;
 * the server is authoritative on whether the cast lands.
 */
export function nearestHostile(deps: SpellDeps, range: number): number | null {
	const me = deps.predicted();
	let best: number | null = null;
	let bestD = Infinity;
	for (const sid of deps.store.serverIdsWith(Cat.Npc)) {
		if (!deps.isHostile(sid)) continue;
		const t = deps.store.tile(sid);
		if (!t) continue;
		const d = Math.max(Math.abs(t.x - me.x), Math.abs(t.y - me.y));
		if (range > 0 && d > range) continue;
		if (d < bestD) {
			bestD = d;
			best = sid;
		}
	}
	return best;
}

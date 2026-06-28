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
 * bound to the bare number keys); targeted schools fire along the cursor aim ray
 * (the bow projectile model — first hostile in the line, else a clean miss) and
 * play the local VFX. The server is authoritative on whether a cast lands, and a
 * fired cast always spends mana even on a miss.
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
	aim(): TileXY;
	isHostile(serverEid: number): boolean;
}

const AIM_PERP = 0.75;

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
	const from = deps.predicted();
	const aim = deps.aim();
	const target = targeted
		? aimHostile(deps, from, aim, meta?.range ?? 0)
		: null;
	deps.client()?.castSpell(ref, target);
	playSpellVfxAt(deps, meta, target, aim);
}

function playSpellVfxAt(
	deps: SpellDeps,
	meta: SpellMeta | undefined,
	target: number | null,
	aim: TileXY,
): void {
	if (!meta) return;
	// Launch the VFX from the player's actual sub-tile float position (where the sprite
	// is drawn), NOT the rounded predicted tile — otherwise the bolt starts offset from
	// the caster whenever they're between tiles. Mirrors the bow muzzle origin.
	const pos = deps.floatState.pos;
	const from: TileXY = { x: pos.x, y: pos.y };
	const targeted = meta.effect === 'damage' || meta.effect === 'status';
	const to = targeted
		? ((target != null ? deps.store.tile(target) : null) ?? aim)
		: floatTile(deps.floatState);
	playSpellVfx(deps.scene, meta.school, meta.effect, from, to);
}

/**
 * First hostile NPC along the aim ray from `from` toward `aim`, within `range`
 * tiles (0 = unbounded). Marches the direction and returns the nearest hostile
 * whose center sits within AIM_PERP of the centerline — the projectile model
 * shared with the bow: the spell flies where aimed and hits the first thing in
 * its path, or null (clean miss). The server is authoritative on the landing.
 */
export function aimHostile(
	deps: SpellDeps,
	from: TileXY,
	aim: TileXY,
	range: number,
): number | null {
	const adx = aim.x - from.x;
	const ady = aim.y - from.y;
	const amag = Math.hypot(adx, ady);
	if (amag < 1e-3) return null;
	const nx = adx / amag;
	const ny = ady / amag;
	const cap = range > 0 ? range : Infinity;
	let best: number | null = null;
	let bestAlong = Infinity;
	for (const sid of deps.store.serverIdsWith(Cat.Npc)) {
		if (!deps.isHostile(sid)) continue;
		const t = deps.store.tile(sid);
		if (!t) continue;
		const dx = t.x - from.x;
		const dy = t.y - from.y;
		const along = dx * nx + dy * ny;
		if (along <= 0 || along > cap) continue;
		if (Math.abs(dx * ny - dy * nx) > AIM_PERP) continue;
		if (along < bestAlong) {
			bestAlong = along;
			best = sid;
		}
	}
	return best;
}

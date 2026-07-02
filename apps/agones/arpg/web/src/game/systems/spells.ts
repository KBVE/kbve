import Phaser from 'phaser';
import { GameClient, EntityStore, Cat } from '@kbve/laser';
import { floatTile, type FloatState } from './floatMotion';
import { loadSpellMeta, type SpellMeta } from '../entities/spellMeta';
import { emitSpellLoadout } from './hud';
import {
	playSpellVfx,
	castStormVfx,
} from '../entities/projectiles/spells/spellVfx';
import type { EntityRefs } from '../entities/sprites';
import {
	worldToScreen,
	worldToScreenFlat,
	screenToWorldF,
	type TileXY,
} from '../iso';
import type { InterpBuffer } from './interp';

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
		? acquireSpellTarget(deps, from, aim, meta?.range ?? 0)
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
	// Area storm (nova/radius): rain strikes around the caster instead of a single bolt.
	if (
		meta.radius > 0 &&
		(meta.target === 'nova' || meta.effect === 'damage')
	) {
		castStormVfx(
			deps.scene,
			from,
			meta.radius,
			meta.durationMs || 2000,
			meta.school,
		);
		return;
	}
	const targeted = meta.effect === 'damage' || meta.effect === 'status';
	// Aim the bolt at the target's on-screen SPRITE (hover-adjusted) so it lands on a flying
	// wyvern, not the ground tile beneath it — and LEAD a moving target so the bolt flies to
	// where it's heading (intercept), which is what reads right for a fast flyer.
	const targetRefs = target != null ? deps.store.refs(target) : undefined;
	const to = targeted
		? targetRefs?.sprite
			? leadTarget(from, targetRefs.sprite, targetRefs.interp)
			: aim
		: floatTile(deps.floatState);
	playSpellVfx(deps.scene, meta.school, meta.effect, from, to);
}

const BOLT_SPEED_PX_MS = 0.9; // matches castBolt's BOLT_SPEED
const MAX_LEAD_PX = 220; // cap so a noisy/huge velocity can't fling the bolt off-screen

/** Target velocity in tiles/ms from the last two interp samples (0 if not enough/staled). */
function velTilesPerMs(interp: InterpBuffer | undefined): {
	vx: number;
	vy: number;
} {
	const buf = interp?.buf;
	if (!buf || buf.length < 2) return { vx: 0, vy: 0 };
	const a = buf[buf.length - 2];
	const b = buf[buf.length - 1];
	const dt = b.t - a.t;
	if (dt <= 0) return { vx: 0, vy: 0 };
	return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
}

/** Screen-space intercept point for the bolt: the target sprite's current position plus its
 * velocity over the bolt's flight time, returned as a fractional tile (worldToScreen lands
 * it back on screen). Leading makes the bolt meet a moving wyvern instead of trailing it. */
function leadTarget(
	from: TileXY,
	sprite: { x: number; y: number },
	interp: InterpBuffer | undefined,
): TileXY {
	const aPx = worldToScreen(from.x, from.y);
	aPx.y -= 32;
	const flightMs = Math.max(
		140,
		Math.hypot(sprite.x - aPx.x, sprite.y - aPx.y) / BOLT_SPEED_PX_MS,
	);
	const vel = velTilesPerMs(interp);
	// The FLAT projection is linear (no translation), so it maps the tile-space
	// velocity straight to a screen-space velocity vector. The height-aware
	// projection would sample terrain at (vx, vy) as if it were a position.
	const sv = worldToScreenFlat(vel.vx, vel.vy);
	let leadX = sv.x * flightMs;
	let leadY = sv.y * flightMs;
	const leadMag = Math.hypot(leadX, leadY);
	if (leadMag > MAX_LEAD_PX) {
		leadX = (leadX / leadMag) * MAX_LEAD_PX;
		leadY = (leadY / leadMag) * MAX_LEAD_PX;
	}
	return screenToWorldF(sprite.x + leadX, sprite.y + leadY);
}

// Aim-assist cone half-width (screen px) for spell targeting: a hostile whose SPRITE sits
// within this of the player→aim line is considered "aimed at". Generous (~3 tiles) so a
// roughly-aimed cast at a fast, hovering flyer connects — pinpointing a wyvern by hand is
// the bad UX we're fixing. Flyers hover above their ground tile, so a TILE-space ray
// misses them; matching the on-screen sprite to the on-screen line is what the player sees.
const SPELL_AIM_HALF_PX = 110;

/**
 * Acquire the spell's target with aim-assist: among hostiles in FRONT of the cast (along
 * the player→aim line), within `range` tiles, and within `SPELL_AIM_HALF_PX` of the line,
 * pick the one CLOSEST to the line (the one the player is pointing at). Sprite-space, so it
 * works on hovering wyverns. Falls back to the tile aim ray if nothing's in the cone.
 */
export function acquireSpellTarget(
	deps: SpellDeps,
	from: TileXY,
	aim: TileXY,
	range: number,
): number | null {
	const a = worldToScreen(from.x, from.y);
	const b = worldToScreen(aim.x, aim.y);
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len = Math.hypot(dx, dy);
	if (len < 1e-3) return aimHostile(deps, from, aim, range);
	const nx = dx / len;
	const ny = dy / len;
	const cap = range > 0 ? range : Infinity;
	let best: number | null = null;
	let bestPerp = SPELL_AIM_HALF_PX;
	for (const sid of deps.store.serverIdsWith(Cat.Npc)) {
		if (!deps.isHostile(sid)) continue;
		const t = deps.store.tile(sid);
		if (!t) continue;
		if (Math.hypot(t.x - from.x, t.y - from.y) > cap) continue;
		const sprite = deps.store.refs(sid)?.sprite;
		if (!sprite) continue;
		const rx = sprite.x - a.x;
		const ry = sprite.y - a.y;
		if (rx * nx + ry * ny <= 0) continue; // behind the caster
		const perp = Math.abs(rx * ny - ry * nx);
		if (perp < bestPerp) {
			bestPerp = perp;
			best = sid;
		}
	}
	return best ?? aimHostile(deps, from, aim, range);
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

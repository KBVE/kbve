import Phaser from 'phaser';
import {
	GameClient,
	EntityStore,
	ACTION_SHOOT,
	flashEntity,
	floatingText,
	type CombatEvent,
} from '@kbve/laser';
import { DEPTH_UI, ARROW_MAX_RANGE, ARROW_SPEED } from '../config';
import {
	fireBow,
	showDamage,
	type BowShot,
} from '../entities/projectiles/arrows/bow';
import { setCreaturePose, type EntityRefs } from '../entities/sprites';
import { worldToScreen, type TileXY } from '../iso';

// Aim-assist cone half-width (screen px) for bow targeting: a hostile whose
// on-screen SPRITE sits within this of the player→aim screen line is a hit.
// Sprite-space (not tile-space) so a shot aimed at a hovering flyer connects —
// a flyer is drawn above its ground tile, so a tile-space ray sails over it.
// Tighter than the spell cone: the arrow reads as a thin shaft, so a fat cone
// makes clean-looking misses count as hits. ~1.7 tiles of screen slack — enough
// to forgive a hovering flyer, not enough to grab an enemy the shot visibly
// sails past.
const BOW_AIM_HALF_PX = 55;
// How long a corpse (a monster the arrow just killed) plays its death before it
// is torn down.
const CORPSE_FADE_MS = 900;

/**
 * Client-side bow-shot bookkeeping. The server resolves a shot the instant it
 * looses, but the local arrow is still travelling — these buffers hold the
 * authoritative result (and any killed-but-not-yet-landed corpse) until the
 * arrow visually arrives so feedback syncs to impact.
 */
export interface CombatState {
	bowShot: BowShot | null;
	// In-flight bow shot (online): the server-authoritative hit for `target` is
	// buffered until the local arrow lands so feedback syncs to impact.
	inflightArrow: { target: number; arrived: boolean } | null;
	// In-flight spell bolts (online): the server resolves a targeted spell the
	// tick it's cast, but the local bolt VFX is still travelling — the hit for
	// each target is buffered until its bolt lands so the number syncs to impact
	// (mirrors inflightArrow). Keyed by target serverEid.
	inflightSpells: Map<number, { arrived: boolean }>;
	bufferedHits: Map<number, CombatEvent>;
	// Monsters despawned server-side by an in-flight arrow, held as corpses until
	// the arrow lands (keyed by server eid).
	dyingSprites: Map<number, EntityRefs>;
}

export function makeCombatState(): CombatState {
	return {
		bowShot: null,
		inflightArrow: null,
		inflightSpells: new Map(),
		bufferedHits: new Map(),
		dyingSprites: new Map(),
	};
}

/**
 * Register an in-flight targeted spell bolt: the server-authoritative hit for
 * `target` is buffered (see onCombat) until the bolt visually lands `travelMs`
 * from now, so the damage number pops on impact instead of at cast. Mirrors the
 * bow's inflightArrow + travel-time settle.
 */
export function beginInflightSpell(
	st: CombatState,
	deps: CombatDeps,
	target: number,
	travelMs: number,
): void {
	st.inflightSpells.set(target, { arrived: false });
	deps.scene.time.delayedCall(travelMs + 30, () =>
		onSpellArrive(st, deps, target),
	);
}

/**
 * A local spell bolt reached its target: mark arrived and flush the deferred
 * server hit (number, flash, death/corpse) — same settle as onArrowArrive.
 */
export function onSpellArrive(
	st: CombatState,
	deps: CombatDeps,
	target: number,
): void {
	const inflight = st.inflightSpells.get(target);
	if (inflight) inflight.arrived = true;
	const c = st.bufferedHits.get(target);
	if (c) {
		st.bufferedHits.delete(target);
		showCombat(st, deps, c);
	}
	const corpse = st.dyingSprites.get(target);
	if (corpse) {
		st.dyingSprites.delete(target);
		if (
			corpse.creature &&
			corpse.sprite instanceof Phaser.GameObjects.Sprite
		) {
			setCreaturePose(corpse.sprite, corpse.creature, 'Dead');
			deps.scene.time.delayedCall(CORPSE_FADE_MS, () =>
				deps.destroyRefs(corpse),
			);
		} else {
			deps.destroyRefs(corpse);
		}
	}
	st.inflightSpells.delete(target);
}

export interface CombatDeps {
	scene: Phaser.Scene;
	store: EntityStore<EntityRefs>;
	client(): GameClient | null;
	myEid(): number;
	floatPos(): { x: number; y: number };
	isHostile(serverEid: number): boolean;
	lockedTarget(): number | null;
	lockedAim(): TileXY | null;
	clearMovePath(): void;
	refreshHud(): void;
	destroyRefs(refs: EntityRefs): void;
}

/**
 * Fire the ranger's bow at a world tile: Draw windup -> Loose -> arrow. The shot
 * is gated so you can't re-fire mid-draw, and it cancels any active click-move
 * (you plant to shoot). Online the server is authoritative; offline the hit is
 * applied locally.
 */
export function fireBowAt(
	st: CombatState,
	deps: CombatDeps,
	aim: TileXY,
	target?: number,
): void {
	if (st.bowShot?.busy) return;
	const refs = deps.store.refs(deps.myEid());
	if (!refs?.cls || !(refs.sprite instanceof Phaser.GameObjects.Sprite))
		return;
	deps.clearMovePath();
	const fp = deps.floatPos();
	const from = { x: fp.x, y: fp.y };
	const locked = target == null ? deps.lockedTarget() : null;
	const shotTarget = target ?? locked ?? acquireBowTarget(deps, from, aim);
	// A lock supplies both the target and the aim (auto-face); else the arrow
	// flies at the acquired enemy's tile, else the raw cursor aim.
	const lockedAim = locked != null ? deps.lockedAim() : null;
	const shotTile =
		lockedAim ??
		(shotTarget != null ? (deps.store.tile(shotTarget) ?? aim) : aim);
	// Land the arrow on the target's on-screen SPRITE (hovering flyers are drawn
	// above their ground tile), so a hit connects with the wyvern the player sees
	// instead of the empty ground beneath it. Tile drives the hit-test; this only
	// steers the visual endpoint.
	const shotSprite =
		shotTarget != null ? deps.store.refs(shotTarget)?.sprite : undefined;
	const screenTarget = shotSprite
		? { x: shotSprite.x, y: shotSprite.y }
		: undefined;
	st.bowShot = fireBow(
		deps.scene,
		refs.sprite,
		refs.cls,
		from,
		shotTile,
		(tx, ty) => arrowHitTest(deps, tx, ty),
		(serverEid) => {
			onArrowArrive(st, deps, serverEid);
		},
		() => {
			deps.client()?.action(ACTION_SHOOT, shotTarget ?? null);
			if (shotTarget == null) {
				st.inflightArrow = null;
				return;
			}
			st.inflightArrow = { target: shotTarget, arrived: false };
			// A lethal shot despawns the target before the arrow's own hit-test
			// can fire, so settle the hit when the arrow WOULD arrive (its travel
			// time to the target tile).
			const dist = Math.hypot(shotTile.x - from.x, shotTile.y - from.y);
			const travelMs =
				(Math.min(dist, ARROW_MAX_RANGE) / ARROW_SPEED) * 1000;
			deps.scene.time.delayedCall(travelMs + 30, () =>
				onArrowArrive(st, deps, shotTarget),
			);
		},
		screenTarget,
	);
}

/**
 * Acquire the hostile the arrow will hit with sprite-space aim-assist: among
 * hostiles in FRONT of the shot (along the player→aim SCREEN line), in range,
 * and within BOW_AIM_HALF_PX of that line, pick the one CLOSEST to the line.
 * Matches the on-screen sprite to the on-screen aim line, so a shot aimed at a
 * hovering flyer (drawn above its ground tile) connects — a tile-space ray
 * misses it. Mirrors acquireSpellTarget; falls back to null (clean miss).
 */
export function acquireBowTarget(
	deps: CombatDeps,
	from: TileXY,
	aim: TileXY,
): number | undefined {
	const a = worldToScreen(from.x, from.y);
	const b = worldToScreen(aim.x, aim.y);
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len = Math.hypot(dx, dy);
	if (len < 1e-3) return undefined;
	const nx = dx / len;
	const ny = dy / len;
	let best: number | undefined;
	let bestPerp = BOW_AIM_HALF_PX;
	for (const [serverEid, , refs] of deps.store.entries()) {
		if (!deps.isHostile(serverEid)) continue;
		const t = deps.store.tile(serverEid);
		if (!t) continue;
		if (Math.hypot(t.x - from.x, t.y - from.y) > ARROW_MAX_RANGE) continue;
		const sprite = refs.sprite;
		if (!sprite) continue;
		const rx = sprite.x - a.x;
		const ry = sprite.y - a.y;
		if (rx * nx + ry * ny <= 0) continue; // behind the shooter
		const perp = Math.abs(rx * ny - ry * nx);
		if (perp < bestPerp) {
			bestPerp = perp;
			best = serverEid;
		}
	}
	return best;
}

/**
 * Arrow hit-test: first HOSTILE entity occupying the tile, else miss. Only
 * hostiles collide so the arrow flies through placed props (campfires), ground
 * loot, and friendly players instead of being consumed by them.
 */
export function arrowHitTest(
	deps: CombatDeps,
	tx: number,
	ty: number,
): { serverEid: number; x: number; y: number } | null {
	const hit = deps.store.at(tx, ty, deps.myEid());
	if (!hit || !deps.isHostile(hit.serverEid)) return null;
	return {
		serverEid: hit.serverEid,
		x: hit.refs.sprite.x,
		y: hit.refs.sprite.y,
	};
}

export function onCombat(
	st: CombatState,
	deps: CombatDeps,
	c: CombatEvent,
): void {
	// The server resolves a bow shot the instant it looses, but the client's
	// arrow is still in flight. If this hit is from the local player's arrow
	// heading at this target, defer the feedback until the arrow lands (flushed
	// in onArrowArrive / a travel-time fallback) so the number and recoil sync to
	// impact instead of popping at release.
	if (
		c.attacker === deps.myEid() &&
		st.inflightArrow &&
		st.inflightArrow.target === c.target &&
		!st.inflightArrow.arrived
	) {
		st.bufferedHits.set(c.target, c);
		return;
	}
	// Same deferral for a targeted spell bolt still travelling to this target.
	const spell =
		c.attacker === deps.myEid() && st.inflightSpells.get(c.target);
	if (spell && !spell.arrived) {
		st.bufferedHits.set(c.target, c);
		return;
	}
	showCombat(st, deps, c);
}

/**
 * The local player's arrow reached its target: release the deferred server hit
 * (number, recoil/death) and, if the target was a kill held as a corpse, play
 * its death then clear it. Idempotent — both the visual hit-test and the
 * travel-time timer call it.
 */
export function onArrowArrive(
	st: CombatState,
	deps: CombatDeps,
	target: number,
): void {
	if (st.inflightArrow?.target === target) st.inflightArrow.arrived = true;
	const c = st.bufferedHits.get(target);
	if (c) {
		st.bufferedHits.delete(target);
		showCombat(st, deps, c);
	}
	const corpse = st.dyingSprites.get(target);
	if (corpse) {
		st.dyingSprites.delete(target);
		if (
			corpse.creature &&
			corpse.sprite instanceof Phaser.GameObjects.Sprite
		) {
			setCreaturePose(corpse.sprite, corpse.creature, 'Dead');
			deps.scene.time.delayedCall(CORPSE_FADE_MS, () =>
				deps.destroyRefs(corpse),
			);
		} else {
			deps.destroyRefs(corpse);
		}
	}
	if (st.inflightArrow?.target === target) st.inflightArrow = null;
}

export function showCombat(
	st: CombatState,
	deps: CombatDeps,
	c: CombatEvent,
): void {
	const refs = deps.store.refs(c.target) ?? st.dyingSprites.get(c.target);
	if (!refs?.sprite) return;
	floatingText(
		deps.scene,
		refs.sprite.x,
		refs.sprite.y - refs.sprite.displayHeight - 18,
		c.crit ? `CRIT ${c.dmg}!` : `-${c.dmg}`,
		c.crit ? '#fbbf24' : '#f87171',
		DEPTH_UI + 2,
	);
	if (refs.sprite instanceof Phaser.GameObjects.Sprite) {
		flashEntity(deps.scene, refs.sprite);
	}

	if (c.target === deps.myEid() && !c.died) {
		const cam = deps.scene.cameras.main;
		cam.flash(120, 90, 0, 0);
		cam.shake(70, 0.004);
	}
	if (c.died && c.attacker === deps.myEid()) {
		deps.scene.cameras.main.shake(90, 0.005);
	}

	// Drive creature combat poses: the attacker swings (facing its target), the
	// victim recoils (or dies). Non-arrow deaths still settle via the hp<=0 check
	// in refreshHud.
	const atk = deps.store.refs(c.attacker);
	if (atk?.creature && atk.sprite instanceof Phaser.GameObjects.Sprite) {
		const a = deps.store.tile(c.attacker);
		const t = deps.store.tile(c.target);
		const face = a && t ? { dx: t.x - a.x, dy: t.y - a.y } : undefined;
		setCreaturePose(atk.sprite, atk.creature, 'Attack1', face);
	}
	if (refs.creature && refs.sprite instanceof Phaser.GameObjects.Sprite) {
		setCreaturePose(refs.sprite, refs.creature, c.died ? 'Dead' : 'GetHit');
	}
}

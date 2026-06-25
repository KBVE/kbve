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
import type { TileXY } from '../iso';

// How far (tiles) a hostile's center may sit off the aim line and still be hit
// by the arrow — the thick-ray half-width. Bigger = more forgiving aim.
const BOW_ACQUIRE_PERP = 0.85;
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
	bufferedHits: Map<number, CombatEvent>;
	// Monsters despawned server-side by an in-flight arrow, held as corpses until
	// the arrow lands (keyed by server eid).
	dyingSprites: Map<number, EntityRefs>;
}

export function makeCombatState(): CombatState {
	return {
		bowShot: null,
		inflightArrow: null,
		bufferedHits: new Map(),
		dyingSprites: new Map(),
	};
}

export interface CombatDeps {
	scene: Phaser.Scene;
	store: EntityStore<EntityRefs>;
	client(): GameClient | null;
	myEid(): number;
	floatPos(): { x: number; y: number };
	isHostile(serverEid: number): boolean;
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
	const shotTarget = target ?? acquireBowTarget(deps, from, aim);
	// Fly the arrow AT the acquired enemy (not the raw cursor point) so the
	// visual shot connects with whatever the server resolves — a near-path
	// target snaps the arrow onto it instead of sailing past.
	const shotTile =
		shotTarget != null ? (deps.store.tile(shotTarget) ?? aim) : aim;
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
	);
}

/**
 * Acquire the hostile the arrow will actually hit by marching the aim ray in
 * tile steps and returning the first hostile tile crossed — the SAME rounded
 * `store.at` model the flying arrow's `arrowHitTest` uses. Keeping acquisition
 * and the visual arrow on one hit model is what makes the server register the
 * shot the player sees connect (a perpendicular-distance test diverged from the
 * arrow and dropped grazing hits).
 */
export function acquireBowTarget(
	deps: CombatDeps,
	from: TileXY,
	aim: TileXY,
): number | undefined {
	const adx = aim.x - from.x;
	const ady = aim.y - from.y;
	const amag = Math.hypot(adx, ady);
	if (amag < 1e-3) return undefined;
	const nx = adx / amag;
	const ny = ady / amag;
	// Thick-ray: the arrow flies a direction, so it hits the FIRST hostile along
	// that line — the nearest one whose center sits within BOW_ACQUIRE_PERP tiles
	// of the centerline, in range. Forgiving so a roughly-aimed shot still
	// connects, while staying first-in-path.
	let best: number | undefined;
	let bestAlong = Infinity;
	for (const [serverEid] of deps.store.entries()) {
		if (!deps.isHostile(serverEid)) continue;
		const t = deps.store.tile(serverEid);
		if (!t) continue;
		const dx = t.x - from.x;
		const dy = t.y - from.y;
		const along = dx * nx + dy * ny;
		if (along <= 0 || along > ARROW_MAX_RANGE) continue;
		const perp = Math.abs(dx * ny - dy * nx);
		if (perp > BOW_ACQUIRE_PERP) continue;
		if (along < bestAlong) {
			bestAlong = along;
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
	if (!refs) return;
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

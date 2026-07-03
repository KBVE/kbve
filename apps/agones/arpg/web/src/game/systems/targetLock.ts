import { EntityStore, Cat } from '@kbve/laser';
import type { EntityRefs } from '../entities/sprites';
import type { TileXY } from '../iso';

/**
 * Client-side target lock. A locked hostile takes all attacks regardless of the
 * cursor, so the cursor is freed for kiting. Pure selection/validity logic; the
 * scene owns the state and ticks validity each frame. LoS break is deferred —
 * the scene has no tile-to-tile LoS helper — so validity is range + death only.
 */
export interface TargetLockState {
	lockedEid: number | null;
}

export interface TargetLockDeps {
	store: EntityStore<EntityRefs>;
	myEid(): number;
	isHostile(sid: number): boolean;
	isCorpse(sid: number): boolean;
	playerTile(): TileXY;
	maxRange(): number;
}

export function makeTargetLockState(): TargetLockState {
	return { lockedEid: null };
}

export function clearLock(st: TargetLockState): void {
	st.lockedEid = null;
}

function isLiveHostile(deps: TargetLockDeps, sid: number): boolean {
	return deps.store.has(sid) && deps.isHostile(sid) && !deps.isCorpse(sid);
}

/** Hostiles sorted nearest→farthest by tile distance from the player, stable
 * tie-break by ascending serverEid. */
export function hostilesByDistance(
	deps: TargetLockDeps,
): { sid: number; dist: number }[] {
	const p = deps.playerTile();
	const out: { sid: number; dist: number }[] = [];
	for (const sid of deps.store.serverIdsWith(Cat.Npc)) {
		if (!isLiveHostile(deps, sid)) continue;
		const t = deps.store.tile(sid);
		if (!t) continue;
		out.push({ sid, dist: Math.hypot(t.x - p.x, t.y - p.y) });
	}
	out.sort((a, b) => a.dist - b.dist || a.sid - b.sid);
	return out;
}

/** First Tab / click: lock the hostile under the cursor, else the nearest. */
export function lockUnderCursor(
	st: TargetLockState,
	deps: TargetLockDeps,
	cursorTile: TileXY,
): number | null {
	const under = deps.store.at(cursorTile.x, cursorTile.y, deps.myEid());
	if (under && isLiveHostile(deps, under.serverEid)) {
		st.lockedEid = under.serverEid;
		return st.lockedEid;
	}
	const nearest = hostilesByDistance(deps)[0];
	st.lockedEid = nearest ? nearest.sid : null;
	return st.lockedEid;
}

/** Subsequent Tab: advance to the next hostile nearest-outward, wrapping. */
export function cycleLock(
	st: TargetLockState,
	deps: TargetLockDeps,
): number | null {
	const ordered = hostilesByDistance(deps).map((h) => h.sid);
	if (ordered.length === 0) {
		st.lockedEid = null;
		return null;
	}
	const idx = st.lockedEid == null ? -1 : ordered.indexOf(st.lockedEid);
	st.lockedEid = ordered[(idx + 1) % ordered.length];
	return st.lockedEid;
}

/** Per-frame validity: break on death (auto-advance to next-nearest in range)
 * or out-of-range; returns the effective lockedEid after the tick. */
export function tickLockValidity(
	st: TargetLockState,
	deps: TargetLockDeps,
): number | null {
	if (st.lockedEid == null) return null;
	const sid = st.lockedEid;
	const range = deps.maxRange();
	const p = deps.playerTile();
	const t = isLiveHostile(deps, sid) ? deps.store.tile(sid) : null;
	const inRange = t != null && Math.hypot(t.x - p.x, t.y - p.y) <= range;
	if (inRange) return sid;
	// Dead or out of range: auto-advance to the nearest hostile still in range.
	const next = hostilesByDistance(deps).find((h) => h.dist <= range);
	st.lockedEid = next ? next.sid : null;
	return st.lockedEid;
}

/** The aim point attacks use while locked (the locked target's tile). */
export function lockedAimPoint(
	st: TargetLockState,
	deps: TargetLockDeps,
): TileXY | null {
	if (st.lockedEid == null) return null;
	return deps.store.tile(st.lockedEid);
}

import type { EntityCat } from '../ecs/store';
import type { TileXY } from './netSync';

/** Chebyshev (king-move) distance — adjacency is `<= 1`. */
export function chebyshev(a: TileXY, b: TileXY): number {
	return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** The entity under a click, reduced to what the decision needs. */
export interface ClickHit {
	eid: number;
	cat: EntityCat;
	/** An NPC with a resolvable ref can be interacted with; without one it can
	 * only be walked toward. */
	hasRef: boolean;
}

export type ClickIntent =
	| { kind: 'pickup'; eid: number }
	| { kind: 'pickup-move'; eid: number }
	| { kind: 'interact'; eid: number }
	| { kind: 'interact-move'; eid: number }
	| { kind: 'move' };

/**
 * Decide what a click does given the entity under the cursor (or null for an
 * empty tile) and whether the player is already adjacent. Pure — the scene maps
 * the intent onto events, client actions, prediction and pending state. Items
 * and NPCs out of range resolve to a `-move` intent (walk there, act on
 * arrival); a click on another player or empty ground is a plain move.
 */
export function resolveClick(
	hit: ClickHit | null,
	inRange: boolean,
): ClickIntent {
	if (!hit) return { kind: 'move' };
	if (hit.cat === 'item') {
		return inRange
			? { kind: 'pickup', eid: hit.eid }
			: { kind: 'pickup-move', eid: hit.eid };
	}
	if (hit.cat === 'npc') {
		return inRange && hit.hasRef
			? { kind: 'interact', eid: hit.eid }
			: { kind: 'interact-move', eid: hit.eid };
	}
	return { kind: 'move' };
}

export type PendingKind = 'pickup' | 'interact';
export type PendingOutcome = PendingKind | 'wait' | 'cancel';

/**
 * Resolve a queued action once the player has (maybe) reached the target:
 * `cancel` if the target vanished, `wait` while still out of range, else fire
 * the queued kind.
 */
export function resolvePending(
	kind: PendingKind,
	me: TileXY | null,
	target: TileXY | null,
): PendingOutcome {
	if (!me || !target) return 'cancel';
	if (chebyshev(me, target) > 1) return 'wait';
	return kind;
}

export interface NpcEntry {
	eid: number;
	tile: TileXY;
}

/** Nearest NPC within melee range (`<= 1`), or null when none are adjacent. */
export function nearestAdjacentNpc(
	me: TileXY,
	npcs: NpcEntry[],
): number | null {
	let best: { eid: number; dist: number } | null = null;
	for (const n of npcs) {
		const dist = chebyshev(me, n.tile);
		if (dist <= 1 && (!best || dist < best.dist)) {
			best = { eid: n.eid, dist };
		}
	}
	return best ? best.eid : null;
}

/**
 * Nearest walkable tile beside `target`, preferring the one closest to `from`
 * (so the player stops adjacent and the queued interaction can fire). Falls back
 * to `target` when fully boxed in.
 */
export function adjacentFreeTile(
	target: TileXY,
	from: TileXY,
	isBlocked: (x: number, y: number) => boolean,
	isOccupied: (tile: TileXY) => boolean,
): TileXY {
	const deltas = [
		[0, -1],
		[0, 1],
		[-1, 0],
		[1, 0],
		[-1, -1],
		[1, -1],
		[-1, 1],
		[1, 1],
	];
	const free = deltas
		.map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }))
		.filter((c) => !isBlocked(c.x, c.y) && !isOccupied(c));
	if (free.length === 0) return target;
	free.sort(
		(a, b) =>
			chebyshev(a, from) - chebyshev(b, from) ||
			Math.abs(a.x - from.x) +
				Math.abs(a.y - from.y) -
				(Math.abs(b.x - from.x) + Math.abs(b.y - from.y)),
	);
	return free[0];
}

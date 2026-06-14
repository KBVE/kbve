import type { EntityDelta } from '@kbve/laser';
import type { EntityCat, EntityStore } from '../ecs/store';

export interface TileXY {
	x: number;
	y: number;
}

/**
 * Phaser/gridEngine effects, behind an interface so the sync dispatch is
 * headlessly testable (stub it in jsdom). `create` builds the managed refs
 * (sprite + grid character + nameplate); the rest mutate/tear them down.
 */
export interface SyncBridge<R> {
	create(e: EntityDelta, label: string | undefined): R;
	move(refs: R, tile: TileXY): void;
	setPos(refs: R, tile: TileXY): void;
	follow(refs: R): void;
	remove(refs: R): void;
}

export interface SyncResolvers {
	cat(kind: number): EntityCat;
	hostile(kind: number): boolean;
	label(e: EntityDelta, cat: EntityCat): string | undefined;
}

/** Mutable local-player + prediction state the sync reads and advances. */
export interface SyncState {
	myEid: number;
	mySlot: number;
	predicted: TileXY;
	predictSeeded: boolean;
}

/**
 * Reconcile a snapshot's entity list into the store + bridge:
 *   - spawn entities new this frame
 *   - the local player reconciles against client prediction (snap back only on
 *     drift > 2)
 *   - everyone else interpolates toward the authoritative tile
 *   - entities absent from the snapshot despawn
 * Pure dispatch — all rendering/gridEngine lives behind `bridge`. Mutates
 * `state` (seeds myEid + prediction on the local player's first appearance,
 * clears myEid on despawn) and returns the despawned server eids so the caller
 * can drop dependent state (e.g. a pending action).
 */
export function applyEntitySync<R>(
	entities: readonly EntityDelta[],
	store: EntityStore<R>,
	bridge: SyncBridge<R>,
	resolve: SyncResolvers,
	state: SyncState,
): number[] {
	const seen = new Set<number>();
	for (const e of entities) {
		seen.add(e.eid);
		const cat = resolve.cat(e.kind);
		if (!store.has(e.eid)) {
			const label = resolve.label(e, cat);
			const refs = bridge.create(e, label);
			store.spawn(
				e.eid,
				{
					tile: { x: e.tile.x, y: e.tile.y },
					kind: e.kind,
					cat,
					owner: e.owner,
					hostile: resolve.hostile(e.kind),
					hp: e.hp,
					maxHp: e.max_hp,
				},
				refs,
			);
			if (
				cat === 'player' &&
				e.owner === state.mySlot &&
				state.myEid < 0
			) {
				state.myEid = e.eid;
				bridge.follow(refs);
				state.predicted = { x: e.tile.x, y: e.tile.y };
				state.predictSeeded = true;
			}
		} else if (e.eid === state.myEid) {
			const drift = Math.max(
				Math.abs(e.tile.x - state.predicted.x),
				Math.abs(e.tile.y - state.predicted.y),
			);
			if (drift > 2) {
				state.predicted = { x: e.tile.x, y: e.tile.y };
				const refs = store.refs(e.eid);
				if (refs) bridge.setPos(refs, e.tile);
			}
			store.update(e.eid, {
				tile: { ...state.predicted },
				hp: e.hp,
				maxHp: e.max_hp,
			});
		} else {
			const cur = store.tile(e.eid);
			const refs = store.refs(e.eid);
			if (cur && refs && (cur.x !== e.tile.x || cur.y !== e.tile.y)) {
				bridge.move(refs, e.tile);
			}
			store.update(e.eid, {
				tile: { x: e.tile.x, y: e.tile.y },
				hp: e.hp,
				maxHp: e.max_hp,
			});
		}
	}

	const despawned: number[] = [];
	for (const [serverEid, , refs] of [...store.entries()]) {
		if (seen.has(serverEid)) continue;
		bridge.remove(refs);
		store.despawn(serverEid);
		despawned.push(serverEid);
		if (serverEid === state.myEid) state.myEid = -1;
	}
	return despawned;
}

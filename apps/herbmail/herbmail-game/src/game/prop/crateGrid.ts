import { Collider, Prop, query, Transform3, type World } from '@kbve/laser/ecs';
import { TILE } from '../config';

// Broadphase index of solid props: maps the world tile a Collider prop stands on
// to its entity id, so movement collision resolves the exact box (Transform3 +
// Collider) rather than special-casing prop kinds. Rebuilt from the ECS after any
// prop change (spawn, room stream, break) so it never drifts from the entities.
const byTile = new Map<number, number>();
const COLS = 1 << 16;

function key(worldCol: number, worldRow: number): number {
	return (worldCol + 0x8000) * COLS + (worldRow + 0x8000);
}

export function rebuildCrateGrid(world: World): void {
	byTile.clear();
	for (const eid of query(world, [Prop, Transform3, Collider])) {
		const wc = Math.floor(Transform3.px[eid] / TILE);
		const wr = Math.floor(Transform3.pz[eid] / TILE);
		byTile.set(key(wc, wr), eid);
	}
}

// Entity id of the solid prop on this tile, or -1 if none.
export function colliderAt(worldCol: number, worldRow: number): number {
	return byTile.get(key(worldCol, worldRow)) ?? -1;
}

export function crateAtTile(worldCol: number, worldRow: number): boolean {
	return byTile.has(key(worldCol, worldRow));
}

import { Prop, query, Transform3, type World } from '@kbve/laser/ecs';
import { TILE } from '../config';
import { PROP_CRATE } from './kinds';

// Which world tiles a live crate occupies, so movement collision can treat an
// intact crate as solid. Rebuilt from the ECS after any prop change (spawn, room
// stream, break) rather than mutated in step with each op — one query keeps the
// grid from ever drifting out of sync with the entities that own the crates.
const occupied = new Set<number>();
const COLS = 1 << 16;

function key(worldCol: number, worldRow: number): number {
	return (worldCol + 0x8000) * COLS + (worldRow + 0x8000);
}

export function rebuildCrateGrid(world: World): void {
	occupied.clear();
	for (const eid of query(world, [Prop, Transform3])) {
		if (Prop.kind[eid] !== PROP_CRATE) continue;
		const wc = Math.floor(Transform3.px[eid] / TILE);
		const wr = Math.floor(Transform3.pz[eid] / TILE);
		occupied.add(key(wc, wr));
	}
}

export function crateAtTile(worldCol: number, worldRow: number): boolean {
	return occupied.has(key(worldCol, worldRow));
}

import { Collider, Prop, query, Transform3, type World } from '../mecs/props';
import { TILE } from '../config';

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

export function colliderAt(worldCol: number, worldRow: number): number {
	return byTile.get(key(worldCol, worldRow)) ?? -1;
}

export function crateAtTile(worldCol: number, worldRow: number): boolean {
	return byTile.has(key(worldCol, worldRow));
}

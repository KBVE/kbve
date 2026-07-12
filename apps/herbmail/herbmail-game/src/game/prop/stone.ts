import {
	addComponent,
	applyStats,
	Collider,
	MeshRef,
	Stone,
	type World,
} from '../mecs/props';
import { TILE } from '../config';
import { hashInt } from '../geometry/rng';
import { MODEL_STONE, PROP_STONE } from './kinds';
import { spawnPropBase } from './base';

// Hits to break a stone, staged like a crate.
export const STONE_MAX_HP = 3;

// Default base radius (m); tune later.
export const STONE_SIZE = 0.55;

// Stable per-tile id so a mined stone's suppression + shape stays deterministic
// across room streaming.
export function stoneId(worldCol: number, worldRow: number): number {
	return hashInt(worldCol, worldRow, 0x570e) >>> 0;
}

// World tile (col,row) -> centred stone mount transform, base resting on floor.
export function stoneTransform(
	worldCol: number,
	worldRow: number,
): [number, number, number] {
	return [(worldCol + 0.5) * TILE, 0, (worldRow + 0.5) * TILE];
}

export function spawnStone(
	world: World,
	ownerEid: number,
	pos: [number, number, number],
	seed: number,
	size: number,
): number {
	const eid = spawnPropBase(world, PROP_STONE, ownerEid, pos, [0, 1, 0]);

	MeshRef.modelId[eid] = MODEL_STONE;
	Collider.hx[eid] = size;
	Collider.hz[eid] = size;
	Stone.seed[eid] = seed;
	Stone.size[eid] = size;
	Stone.hardness[eid] = 1;
	Stone.ore[eid] = 0;
	applyStats(world, eid, { maxHp: STONE_MAX_HP });

	addComponent(world, eid, MeshRef);
	addComponent(world, eid, Stone);
	addComponent(world, eid, Collider);
	return eid;
}

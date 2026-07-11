import {
	addComponent,
	addEntity,
	applyStats,
	Collider,
	MeshRef,
	Prop,
	Stone,
	Transform3,
	type World,
} from '@kbve/laser/ecs';
import { TILE } from '../config';
import { hashInt } from '../geometry/rng';
import { MODEL_STONE, PROP_STONE } from './kinds';

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
	const eid = addEntity(world);
	addComponent(world, eid, Prop);
	addComponent(world, eid, Transform3);
	addComponent(world, eid, MeshRef);
	addComponent(world, eid, Collider);
	addComponent(world, eid, Stone);
	applyStats(world, eid, { maxHp: STONE_MAX_HP });

	Prop.kind[eid] = PROP_STONE;
	Prop.ownerEid[eid] = ownerEid;

	Transform3.px[eid] = pos[0];
	Transform3.py[eid] = pos[1];
	Transform3.pz[eid] = pos[2];
	Transform3.dx[eid] = 0;
	Transform3.dy[eid] = 1;
	Transform3.dz[eid] = 0;

	MeshRef.modelId[eid] = MODEL_STONE;

	Collider.hx[eid] = size;
	Collider.hz[eid] = size;

	Stone.seed[eid] = seed;
	Stone.size[eid] = size;
	Stone.hardness[eid] = 1;
	Stone.ore[eid] = 0;

	return eid;
}

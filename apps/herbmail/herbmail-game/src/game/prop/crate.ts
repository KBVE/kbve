import {
	addComponent,
	applyStats,
	Collider,
	MeshRef,
	type World,
} from '../mecs/props';
import { TILE } from '../config';
import { hashInt } from '../geometry/rng';
import { MODEL_CRATE, PROP_CRATE } from './kinds';
import { spawnPropBase } from './base';

// Crate origin sits at its geometry centre (BOUNDS on export); the model is 1.2m
// tall, so lifting the mount half that height rests it on the floor (y = 0).
export const CRATE_HALF = 0.6;

// Hits to break a crate. Damage stages the crack decal: hp 3 clean, 2 cracked,
// 1 badly cracked, 0 shattered.
export const MAX_CRATE_HP = 3;

// hp -> crack decal stage (0 none, 1 light, 2 heavy). Clamped for safety.
export function crackStage(hp: number): number {
	if (hp >= MAX_CRATE_HP) return 0;
	if (hp <= 1) return 2;
	return 1;
}

// Stable per-tile id so a broken crate's suppression + any future flavour stays
// deterministic across room streaming.
export function crateId(worldCol: number, worldRow: number): number {
	return hashInt(worldCol, worldRow, 0x0c7a7e) >>> 0;
}

// World tile (col,row) -> centred crate mount transform, standing on the floor.
export function crateTransform(
	worldCol: number,
	worldRow: number,
): [number, number, number] {
	return [(worldCol + 0.5) * TILE, CRATE_HALF, (worldRow + 0.5) * TILE];
}

export function spawnCrate(
	world: World,
	ownerEid: number,
	pos: [number, number, number],
): number {
	const eid = spawnPropBase(world, PROP_CRATE, ownerEid, pos, [0, 1, 0]);

	Collider.hx[eid] = CRATE_HALF;
	Collider.hz[eid] = CRATE_HALF;
	MeshRef.modelId[eid] = MODEL_CRATE;
	applyStats(world, eid, { maxHp: MAX_CRATE_HP });

	addComponent(world, eid, MeshRef);
	addComponent(world, eid, Collider);
	return eid;
}

import {
	addComponent,
	addEntity,
	applyStats,
	MeshRef,
	Prop,
	Transform3,
	type World,
} from '@kbve/laser/ecs';
import { TILE } from '../config';
import { hashInt } from '../geometry/rng';
import { MODEL_CRATE, PROP_CRATE } from './kinds';

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
	const eid = addEntity(world);
	addComponent(world, eid, Prop);
	addComponent(world, eid, Transform3);
	addComponent(world, eid, MeshRef);
	applyStats(world, eid, { maxHp: MAX_CRATE_HP });

	Prop.kind[eid] = PROP_CRATE;
	Prop.ownerEid[eid] = ownerEid;

	Transform3.px[eid] = pos[0];
	Transform3.py[eid] = pos[1];
	Transform3.pz[eid] = pos[2];
	Transform3.dx[eid] = 0;
	Transform3.dy[eid] = 1;
	Transform3.dz[eid] = 0;

	MeshRef.modelId[eid] = MODEL_CRATE;

	return eid;
}

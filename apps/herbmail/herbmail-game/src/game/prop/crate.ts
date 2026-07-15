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

export const CRATE_HALF = 0.6;

export const MAX_CRATE_HP = 3;

export function crackStage(hp: number): number {
	if (hp >= MAX_CRATE_HP) return 0;
	if (hp <= 1) return 2;
	return 1;
}

export function crateId(worldCol: number, worldRow: number): number {
	return hashInt(worldCol, worldRow, 0x0c7a7e) >>> 0;
}

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

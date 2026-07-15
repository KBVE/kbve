import {
	addComponent,
	applyStats,
	Collider,
	MeshRef,
	Stone,
	type World,
} from '../mecs/props';
import { TILE } from '../config';
import { hash01, hashInt } from '../geometry/rng';
import { MODEL_STONE, PROP_STONE } from './kinds';
import { spawnPropBase } from './base';

export const STONE_MAX_HP = 3;

export const STONE_SIZE = 0.55;

export function stoneId(worldCol: number, worldRow: number): number {
	return hashInt(worldCol, worldRow, 0x570e) >>> 0;
}

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
	Stone.ore[eid] = hash01(seed, 0xa1e, 0x5f) < 0.28 ? 1 : 0;
	applyStats(world, eid, { maxHp: STONE_MAX_HP });

	addComponent(world, eid, MeshRef);
	addComponent(world, eid, Stone);
	addComponent(world, eid, Collider);
	return eid;
}

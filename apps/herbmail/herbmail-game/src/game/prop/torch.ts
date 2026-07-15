import { addComponent, LightEmitter, MeshRef, type World } from '../mecs/props';
import { TILE } from '../config';
import { FlameFx } from './components';
import { MODEL_TORCH, PROP_TORCH } from './kinds';
import { spawnPropBase } from './base';
import { applyLight, LIGHT_PRESETS } from './lights';

const MOUNT_H = 2.6;
const PITCH = 0.85;
export const MOUNT_OFF = 0.08;
const OFF = MOUNT_OFF;

const DIRS: [number, number][] = [
	[0, -1],
	[0, 1],
	[-1, 0],
	[1, 0],
];

export function headDir(nx: number, nz: number): [number, number, number] {
	const c = Math.cos(PITCH);
	return [nx * c, Math.sin(PITCH), nz * c];
}

export function torchTransform(
	worldCol: number,
	worldRow: number,
	di: number,
): { pos: [number, number, number]; dir: [number, number, number] } {
	const [nx, nz] = DIRS[di];
	const fx = (worldCol + 0.5) * TILE + nx * (TILE / 2 - OFF);
	const fz = (worldRow + 0.5) * TILE + nz * (TILE / 2 - OFF);

	return { pos: [fx, MOUNT_H, fz], dir: headDir(-nx, -nz) };
}

export function nicheTransform(
	worldCol: number,
	worldRow: number,
	di: number,
	y: number,
): { pos: [number, number, number]; dir: [number, number, number] } {
	const [nx, nz] = DIRS[di];
	const fx = (worldCol + 0.5) * TILE + nx * (TILE / 2 - OFF);
	const fz = (worldRow + 0.5) * TILE + nz * (TILE / 2 - OFF);
	return { pos: [fx, y, fz], dir: [-nx, 0, -nz] };
}

export function torchId(
	worldCol: number,
	worldRow: number,
	di: number,
): number {
	return (
		(Math.imul(worldCol, 73856093) ^
			Math.imul(worldRow, 19349663) ^
			Math.imul(di + 1, 2654435761)) >>>
		0
	);
}

export function spawnTorch(
	world: World,
	ownerEid: number,
	pos: [number, number, number],
	dir: [number, number, number],
	id: number,
): number {
	const eid = spawnPropBase(world, PROP_TORCH, ownerEid, pos, dir);

	applyLight(eid, LIGHT_PRESETS.torch, id);
	FlameFx.seed[eid] = (id % 97) * 1.7;
	MeshRef.modelId[eid] = MODEL_TORCH;

	addComponent(world, eid, LightEmitter);
	addComponent(world, eid, FlameFx);
	addComponent(world, eid, MeshRef);
	return eid;
}

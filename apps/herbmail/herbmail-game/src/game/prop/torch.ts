import {
	addComponent,
	addEntity,
	LightEmitter,
	MeshRef,
	Prop,
	Transform3,
	type World,
} from '@kbve/laser/ecs';
import { TILE } from '../config';
import { FlameFx } from './components';
import { MODEL_TORCH, PROP_TORCH } from './kinds';

const MOUNT_H = 2.6;
const PITCH = 0.85;
const OFF = 0.08;

const FLAME_R = 1.0;
const FLAME_G = 0.42;
const FLAME_B = 0.13;
const BASE_INTENSITY = 2.25;
const FLICKER_AMP = 1.0;
const LIGHT_RANGE = 15;

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

// World tile (col,row) + wall-direction index -> mounted torch transform.
export function torchTransform(
	worldCol: number,
	worldRow: number,
	di: number,
): { pos: [number, number, number]; dir: [number, number, number] } {
	const [nx, nz] = DIRS[di];
	const fx = (worldCol + 0.5) * TILE + nx * (TILE / 2 - OFF);
	const fz = (worldRow + 0.5) * TILE + nz * (TILE / 2 - OFF);
	// Mount sits against the wall (nx,nz points floor->wall); the head faces the
	// opposite way, out into the room, so mesh/flame/light extend inward.
	return { pos: [fx, MOUNT_H, fz], dir: headDir(-nx, -nz) };
}

// Stable per-tile id so flame seed + light flicker phase are deterministic.
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
	const eid = addEntity(world);
	addComponent(world, eid, Prop);
	addComponent(world, eid, Transform3);
	addComponent(world, eid, LightEmitter);
	addComponent(world, eid, FlameFx);
	addComponent(world, eid, MeshRef);

	Prop.kind[eid] = PROP_TORCH;
	Prop.ownerEid[eid] = ownerEid;

	Transform3.px[eid] = pos[0];
	Transform3.py[eid] = pos[1];
	Transform3.pz[eid] = pos[2];
	Transform3.dx[eid] = dir[0];
	Transform3.dy[eid] = dir[1];
	Transform3.dz[eid] = dir[2];

	LightEmitter.r[eid] = FLAME_R;
	LightEmitter.g[eid] = FLAME_G;
	LightEmitter.b[eid] = FLAME_B;
	LightEmitter.baseIntensity[eid] = BASE_INTENSITY;
	LightEmitter.range[eid] = LIGHT_RANGE;
	LightEmitter.flickerPhase[eid] = (id * 12.9898) % (Math.PI * 2);
	LightEmitter.flickerAmp[eid] = FLICKER_AMP;

	FlameFx.seed[eid] = (id % 97) * 1.7;
	MeshRef.modelId[eid] = MODEL_TORCH;

	return eid;
}

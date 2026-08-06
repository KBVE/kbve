import { makeLocalGrid, type RoomDesc } from '../dungeon/generate';
import { exposedFaces, isBay } from '../geometry/faces';
import { columnShaftRadius } from '../geometry';
import { hash01 } from '../geometry/rng';
import { TILE } from '../config';
import { headDir, nicheTransform, torchId, torchTransform } from './torch';
import { LIGHT_PRESETS, type LightPreset } from './lights';

export const NICHE_Y = 1.3;
export const COL_TORCH_H = 2.6;
export const COL_TORCH_DIRS: [number, number][] = [
	[0, -1],
	[0, 1],
	[-1, 0],
	[1, 0],
];

export interface StaticEmitter {
	kind: 'torch' | 'candle';
	pos: [number, number, number];
	dir: [number, number, number];
	id: number;
	preset: LightPreset;
}

// Single source of truth for the dungeon's non-moving light sources: the ECS
// spawner mounts them, the vertex bake integrates them. Positions are sector
// local (add originCol/originRow * TILE for world); the deterministic hashes
// still use world cell coords so layout matches the generator.
export function staticEmitters(desc: RoomDesc): StaticEmitter[] {
	const out: StaticEmitter[] = [];
	const ox = desc.originCol;
	const oz = desc.originRow;

	for (const s of desc.torches) {
		const { pos, dir } = torchTransform(s.col, s.row, s.di);
		out.push({
			kind: 'torch',
			pos,
			dir,
			id: torchId(ox + s.col, oz + s.row, s.di),
			preset: LIGHT_PRESETS.torch,
		});
	}

	for (const c of desc.columns) {
		if (!c.torch) continue;
		const wc = ox + c.col;
		const wr = oz + c.row;
		const di = Math.floor(hash01(wc, wr, 71) * 4) % 4;
		const [nx, nz] = COL_TORCH_DIRS[di];
		const r = columnShaftRadius(c.style) + 0.05;
		out.push({
			kind: 'torch',
			pos: [
				(c.col + 0.5) * TILE + nx * r,
				COL_TORCH_H,
				(c.row + 0.5) * TILE + nz * r,
			],
			dir: headDir(nx, nz),
			id: torchId(wc, wr, di + 40),
			preset: LIGHT_PRESETS.torch,
		});
	}

	const local = makeLocalGrid(desc);
	for (const f of exposedFaces(local)) {
		if (!isBay(local, f, desc.variant)) continue;
		const { pos, dir } = nicheTransform(f.col, f.row, f.di, NICHE_Y);
		out.push({
			kind: 'candle',
			pos,
			dir,
			id: torchId(ox + f.col, oz + f.row, f.di),
			preset: LIGHT_PRESETS.candle,
		});
	}

	return out;
}

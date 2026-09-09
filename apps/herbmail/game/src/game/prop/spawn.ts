import { despawnWhere, LightEmitter, Prop } from '../mecs/props';
import { staticEmitters } from './staticEmitters';
import type { DungeonWorld } from '../dungeon/ecs';
import { makeLocalGrid } from '../dungeon/generate';
import { exposedFaces, isBay } from '../geometry/faces';
import {
	spawnTorch,
	torchId,
	torchTransform,
	nicheTransform,
	headDir,
} from './torch';
import { spawnLight, LIGHT_PRESETS } from './lights';
import { spawnFirefly } from './firefly';
import { spawnCrate } from './crate';
import { scatterDecor } from './decor';
import { PROP_CANDLE, PROP_CRATE } from './kinds';
import { placedForSector, isSuppressed } from './placed';
import { TILE } from '../config';
import { FLOOR } from '../geometry/grid';
import { columnShaftRadius } from '../geometry';
import { hash01 } from '../geometry/rng';
import type { RoomDesc } from '../dungeon/generate';

const NICHE_Y = 1.3;
const COL_TORCH_H = 2.6;
const COL_TORCH_DIRS: [number, number][] = [
	[0, -1],
	[0, 1],
	[-1, 0],
	[1, 0],
];

const FIREFLY_MIN = 2;
const FIREFLY_MAX = 4;
const FIREFLY_Y = 1.4;
const FIREFLY_Y_VAR = 0.9;

function scatterFireflies(
	world: DungeonWorld['world'],
	roomEid: number,
	desc: RoomDesc,
): void {
	const floors: number[] = [];
	for (let row = 1; row < desc.rows - 1; row++) {
		for (let col = 1; col < desc.cols - 1; col++) {
			if (desc.tiles[row * desc.cols + col] === FLOOR)
				floors.push(row * desc.cols + col);
		}
	}
	if (floors.length === 0) return;

	const roll = hash01(desc.cx, desc.cy, 0x1f1e33);
	const count =
		FIREFLY_MIN + Math.floor(roll * (FIREFLY_MAX - FIREFLY_MIN + 1));

	for (let i = 0; i < count; i++) {
		const pick = Math.floor(
			hash01(desc.cx, desc.cy, 0x51ed + i * 977) * floors.length,
		);
		const cell = floors[pick];
		const col = cell % desc.cols;
		const row = (cell - col) / desc.cols;
		const jx = hash01(col, row, 0x11 + i) - 0.5;
		const jz = hash01(col, row, 0x22 + i) - 0.5;
		const x = (desc.originCol + col + 0.5 + jx * 0.6) * TILE;
		const z = (desc.originRow + row + 0.5 + jz * 0.6) * TILE;
		const y = FIREFLY_Y + hash01(col, row, 0x33 + i) * FIREFLY_Y_VAR;
		const seed =
			hash01(desc.originCol + col, desc.originRow + row, i) * 6.283;
		spawnFirefly(world, roomEid, [x, y, z], seed);
	}
}

export function spawnRoomProps(dw: DungeonWorld, roomEid: number): void {
	const desc = dw.desc(roomEid);
	if (!desc) return;
	const world = dw.world;

	// Same list the vertex bake integrates (staticEmitters), so a torch can
	// never be lit one way and baked another.
	const ox = desc.originCol * TILE;
	const oz = desc.originRow * TILE;
	for (const e of staticEmitters(desc)) {
		const pos: [number, number, number] = [
			e.pos[0] + ox,
			e.pos[1],
			e.pos[2] + oz,
		];
		if (isSuppressed(pos)) continue;
		const eid =
			e.kind === 'torch'
				? spawnTorch(world, roomEid, pos, e.dir, e.id)
				: spawnLight(
						world,
						roomEid,
						PROP_CANDLE,
						pos,
						e.dir,
						e.preset,
						e.id,
					);
		LightEmitter.baked[eid] = 1;
	}

	scatterFireflies(world, roomEid, desc);
	scatterDecor(dw.world, roomEid, desc);

	const { cx: sx, cy: sy } = dw.cellOf(roomEid);
	for (const rec of placedForSector(sx, sy)) {
		if (isSuppressed(rec.pos)) continue;
		if (rec.kind === PROP_CRATE) spawnCrate(world, roomEid, rec.pos);
		else spawnTorch(world, roomEid, rec.pos, rec.dir, rec.id);
	}
}

export function despawnRoomProps(dw: DungeonWorld, roomEid: number): void {
	despawnWhere(dw.world, Prop, 'ownerEid', roomEid);
}

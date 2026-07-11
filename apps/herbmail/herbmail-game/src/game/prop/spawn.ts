import { despawnWhere, Prop } from '@kbve/laser/ecs';
import type { DungeonWorld } from '../dungeon/ecs';
import { makeLocalGrid } from '../dungeon/generate';
import { exposedFaces, isBay } from '../geometry/faces';
import { spawnTorch, torchId, torchTransform, nicheTransform } from './torch';
import { spawnLight, LIGHT_PRESETS } from './lights';
import { spawnFirefly } from './firefly';
import { PROP_CANDLE } from './kinds';
import { placedForCell, isSuppressed } from './placed';
import { TILE } from '../config';
import { FLOOR } from '../geometry/grid';
import { hash01 } from '../geometry/rng';
import type { RoomDesc } from '../dungeon/generate';

const NICHE_Y = 1.3;

const FIREFLY_MIN = 2;
const FIREFLY_MAX = 4;
const FIREFLY_Y = 1.4;
const FIREFLY_Y_VAR = 0.9;

// Scatter a few lone fireflies on interior floor tiles, deterministically by the
// room cell so they stream in identically each visit. Each gets its own drift home.
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

// Room mounted -> spawn its deterministic decor props plus any player-placed
// props recorded for its cell.
export function spawnRoomProps(dw: DungeonWorld, roomEid: number): void {
	const desc = dw.desc(roomEid);
	if (!desc) return;
	const world = dw.world;

	for (const s of desc.torches) {
		const wc = desc.originCol + s.col;
		const wr = desc.originRow + s.row;
		const { pos, dir } = torchTransform(wc, wr, s.di);
		if (isSuppressed(pos)) continue;
		spawnTorch(world, roomEid, pos, dir, torchId(wc, wr, s.di));
	}

	// A candle light inside every wall niche, so recesses are lit by their own
	// source. Niches are the isBay faces on the local grid (matches the geometry).
	const local = makeLocalGrid(desc);
	for (const f of exposedFaces(local)) {
		if (!isBay(local, f, desc.variant)) continue;
		const wc = desc.originCol + f.col;
		const wr = desc.originRow + f.row;
		const { pos, dir } = nicheTransform(wc, wr, f.di, NICHE_Y);
		spawnLight(
			world,
			roomEid,
			PROP_CANDLE,
			pos,
			dir,
			LIGHT_PRESETS.candle,
			torchId(wc, wr, f.di),
		);
	}

	scatterFireflies(world, roomEid, desc);

	const { cx, cy } = dw.cellOf(roomEid);
	for (const rec of placedForCell(cx, cy)) {
		if (isSuppressed(rec.pos)) continue;
		spawnTorch(world, roomEid, rec.pos, rec.dir, rec.id);
	}
}

// Room unmounted -> remove every prop it owns.
export function despawnRoomProps(dw: DungeonWorld, roomEid: number): void {
	despawnWhere(dw.world, Prop, 'ownerEid', roomEid);
}

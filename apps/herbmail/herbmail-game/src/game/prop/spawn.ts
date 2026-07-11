import { despawnWhere, Prop } from '@kbve/laser/ecs';
import type { DungeonWorld } from '../dungeon/ecs';
import { spawnTorch, torchId, torchTransform } from './torch';
import { placedForCell, isSuppressed } from './placed';

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

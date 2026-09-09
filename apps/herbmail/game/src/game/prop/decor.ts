import type { DungeonWorld } from '../dungeon/ecs';
import type { RoomDesc } from '../dungeon/generate';
import { spawnCrate, crateTransform } from './crate';
import { spawnStone, stoneTransform, stoneId, STONE_SIZE } from './stone';
import { isSuppressed } from './placed';
import { PROP_CRATE, PROP_STONE } from './kinds';
import { hash01 } from '../geometry/rng';
import { FLOOR, isSolidTile } from '../geometry/grid';

export interface ScatterRule {
	kind: number;
	min: number;
	max: number;
	salt: number;
}

const DECOR_POLICY: ScatterRule[][] = [
	[
		{ kind: PROP_CRATE, min: 0, max: 2, salt: 0x0c7a7e },
		{ kind: PROP_STONE, min: 0, max: 3, salt: 0x570e },
	],
	[
		{ kind: PROP_CRATE, min: 0, max: 2, salt: 0x0c7a7e },
		{ kind: PROP_STONE, min: 1, max: 3, salt: 0x570e },
	],
	[
		{ kind: PROP_CRATE, min: 0, max: 1, salt: 0x0c7a7e },
		{ kind: PROP_STONE, min: 2, max: 5, salt: 0x570e },
	],
	[
		{ kind: PROP_CRATE, min: 0, max: 2, salt: 0x0c7a7e },
		{ kind: PROP_STONE, min: 0, max: 2, salt: 0x570e },
	],
	[
		{ kind: PROP_CRATE, min: 1, max: 3, salt: 0x0c7a7e },
		{ kind: PROP_STONE, min: 0, max: 1, salt: 0x570e },
	],
	[
		{ kind: PROP_CRATE, min: 0, max: 2, salt: 0x0c7a7e },
		{ kind: PROP_STONE, min: 0, max: 3, salt: 0x570e },
	],
];

const CORNER_STONE_SALT = 0xc03e;

function scatterCornerStones(
	world: DungeonWorld['world'],
	roomEid: number,
	desc: RoomDesc,
	occupied: Set<number>,
): void {
	const solidAt = (row: number, col: number): boolean =>
		isSolidTile(desc.tiles[row * desc.cols + col] ?? 0);
	for (let row = 1; row < desc.rows - 1; row++) {
		for (let col = 1; col < desc.cols - 1; col++) {
			if (desc.tiles[row * desc.cols + col] !== FLOOR) continue;
			const vert = solidAt(row - 1, col) || solidAt(row + 1, col);
			const horiz = solidAt(row, col - 1) || solidAt(row, col + 1);
			if (!(vert && horiz)) continue;
			if (
				hash01(
					desc.cx * 131 + col,
					desc.cy * 131 + row,
					CORNER_STONE_SALT,
				) > 0.6
			)
				continue;
			const wc = desc.originCol + col;
			const wr = desc.originRow + row;
			const pos = stoneTransform(wc, wr);
			if (isSuppressed(pos)) continue;
			spawnStone(world, roomEid, pos, stoneId(wc, wr), STONE_SIZE);
			occupied.add(row * desc.cols + col);
		}
	}
}

export function scatterDecor(
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

	const occupied = new Set<number>();
	scatterCornerStones(world, roomEid, desc, occupied);

	const policy = DECOR_POLICY[desc.variant % DECOR_POLICY.length];
	for (const rule of policy) {
		const count =
			rule.min +
			Math.floor(
				hash01(desc.cx, desc.cy, rule.salt) * (rule.max - rule.min + 1),
			);
		for (let i = 0; i < count; i++) {
			const pick = Math.floor(
				hash01(desc.cx, desc.cy, rule.salt + i * 601) * floors.length,
			);
			const cell = floors[pick];
			if (occupied.has(cell)) continue;
			occupied.add(cell);
			const col = cell % desc.cols;
			const row = (cell - col) / desc.cols;
			const wc = desc.originCol + col;
			const wr = desc.originRow + row;
			if (rule.kind === PROP_CRATE) {
				const pos = crateTransform(wc, wr);
				if (isSuppressed(pos)) continue;
				spawnCrate(world, roomEid, pos);
			} else if (rule.kind === PROP_STONE) {
				const pos = stoneTransform(wc, wr);
				if (isSuppressed(pos)) continue;
				spawnStone(world, roomEid, pos, stoneId(wc, wr), STONE_SIZE);
			}
		}
	}
}

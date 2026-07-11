import { TILE } from '../config';
import { WALL, COLUMN } from '../geometry/grid';
import { cellAtWorld } from './ecs';
import { CELL } from './generate';
import { genSector } from './sector';
import { getDungeon, DUNGEON_SEED } from './store';
import { crateAtTile } from '../prop/crateGrid';

const COLUMN_R = 0.55;

export function solidAtWorld(x: number, z: number): boolean {
	const dw = getDungeon();
	const { cx, cy } = cellAtWorld(x, z, TILE);
	const eid = dw.ensureSectorAtCell(cx, cy);
	const desc = dw.desc(eid);
	if (!desc) return true;

	const wc = Math.floor(x / TILE);
	const wr = Math.floor(z / TILE);
	const lc = wc - desc.originCol;
	const lr = wr - desc.originRow;
	if (lc < 0 || lc >= desc.cols || lr < 0 || lr >= desc.rows) return true;

	const t = desc.tiles[lr * desc.cols + lc];
	if (t === WALL) return true;
	if (t === COLUMN) {
		const ccx = (wc + 0.5) * TILE;
		const ccz = (wr + 0.5) * TILE;
		const ex = x - ccx;
		const ez = z - ccz;
		return ex * ex + ez * ez < COLUMN_R * COLUMN_R;
	}
	return crateAtTile(wc, wr);
}

export function dungeonSpawn(): [number, number, number] {
	const s = genSector(DUNGEON_SEED, 0, 0);
	const r = s.rooms[s.entrance];
	const wx = (r.col0 + r.w / 2) * CELL * TILE;
	const wz = (r.row0 + r.h / 2) * CELL * TILE;
	return [wx, TILE / 2, wz];
}

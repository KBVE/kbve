import { TILE } from '../config';
import { SOLID, PILLAR } from '../geometry/grid';
import { cellAtWorld } from './ecs';
import { CELL } from './generate';
import { genSector } from './sector';
import { getDungeon, DUNGEON_SEED } from './store';
import { Collider, Transform3 } from '../mecs/props';
import { colliderAt } from '../prop/crateGrid';

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
	// Sub-tile solids (pillars) block only within their radius; full-tile solids
	// (walls) block the whole cell.
	if (t & PILLAR) {
		const ccx = (wc + 0.5) * TILE;
		const ccz = (wr + 0.5) * TILE;
		const ex = x - ccx;
		const ez = z - ccz;
		return ex * ex + ez * ez < COLUMN_R * COLUMN_R;
	}
	if (t & SOLID) return true;
	// Solid props block only their own AABB footprint about the entity centre,
	// not the whole 3m cell — the player can hug their edges.
	const propEid = colliderAt(wc, wr);
	if (propEid >= 0) {
		return (
			Math.abs(x - Transform3.px[propEid]) < Collider.hx[propEid] &&
			Math.abs(z - Transform3.pz[propEid]) < Collider.hz[propEid]
		);
	}
	return false;
}

export function dungeonSpawn(): [number, number, number] {
	const s = genSector(DUNGEON_SEED, 0, 0);
	const r = s.rooms[s.entrance];
	const wx = (r.col0 + r.w / 2) * CELL * TILE;
	const wz = (r.row0 + r.h / 2) * CELL * TILE;
	return [wx, TILE / 2, wz];
}

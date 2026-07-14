import { TILE } from '../config';
import { SOLID, PILLAR, DOORWAY } from '../geometry/grid';
import { doorClosedAt } from '../door/doors';
import { cellAtWorld } from './ecs';
import { CELL, type RoomDesc } from './generate';
import { genSector } from './sector';
import { getDungeon, DUNGEON_SEED } from './store';
import { Collider, Transform3 } from '../mecs/props';
import { colliderAt } from '../prop/crateGrid';

const COLUMN_R = 0.55;

// Last resolved sector, cached so the movement hot path (up to 128 solidAtWorld
// calls per fast-move frame) skips cellAtWorld's object + the sector-map string key
// while the player stays inside one sector. Cleared when the dungeon is reseeded.
let cDesc: RoomDesc | null = null;
let cOC = 0;
let cOR = 0;
let cCols = 0;
let cRows = 0;

export function invalidateSolidCache(): void {
	cDesc = null;
}

export function solidAtWorld(x: number, z: number): boolean {
	const wc = Math.floor(x / TILE);
	const wr = Math.floor(z / TILE);
	let lc = wc - cOC;
	let lr = wr - cOR;
	let desc = cDesc;
	if (!desc || lc < 0 || lc >= cCols || lr < 0 || lr >= cRows) {
		const dw = getDungeon();
		const { cx, cy } = cellAtWorld(x, z, TILE);
		desc = dw.desc(dw.ensureSectorAtCell(cx, cy)) ?? null;
		if (!desc) return true;
		cDesc = desc;
		cOC = desc.originCol;
		cOR = desc.originRow;
		cCols = desc.cols;
		cRows = desc.rows;
		lc = wc - cOC;
		lr = wr - cOR;
	}
	if (lc < 0 || lc >= desc.cols || lr < 0 || lr >= desc.rows) return true;

	const t = desc.tiles[lr * desc.cols + lc];
	// A doorway gap blocks only while its door is spawned + locked; otherwise it's an
	// open arch. (Connector gates carry no door → always passable.)
	if (t & DOORWAY) return doorClosedAt(wc, wr);
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

let spawnCache: [number, number, number] | null = null;

// Entrance-room centre. Memoized — genSector is a full BSP+corridor+lock build, and
// this is read from component bodies (ThirdPersonPlayer, PhysicsBodies) on any render.
export function dungeonSpawn(): [number, number, number] {
	if (spawnCache) return spawnCache;
	const s = genSector(DUNGEON_SEED, 0, 0);
	const r = s.rooms[s.entrance];
	const wx = (r.col0 + r.w / 2) * CELL * TILE;
	const wz = (r.row0 + r.h / 2) * CELL * TILE;
	spawnCache = [wx, TILE / 2, wz];
	return spawnCache;
}

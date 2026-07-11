import { TILE } from '../config';
import { ARCH, WALL } from '../geometry/grid';
import { jitter } from '../geometry/rng';
import { ARCH_SALT } from '../geometry/arches';
import { cellAtWorld } from './ecs';
import { CELL } from './generate';
import { getDungeon } from './store';
import { doorAtLocal, isDoorLocked } from '../door/doors';

const HALF = TILE / 2;

export function solidAtWorld(x: number, z: number): boolean {
	const dw = getDungeon();
	const { cx, cy } = cellAtWorld(x, z, TILE);
	const eid = dw.ensureRoom(cx, cy);
	const desc = dw.desc(eid);
	if (!desc) return true;

	const wc = Math.floor(x / TILE);
	const wr = Math.floor(z / TILE);
	const lc = wc - desc.originCol;
	const lr = wr - desc.originRow;
	if (lc < 0 || lc >= CELL || lr < 0 || lr >= CELL) return true;

	const t = desc.tiles[lr * CELL + lc];
	if (t === WALL) return true;
	if (t === ARCH) {
		// A closed door seals the whole opening; open (or no) door falls through
		// to the arch-width check below.
		const door = doorAtLocal(desc, lc, lr);
		if (door && isDoorLocked(door.key)) return true;
		// Mirror the arch geometry's opening: local tile coords + variant salt.
		const openHW = jitter(
			lc,
			lr,
			1 + desc.variant * ARCH_SALT,
			TILE * 0.28,
			TILE * 0.38,
		);
		const nsEdge = lr === 0 || lr === CELL - 1;
		const off = nsEdge ? x - (wc * TILE + HALF) : z - (wr * TILE + HALF);
		return Math.abs(off) > openHW;
	}
	return false;
}

// Center of the origin room (cell 0,0).
export function dungeonSpawn(): [number, number, number] {
	const c = (CELL * TILE) / 2;
	return [c, TILE / 2, c];
}

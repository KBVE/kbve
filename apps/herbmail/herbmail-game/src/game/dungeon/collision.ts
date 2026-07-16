import { TILE } from '../config';
import { SOLID, PILLAR, DOORWAY, OCCLUDES, PIT } from '../geometry/grid';
import { OASIS_DEPTH } from '../water/constants';
import { ARCH_SALT } from '../geometry/arches';
import { jitter } from '../geometry/rng';
import { doorClosedAt } from '../door/doors';
import { cellAtWorld } from './ecs';
import { CELL, type RoomDesc } from './generate';
import { genSector } from './sector';
import { getDungeon, DUNGEON_SEED } from './store';
import { Collider, Transform3 } from '../mecs/props';
import { colliderAt } from '../prop/crateGrid';

const COLUMN_R = 0.55;

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

	if (t & DOORWAY) {
		if (doorClosedAt(wc, wr)) return true;
		const wallish = (c: number, r: number): boolean => {
			if (c < 0 || c >= desc.cols || r < 0 || r >= desc.rows) return true;
			const n = desc.tiles[r * desc.cols + c];
			return (n & (OCCLUDES | DOORWAY)) !== 0;
		};
		const ns = wallish(lc, lr - 1) && wallish(lc, lr + 1);
		const openHW = jitter(
			lc,
			lr,
			1 + desc.variant * ARCH_SALT,
			TILE * 0.28,
			TILE * 0.38,
		);
		const lat = ns ? z - (wr + 0.5) * TILE : x - (wc + 0.5) * TILE;
		return Math.abs(lat) > openHW;
	}

	if (t & PILLAR) {
		const ccx = (wc + 0.5) * TILE;
		const ccz = (wr + 0.5) * TILE;
		const ex = x - ccx;
		const ez = z - ccz;
		return ex * ex + ez * ez < COLUMN_R * COLUMN_R;
	}
	if (t & SOLID) return true;

	const propEid = colliderAt(wc, wr);
	if (propEid >= 0) {
		return (
			Math.abs(x - Transform3.px[propEid]) < Collider.hx[propEid] &&
			Math.abs(z - Transform3.pz[propEid]) < Collider.hz[propEid]
		);
	}
	return false;
}

export function floorYAtWorld(x: number, z: number): number {
	const wc = Math.floor(x / TILE);
	const wr = Math.floor(z / TILE);
	const dw = getDungeon();
	const { cx, cy } = cellAtWorld(x, z, TILE);
	const desc = dw.desc(dw.ensureSectorAtCell(cx, cy));
	if (!desc) return 0;
	const lc = wc - desc.originCol;
	const lr = wr - desc.originRow;
	if (lc < 0 || lc >= desc.cols || lr < 0 || lr >= desc.rows) return 0;
	return desc.tiles[lr * desc.cols + lc] & PIT ? -OASIS_DEPTH : 0;
}

export function pitAtWorld(x: number, z: number): boolean {
	return floorYAtWorld(x, z) < 0;
}

export interface Body {
	pos: { x: number; z: number };
	radius: number;
}

const bodies = new Set<Body>();

export function registerBody(b: Body): () => void {
	bodies.add(b);
	return () => bodies.delete(b);
}

// Weighted sum of every dynamic occluder position. A stable value means the
// player, goblins and moving props all held still — nothing casts a new
// shadow, so shadow maps can skip their re-render. Register/unregister shifts
// it too, so a spawned/despawned body forces one refresh.
export function bodyMotionSig(): number {
	let s = 0;
	for (const b of bodies) s += b.pos.x * 2.3 + b.pos.z * 1.7;
	return s;
}

export function makeMover(
	radius: number,
	self?: Body,
	skipBodies = false,
	blockPits = false,
): (pos: { x: number; z: number }, dx: number, dz: number) => void {
	const blocked = (x: number, z: number): boolean =>
		solidAtWorld(x, z) || (blockPits && pitAtWorld(x, z));
	const moveAxis = (
		pos: { x: number; z: number },
		dx: number,
		dz: number,
	): void => {
		if (dx !== 0 && !blocked(pos.x + dx + Math.sign(dx) * radius, pos.z))
			pos.x += dx;
		if (dz !== 0 && !blocked(pos.x, pos.z + dz + Math.sign(dz) * radius))
			pos.z += dz;
	};
	return (pos, dx, dz) => {
		const dist = Math.hypot(dx, dz);
		const steps = Math.min(64, Math.max(1, Math.ceil(dist / radius)));
		const sx = dx / steps;
		const sz = dz / steps;
		for (let i = 0; i < steps; i++) moveAxis(pos, sx, sz);

		// Terrain-only movers (e.g. a lunging combo) slide on walls but pass
		// through actor bodies instead of being deflected off enemies.
		if (skipBodies) return;
		for (const b of bodies) {
			if (b === self) continue;
			const bx = pos.x - b.pos.x;
			const bz = pos.z - b.pos.z;
			const rr = radius + b.radius;
			const d2 = bx * bx + bz * bz;
			if (d2 >= rr * rr) continue;
			const d = Math.sqrt(d2);
			if (d < 1e-4) {
				moveAxis(pos, rr, 0);
				continue;
			}
			const push = rr - d;
			moveAxis(pos, (bx / d) * push, (bz / d) * push);
		}
	};
}

let spawnCache: [number, number, number] | null = null;

export function dungeonSpawn(): [number, number, number] {
	if (spawnCache) return spawnCache;
	const s = genSector(DUNGEON_SEED, 0, 0);
	const r = s.rooms[s.entrance];
	const wx = (r.col0 + r.w / 2) * CELL * TILE;
	const wz = (r.row0 + r.h / 2) * CELL * TILE;
	spawnCache = [wx, TILE / 2, wz];
	return spawnCache;
}

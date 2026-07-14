import { TILE } from '../config';
import { SOLID, PILLAR, DOORWAY, OCCLUDES } from '../geometry/grid';
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
	// A doorway tile blocks while its door is spawned + locked; when open (or a
	// doorless connector gate) only the arch OPENING is passable — the jambs the
	// arch panel draws beside it are solid, mirroring buildArches/DoorLeaf
	// (same jitter, same wall-line axis as archAxis).
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

// Live character bodies (player + NPCs) as flat circles; every mover resolves
// against the set, so player↔goblin and goblin↔goblin can't interpenetrate.
export interface Body {
	pos: { x: number; z: number };
	radius: number;
}

const bodies = new Set<Body>();

export function registerBody(b: Body): () => void {
	bodies.add(b);
	return () => bodies.delete(b);
}

// Axis-separated slide-along-walls mover for any body radius (player 0.35,
// small goblin ~0.2). Sub-stepped so one frame never advances more than the
// radius — a long frame would otherwise sample past a thin wall and tunnel.
// Pass the mover's own body so it skips itself when pushing out of others.
export function makeMover(
	radius: number,
	self?: Body,
): (pos: { x: number; z: number }, dx: number, dz: number) => void {
	const moveAxis = (
		pos: { x: number; z: number },
		dx: number,
		dz: number,
	): void => {
		if (
			dx !== 0 &&
			!solidAtWorld(pos.x + dx + Math.sign(dx) * radius, pos.z)
		)
			pos.x += dx;
		if (
			dz !== 0 &&
			!solidAtWorld(pos.x, pos.z + dz + Math.sign(dz) * radius)
		)
			pos.z += dz;
	};
	return (pos, dx, dz) => {
		const dist = Math.hypot(dx, dz);
		const steps = Math.min(64, Math.max(1, Math.ceil(dist / radius)));
		const sx = dx / steps;
		const sz = dz / steps;
		for (let i = 0; i < steps; i++) moveAxis(pos, sx, sz);
		// Circle-circle pushout, wall-respecting: overlap resolves through
		// moveAxis so a body can't be shoved into rock.
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

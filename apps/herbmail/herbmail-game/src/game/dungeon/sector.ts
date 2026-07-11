import { hashInt } from '../geometry/rng';

export const SECTOR = 8;
export const MIN_LEAF = 2;
export const MAX_DEPTH = 3;
export const LOOP_CHANCE = 0.25;
export const MAX_LOCKS = 2;

export const ROOM_ENTRANCE = 0;
export const ROOM_NORMAL = 1;
export const ROOM_JUNCTION = 2;
export const ROOM_DEADEND = 3;
export const ROOM_ARENA = 4;
export type RoomType =
	| typeof ROOM_ENTRANCE
	| typeof ROOM_NORMAL
	| typeof ROOM_JUNCTION
	| typeof ROOM_DEADEND
	| typeof ROOM_ARENA;

export interface SRoom {
	id: number;
	col0: number;
	row0: number;
	w: number;
	h: number;
	type: RoomType;
	keyId: number;
}

export interface SEdge {
	id: number;
	a: number;
	b: number;
	corridor: number[];
	tree: boolean;
	locked: boolean;
	keyId: number;
}

export interface CellOwner {
	kind: 0 | 1;
	id: number;
}

export const SIDE_N = 0;
export const SIDE_E = 1;
export const SIDE_S = 2;
export const SIDE_W = 3;
export type Side =
	| typeof SIDE_N
	| typeof SIDE_E
	| typeof SIDE_S
	| typeof SIDE_W;

export interface Connector {
	side: Side;
	lx: number;
	ly: number;
}

export interface Sector {
	sx: number;
	sy: number;
	seed: number;
	rooms: SRoom[];
	edges: SEdge[];
	entrance: number;
	cellOwner: Map<number, CellOwner>;
	adj: Map<number, number[]>;
	connectors: Connector[];
}

export const OWNER_ROOM = 0;
export const OWNER_CORRIDOR = 1;
const CONNECTOR_ID_BASE = 900;

export function floorDiv(n: number, d: number): number {
	return Math.floor(n / d);
}

export function localCell(n: number): number {
	return ((n % SECTOR) + SECTOR) % SECTOR;
}

export function cellIndex(lx: number, ly: number): number {
	return ly * SECTOR + lx;
}

export function sectorSeed(seed: number, sx: number, sy: number): number {
	return hashInt(
		Math.imul(sx, 73856093) ^ Math.imul(sy, 19349663),
		seed | 0,
		0x736563,
	);
}

interface Rng {
	next(): number;
	int(min: number, max: number): number;
}

function makeRng(seed: number): Rng {
	let i = 0;
	const next = (): number => hashInt(seed | 0, i++, 0x9e3779b9) / 4294967295;
	return {
		next,
		int: (min: number, max: number) =>
			min + Math.floor(next() * (max - min + 1)),
	};
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

function makeRoom(rng: Rng, rect: Rect, id: number): SRoom {
	let { x: col0, y: row0, w, h } = rect;
	if (w > MIN_LEAF && rng.next() < 0.6) {
		const padL = rng.int(0, 1);
		const padR = rng.int(0, 1);
		if (w - padL - padR >= MIN_LEAF) {
			col0 += padL;
			w -= padL + padR;
		}
	}
	if (h > MIN_LEAF && rng.next() < 0.6) {
		const padT = rng.int(0, 1);
		const padB = rng.int(0, 1);
		if (h - padT - padB >= MIN_LEAF) {
			row0 += padT;
			h -= padT + padB;
		}
	}
	return { id, col0, row0, w, h, type: ROOM_NORMAL, keyId: -1 };
}

function partition(
	rng: Rng,
	rect: Rect,
	depth: number,
	rooms: SRoom[],
	treeEdges: [number, number][],
): number {
	const splittableW = rect.w >= MIN_LEAF * 2;
	const splittableH = rect.h >= MIN_LEAF * 2;
	const canSplit =
		depth < MAX_DEPTH &&
		(splittableW || splittableH) &&
		(depth < 1 || rng.next() < 0.72);

	if (!canSplit) {
		const room = makeRoom(rng, rect, rooms.length);
		rooms.push(room);
		return room.id;
	}

	let vertical: boolean;
	if (splittableW && !splittableH) vertical = true;
	else if (!splittableW && splittableH) vertical = false;
	else if (rect.w > rect.h) vertical = rng.next() < 0.8;
	else if (rect.h > rect.w) vertical = rng.next() < 0.2;
	else vertical = rng.next() < 0.5;

	let r1: Rect;
	let r2: Rect;
	if (vertical) {
		const cut = rng.int(MIN_LEAF, rect.w - MIN_LEAF);
		r1 = { x: rect.x, y: rect.y, w: cut, h: rect.h };
		r2 = { x: rect.x + cut, y: rect.y, w: rect.w - cut, h: rect.h };
	} else {
		const cut = rng.int(MIN_LEAF, rect.h - MIN_LEAF);
		r1 = { x: rect.x, y: rect.y, w: rect.w, h: cut };
		r2 = { x: rect.x, y: rect.y + cut, w: rect.w, h: rect.h - cut };
	}

	const a = partition(rng, r1, depth + 1, rooms, treeEdges);
	const b = partition(rng, r2, depth + 1, rooms, treeEdges);
	treeEdges.push([a, b]);
	return rng.next() < 0.5 ? a : b;
}

function roomCenter(r: SRoom): { lx: number; ly: number } {
	return { lx: r.col0 + (r.w >> 1), ly: r.row0 + (r.h >> 1) };
}

function carveCorridor(
	rng: Rng,
	rooms: SRoom[],
	a: number,
	b: number,
): number[] {
	const ca = roomCenter(rooms[a]);
	const cb = roomCenter(rooms[b]);
	const cells: number[] = [];
	const push = (lx: number, ly: number): void => {
		if (lx < 0 || lx >= SECTOR || ly < 0 || ly >= SECTOR) return;
		cells.push(cellIndex(lx, ly));
	};
	const xFirst = rng.next() < 0.5;
	if (xFirst) {
		for (let x = Math.min(ca.lx, cb.lx); x <= Math.max(ca.lx, cb.lx); x++)
			push(x, ca.ly);
		for (let y = Math.min(ca.ly, cb.ly); y <= Math.max(ca.ly, cb.ly); y++)
			push(cb.lx, y);
	} else {
		for (let y = Math.min(ca.ly, cb.ly); y <= Math.max(ca.ly, cb.ly); y++)
			push(ca.lx, y);
		for (let x = Math.min(ca.lx, cb.lx); x <= Math.max(ca.lx, cb.lx); x++)
			push(x, cb.ly);
	}
	return cells;
}

function roomsAdjacent(a: SRoom, b: SRoom): boolean {
	const ax2 = a.col0 + a.w;
	const ay2 = a.row0 + a.h;
	const bx2 = b.col0 + b.w;
	const by2 = b.row0 + b.h;
	const gapX = Math.max(a.col0 - bx2, b.col0 - ax2);
	const gapY = Math.max(a.row0 - by2, b.row0 - ay2);
	const overlapX = a.col0 < bx2 && b.col0 < ax2;
	const overlapY = a.row0 < by2 && b.row0 < ay2;
	return (overlapX && gapY <= 2) || (overlapY && gapX <= 2);
}

function buildAdj(rooms: SRoom[], edges: SEdge[]): Map<number, number[]> {
	const adj = new Map<number, number[]>();
	for (const r of rooms) adj.set(r.id, []);
	for (const e of edges) {
		adj.get(e.a)!.push(e.b);
		adj.get(e.b)!.push(e.a);
	}
	return adj;
}

function treeRoots(
	rooms: SRoom[],
	treeEdges: [number, number][],
	entrance: number,
): { parent: number[]; depth: number[]; order: number[] } {
	const treeAdj = new Map<number, number[]>();
	for (const r of rooms) treeAdj.set(r.id, []);
	for (const [a, b] of treeEdges) {
		treeAdj.get(a)!.push(b);
		treeAdj.get(b)!.push(a);
	}
	const parent = new Array(rooms.length).fill(-1);
	const depth = new Array(rooms.length).fill(0);
	const order: number[] = [];
	const seen = new Set<number>([entrance]);
	let frontier = [entrance];
	while (frontier.length) {
		const next: number[] = [];
		for (const n of frontier) {
			order.push(n);
			for (const m of treeAdj.get(n)!) {
				if (seen.has(m)) continue;
				seen.add(m);
				parent[m] = n;
				depth[m] = depth[n] + 1;
				next.push(m);
			}
		}
		frontier = next;
	}
	return { parent, depth, order };
}

function subtree(child: number, parent: number[]): Set<number> {
	const out = new Set<number>();
	const stack = [child];
	while (stack.length) {
		const n = stack.pop()!;
		if (out.has(n)) continue;
		out.add(n);
		for (let i = 0; i < parent.length; i++)
			if (parent[i] === n) stack.push(i);
	}
	return out;
}

function pickEntrance(rng: Rng, rooms: SRoom[]): number {
	const border = rooms.filter(
		(r) =>
			r.col0 === 0 ||
			r.row0 === 0 ||
			r.col0 + r.w === SECTOR ||
			r.row0 + r.h === SECTOR,
	);
	const pool = border.length ? border : rooms;
	return pool[rng.int(0, pool.length - 1)].id;
}

function assignTypes(
	rooms: SRoom[],
	adj: Map<number, number[]>,
	entrance: number,
): void {
	for (const r of rooms) {
		if (r.id === entrance) {
			r.type = ROOM_ENTRANCE;
			continue;
		}
		const deg = adj.get(r.id)!.length;
		const area = r.w * r.h;
		if (deg <= 1) r.type = ROOM_DEADEND;
		else if (deg >= 3) r.type = ROOM_JUNCTION;
		else if (area >= 9) r.type = ROOM_ARENA;
		else r.type = ROOM_NORMAL;
	}
}

function applyLocks(
	rng: Rng,
	rooms: SRoom[],
	edges: SEdge[],
	treeEdges: [number, number][],
	entrance: number,
): void {
	const { parent, depth } = treeRoots(rooms, treeEdges, entrance);

	const treeEdgeList = edges.filter((e) => e.tree);
	const childOf = (e: SEdge): number =>
		parent[e.a] === e.b ? e.a : parent[e.b] === e.a ? e.b : -1;

	const candidates = treeEdgeList
		.map((e) => ({ e, child: childOf(e) }))
		.filter((c) => c.child >= 0 && depth[c.child] >= 1)
		.sort((p, q) => depth[p.child] - depth[q.child]);

	const nLocks = Math.min(
		MAX_LOCKS,
		candidates.length,
		rng.int(0, MAX_LOCKS),
	);
	const chosen: { e: SEdge; child: number }[] = [];
	const pool = candidates.slice();
	for (let i = 0; i < nLocks && pool.length; i++) {
		const idx = rng.int(0, pool.length - 1);
		chosen.push(pool.splice(idx, 1)[0]);
	}
	chosen.sort((p, q) => depth[p.child] - depth[q.child]);

	const lockedChildren = new Set(chosen.map((c) => c.child));
	const usedKeyRooms = new Set<number>();
	let keyId = 0;
	for (const { e, child } of chosen) {
		const far = subtree(child, parent);
		let ancestor = -1;
		let ancestorDepth = -1;
		let p = parent[child];
		while (p !== -1) {
			if (lockedChildren.has(p) && depth[p] > ancestorDepth) {
				ancestor = p;
				ancestorDepth = depth[p];
			}
			p = parent[p];
		}
		const region =
			ancestor >= 0
				? subtree(ancestor, parent)
				: new Set(rooms.map((r) => r.id));
		const keyRooms = [...region].filter(
			(id) => !far.has(id) && !usedKeyRooms.has(id),
		);
		if (!keyRooms.length) continue;
		e.locked = true;
		e.keyId = keyId;
		const keyRoom = keyRooms[rng.int(0, keyRooms.length - 1)];
		rooms[keyRoom].keyId = keyId;
		usedKeyRooms.add(keyRoom);
		keyId++;
	}
}

function borderPos(
	seed: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number {
	const first = ax < bx || (ax === bx && ay <= by);
	const x1 = first ? ax : bx;
	const y1 = first ? ay : by;
	const x2 = first ? bx : ax;
	const y2 = first ? by : ay;
	const h = hashInt(
		Math.imul(x1, 73856093) ^ Math.imul(x2, 19349663),
		Math.imul(y1, 83492791) ^ Math.imul(y2, 49979687),
		(seed | 0) ^ 0xc07,
	);
	return 1 + (h % (SECTOR - 2));
}

function nearestRoom(rooms: SRoom[], lx: number, ly: number): number {
	let best = 0;
	let bd = Infinity;
	for (const r of rooms) {
		const c = roomCenter(r);
		const d = Math.abs(c.lx - lx) + Math.abs(c.ly - ly);
		if (d < bd) {
			bd = d;
			best = r.id;
		}
	}
	return best;
}

function carveCellPath(
	rooms: SRoom[],
	fromLx: number,
	fromLy: number,
	roomId: number,
	cellOwner: Map<number, CellOwner>,
	id: number,
): void {
	const c = roomCenter(rooms[roomId]);
	let x = fromLx;
	let y = fromLy;
	const step = (): void => {
		const ci = cellIndex(x, y);
		if (!cellOwner.has(ci)) cellOwner.set(ci, { kind: OWNER_CORRIDOR, id });
	};
	step();
	while (x !== c.lx) {
		x += x < c.lx ? 1 : -1;
		step();
	}
	while (y !== c.ly) {
		y += y < c.ly ? 1 : -1;
		step();
	}
}

function addConnectors(
	seed: number,
	sx: number,
	sy: number,
	rooms: SRoom[],
	cellOwner: Map<number, CellOwner>,
): Connector[] {
	const specs: { side: Side; nx: number; ny: number }[] = [
		{ side: SIDE_N, nx: sx, ny: sy - 1 },
		{ side: SIDE_E, nx: sx + 1, ny: sy },
		{ side: SIDE_S, nx: sx, ny: sy + 1 },
		{ side: SIDE_W, nx: sx - 1, ny: sy },
	];
	const connectors: Connector[] = [];
	for (let i = 0; i < specs.length; i++) {
		const { side, nx, ny } = specs[i];
		const pos = borderPos(seed, sx, sy, nx, ny);
		let lx: number;
		let ly: number;
		if (side === SIDE_N) {
			lx = pos;
			ly = 0;
		} else if (side === SIDE_S) {
			lx = pos;
			ly = SECTOR - 1;
		} else if (side === SIDE_W) {
			lx = 0;
			ly = pos;
		} else {
			lx = SECTOR - 1;
			ly = pos;
		}
		carveCellPath(
			rooms,
			lx,
			ly,
			nearestRoom(rooms, lx, ly),
			cellOwner,
			CONNECTOR_ID_BASE + i,
		);
		connectors.push({ side, lx, ly });
	}
	return connectors;
}

export function genSector(seed: number, sx: number, sy: number): Sector {
	const sseed = sectorSeed(seed, sx, sy);
	const rng = makeRng(sseed);

	const rooms: SRoom[] = [];
	const treeEdges: [number, number][] = [];
	partition(rng, { x: 0, y: 0, w: SECTOR, h: SECTOR }, 0, rooms, treeEdges);

	const edges: SEdge[] = [];
	const connected = new Set<string>();
	const key = (a: number, b: number): string =>
		a < b ? `${a}|${b}` : `${b}|${a}`;

	for (const [a, b] of treeEdges) {
		if (a === b || connected.has(key(a, b))) continue;
		connected.add(key(a, b));
		edges.push({
			id: edges.length,
			a,
			b,
			corridor: carveCorridor(rng, rooms, a, b),
			tree: true,
			locked: false,
			keyId: -1,
		});
	}

	for (let i = 0; i < rooms.length; i++) {
		for (let j = i + 1; j < rooms.length; j++) {
			if (connected.has(key(i, j))) continue;
			if (!roomsAdjacent(rooms[i], rooms[j])) continue;
			if (rng.next() >= LOOP_CHANCE) continue;
			connected.add(key(i, j));
			edges.push({
				id: edges.length,
				a: i,
				b: j,
				corridor: carveCorridor(rng, rooms, i, j),
				tree: false,
				locked: false,
				keyId: -1,
			});
		}
	}

	const entrance = pickEntrance(rng, rooms);
	const adj = buildAdj(rooms, edges);
	assignTypes(rooms, adj, entrance);
	applyLocks(rng, rooms, edges, treeEdges, entrance);

	const cellOwner = new Map<number, CellOwner>();
	for (const r of rooms)
		for (let dy = 0; dy < r.h; dy++)
			for (let dx = 0; dx < r.w; dx++)
				cellOwner.set(cellIndex(r.col0 + dx, r.row0 + dy), {
					kind: OWNER_ROOM,
					id: r.id,
				});
	for (const e of edges)
		for (const ci of e.corridor)
			if (!cellOwner.has(ci))
				cellOwner.set(ci, { kind: OWNER_CORRIDOR, id: e.id });

	const connectors = addConnectors(seed, sx, sy, rooms, cellOwner);

	return {
		sx,
		sy,
		seed: sseed,
		rooms,
		edges,
		entrance,
		cellOwner,
		adj,
		connectors,
	};
}

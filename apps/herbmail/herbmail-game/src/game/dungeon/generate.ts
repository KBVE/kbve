import { ARCH, FLOOR, WALL, type Grid } from '../geometry/grid';
import { hash01 } from '../geometry/rng';

export const CELL = 6;

export const DOOR_N = 1;
export const DOOR_E = 2;
export const DOOR_S = 4;
export const DOOR_W = 8;

const DOOR_THRESHOLD = 0.62;
const TORCH_KEEP = 0.28;

// Per-cell layout style, folded into the signature so cached geometry stays
// correct (bounded: 16 doors x VARIANTS x STYLES). 0 = open room, 1 = room with
// deeper door tunnels, 2 = narrow corridor cell.
export const STYLE_ROOM = 0;
export const STYLE_TUNNEL = 1;
export const STYLE_CORRIDOR = 2;
const TUNNEL_DEPTH = 2;

function cellStyle(seed: number, cx: number, cy: number): number {
	const h = hash01(cx, cy, (seed | 0) ^ 0x9e3779b9);
	if (h < 0.5) return STYLE_ROOM;
	if (h < 0.75) return STYLE_TUNNEL;
	return STYLE_CORRIDOR;
}

// Cosmetic variety pool. Geometry + torches depend only on (doors, variant),
// so at most 16 doors x VARIANTS distinct rooms ever get built — everything
// else is a cache hit. Bump for more visual variety at the cost of more cached
// geometry sets.
export const VARIANTS = 6;

export interface TorchSlot {
	col: number;
	row: number;
	di: number;
}

export interface SpawnSlot {
	cat: number;
	ref: string;
	col: number;
	row: number;
}

export interface RoomDesc {
	cx: number;
	cy: number;
	cols: number;
	rows: number;
	originCol: number;
	originRow: number;
	tiles: Uint8Array;
	doors: number;
	variant: number;
	signature: string;
	torches: TorchSlot[];
	spawnSlots: SpawnSlot[];
}

// Neighbour directions matching geometry DIRS order: N, S, W, E.
const NEIGHBORS: { di: number; bit: number; dc: number; dr: number }[] = [
	{ di: 0, bit: DOOR_N, dc: 0, dr: -1 },
	{ di: 1, bit: DOOR_S, dc: 0, dr: 1 },
	{ di: 2, bit: DOOR_W, dc: -1, dr: 0 },
	{ di: 3, bit: DOOR_E, dc: 1, dr: 0 },
];

// Symmetric per-edge hash: the door between cells A and B is decided by the
// unordered pair, so both rooms compute the identical answer regardless of which
// is generated first.
function edgeOpen(
	seed: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): boolean {
	const first =
		ax < bx || (ax === bx && ay <= by)
			? [ax, ay, bx, by]
			: [bx, by, ax, ay];
	const h = hash01(
		Math.imul(first[0], 73856093) ^ Math.imul(first[2], 19349663),
		Math.imul(first[1], 83492791) ^ Math.imul(first[3], 49979687),
		seed | 0,
	);
	return h < DOOR_THRESHOLD;
}

function idx(col: number, row: number): number {
	return row * CELL + col;
}

// Only interior tiles (never the perimeter/doors) are carveable.
function setInterior(
	tiles: Uint8Array,
	col: number,
	row: number,
	v: number,
): void {
	if (col > 0 && col < CELL - 1 && row > 0 && row < CELL - 1)
		tiles[idx(col, row)] = v;
}

// Room style: flank each door's entry column with wall for a few tiles, making a
// short 1-wide tunnel before the room opens up. Flanks sit at mid±1 near the
// perimeter, never on another door's mid-line, so nothing gets disconnected.
function carveTunnels(tiles: Uint8Array, doors: number, mid: number): void {
	const w = (c: number, r: number) => setInterior(tiles, c, r, WALL);
	for (let d = 1; d <= TUNNEL_DEPTH; d++) {
		if (doors & DOOR_N) {
			w(mid - 1, d);
			w(mid + 1, d);
		}
		if (doors & DOOR_S) {
			w(mid - 1, CELL - 1 - d);
			w(mid + 1, CELL - 1 - d);
		}
		if (doors & DOOR_W) {
			w(d, mid - 1);
			w(d, mid + 1);
		}
		if (doors & DOOR_E) {
			w(CELL - 1 - d, mid - 1);
			w(CELL - 1 - d, mid + 1);
		}
	}
}

// Corridor style: wall the whole interior, then carve a 1-wide cross from every
// door to the centre, so the cell reads as connecting hallways instead of a room.
function carveCorridor(tiles: Uint8Array, doors: number, mid: number): void {
	for (let r = 1; r < CELL - 1; r++)
		for (let c = 1; c < CELL - 1; c++) tiles[idx(c, r)] = WALL;
	const f = (c: number, r: number) => setInterior(tiles, c, r, FLOOR);
	f(mid, mid);
	if (doors & DOOR_N) for (let r = 1; r <= mid; r++) f(mid, r);
	if (doors & DOOR_S) for (let r = mid; r <= CELL - 2; r++) f(mid, r);
	if (doors & DOOR_W) for (let c = 1; c <= mid; c++) f(c, mid);
	if (doors & DOOR_E) for (let c = mid; c <= CELL - 2; c++) f(c, mid);
}

export function roomDoors(seed: number, cx: number, cy: number): number {
	let bits = 0;
	for (const n of NEIGHBORS) {
		if (edgeOpen(seed, cx, cy, cx + n.dc, cy + n.dr)) bits |= n.bit;
	}
	return bits;
}

export function genRoom(seed: number, cx: number, cy: number): RoomDesc {
	const tiles = new Uint8Array(CELL * CELL);
	for (let row = 0; row < CELL; row++) {
		for (let col = 0; col < CELL; col++) {
			const perimeter =
				col === 0 || col === CELL - 1 || row === 0 || row === CELL - 1;
			tiles[idx(col, row)] = perimeter ? WALL : FLOOR;
		}
	}

	const mid = Math.floor(CELL / 2);
	const doors = roomDoors(seed, cx, cy);
	if (doors & DOOR_N) tiles[idx(mid, 0)] = ARCH;
	if (doors & DOOR_S) tiles[idx(mid, CELL - 1)] = ARCH;
	if (doors & DOOR_W) tiles[idx(0, mid)] = ARCH;
	if (doors & DOOR_E) tiles[idx(CELL - 1, mid)] = ARCH;

	const style = cellStyle(seed, cx, cy);
	if (style === STYLE_TUNNEL) carveTunnels(tiles, doors, mid);
	else if (style === STYLE_CORRIDOR) carveCorridor(tiles, doors, mid);

	const originCol = cx * CELL;
	const originRow = cy * CELL;

	const variant = Math.floor(hash01(cx, cy, seed | 0) * VARIANTS);
	const torches = genTorches(tiles, variant);

	return {
		cx,
		cy,
		cols: CELL,
		rows: CELL,
		originCol,
		originRow,
		tiles,
		doors,
		variant,
		signature: `${doors}:${variant}:${style}`,
		torches,
		spawnSlots: [],
	};
}

const TORCH_DIRS = [
	{ di: 0, dc: 0, dr: -1 },
	{ di: 1, dc: 0, dr: 1 },
	{ di: 2, dc: -1, dr: 0 },
	{ di: 3, dc: 1, dr: 0 },
];

function tileOf(tiles: Uint8Array, col: number, row: number): number {
	if (col < 0 || col >= CELL || row < 0 || row >= CELL) return WALL;
	return tiles[idx(col, row)];
}

// Torches depend only on the local tile layout (doors) + variant, so the same
// signature always yields the same slots — a cache/pool hit.
function genTorches(tiles: Uint8Array, variant: number): TorchSlot[] {
	const out: TorchSlot[] = [];
	for (let row = 1; row < CELL - 1; row++) {
		for (let col = 1; col < CELL - 1; col++) {
			if (tiles[idx(col, row)] !== FLOOR) continue;
			for (const d of TORCH_DIRS) {
				if (tileOf(tiles, col + d.dc, row + d.dr) !== WALL) continue;
				const h = hash01(col, row, (d.di + 1) * 131 + variant * 997);
				if (h < TORCH_KEEP) out.push({ col, row, di: d.di });
			}
		}
	}
	return out;
}

// World-placed grid (for collision / world lookups).
export function makeRoomGrid(desc: RoomDesc): Grid {
	return {
		cols: desc.cols,
		rows: desc.rows,
		originCol: desc.originCol,
		originRow: desc.originRow,
		tileAt: (col: number, row: number) => desc.tiles[row * desc.cols + col],
	};
}

// Origin-local grid (for building reusable, position-independent geometry).
export function makeLocalGrid(desc: RoomDesc): Grid {
	return {
		cols: desc.cols,
		rows: desc.rows,
		originCol: 0,
		originRow: 0,
		tileAt: (col: number, row: number) => desc.tiles[row * desc.cols + col],
	};
}

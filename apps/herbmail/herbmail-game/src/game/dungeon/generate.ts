import { ARCH, FLOOR, WALL, COLUMN, type Grid } from '../geometry/grid';
import { WALL_TEX_COUNT } from '../geometry/walls';
import { hash01 } from '../geometry/rng';
import {
	genSector,
	SECTOR,
	cellIndex as sectorCellIndex,
	SIDE_N,
	SIDE_S,
	SIDE_W,
	type Connector,
} from './sector';

export const CELL = 6;
export const SECTOR_TILES = SECTOR * CELL;

export const DOOR_N = 1;
export const DOOR_E = 2;
export const DOOR_S = 4;
export const DOOR_W = 8;

const DOOR_THRESHOLD = 0.62;
const TORCH_KEEP = 0.28;
const TORCH_GAP = 3;

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

// A structural pillar between floor and ceiling. style = which of COLUMN_STYLES
// shapes (chosen per owning room, never mixed); tex = which wall atlas it shares
// with that room's walls; torch = carries a mid-shaft sconce light.
export interface ColumnSlot {
	col: number;
	row: number;
	style: number;
	tex: number;
	torch: boolean;
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
	columns: ColumnSlot[];
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
		columns: [],
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

function tileOfGrid(
	tiles: Uint8Array,
	cols: number,
	rows: number,
	col: number,
	row: number,
): number {
	if (col < 0 || col >= cols || row < 0 || row >= rows) return WALL;
	return tiles[row * cols + col];
}

function genTorchesGrid(
	tiles: Uint8Array,
	cols: number,
	rows: number,
	variant: number,
): TorchSlot[] {
	const out: TorchSlot[] = [];
	const lastOnLine = new Map<number, number>();
	for (let row = 1; row < rows - 1; row++) {
		for (let col = 1; col < cols - 1; col++) {
			if (tiles[row * cols + col] !== FLOOR) continue;
			for (const d of TORCH_DIRS) {
				if (
					tileOfGrid(tiles, cols, rows, col + d.dc, row + d.dr) !==
					WALL
				)
					continue;
				const h = hash01(col, row, (d.di + 1) * 131 + variant * 997);
				if (h >= TORCH_KEEP) continue;
				const horiz = d.di < 2;
				const along = horiz ? col : row;
				const line = d.di * 1000 + (horiz ? row : col);
				const last = lastOnLine.get(line);
				if (last !== undefined && along - last < TORCH_GAP) continue;
				lastOnLine.set(line, along);
				out.push({ col, row, di: d.di });
			}
		}
	}
	return out;
}

const GATE_HALF = 1;

// Punch an ARCH gateway on the outward-facing tile line of each connector cell.
// The connector cell sits on the sector border, so its outward tiles face OOB;
// walls skip an ARCH tile's OOB face and the arch builder draws a frame there, so
// this opens a passage that lines up with the mirrored gate in the neighbour
// sector (both derive the same border position from the shared cell pair).
function carveConnectorGates(
	tiles: Uint8Array,
	cols: number,
	connectors: Connector[],
): void {
	for (const c of connectors) {
		const baseCol = c.lx * CELL;
		const baseRow = c.ly * CELL;
		const mid = Math.floor(CELL / 2);
		for (let k = -GATE_HALF; k <= GATE_HALF; k++) {
			let tc: number;
			let tr: number;
			if (c.side === SIDE_N) {
				tc = baseCol + mid + k;
				tr = baseRow;
			} else if (c.side === SIDE_S) {
				tc = baseCol + mid + k;
				tr = baseRow + CELL - 1;
			} else if (c.side === SIDE_W) {
				tc = baseCol;
				tr = baseRow + mid + k;
			} else {
				tc = baseCol + CELL - 1;
				tr = baseRow + mid + k;
			}
			tiles[tr * cols + tc] = ARCH;
		}
	}
}

export const COLUMN_STYLES = 4;
const COLUMN_SPACING = 5;

// Place pillars on a coarse lattice, only where the tile and its 4 neighbours are
// all open floor — so a column stands free in a room "holding up" the ceiling, not
// buried in a wall. Style + shared wall texture are picked from the OWNING room so
// every column in a room matches (and matches that room's walls); marks the tile
// COLUMN so collision and wall-face generation treat it as solid-but-not-wall.
function genColumns(
	sector: ReturnType<typeof genSector>,
	tiles: Uint8Array,
	cols: number,
	rows: number,
	variant: number,
): ColumnSlot[] {
	const out: ColumnSlot[] = [];
	const isFloor = (c: number, r: number): boolean =>
		c >= 0 &&
		c < cols &&
		r >= 0 &&
		r < rows &&
		tiles[r * cols + c] === FLOOR;

	for (let row = COLUMN_SPACING; row < rows - 2; row += COLUMN_SPACING) {
		for (let col = COLUMN_SPACING; col < cols - 2; col += COLUMN_SPACING) {
			const h = hash01(col, row, variant * 131 + 7);
			const jc = col + (h < 0.34 ? -1 : h < 0.67 ? 0 : 1);
			const jr =
				row + (hash01(col, row, variant * 131 + 13) < 0.5 ? 0 : 1);
			if (
				!isFloor(jc, jr) ||
				!isFloor(jc - 1, jr) ||
				!isFloor(jc + 1, jr) ||
				!isFloor(jc, jr - 1) ||
				!isFloor(jc, jr + 1)
			)
				continue;

			const lx = Math.floor(jc / CELL);
			const ly = Math.floor(jr / CELL);
			const owner = sector.cellOwner.get(sectorCellIndex(lx, ly));
			const rid = owner ? owner.id + 1 : 0;
			const style = Math.floor(hash01(rid, variant, 91) * COLUMN_STYLES);
			const tex = Math.floor(hash01(rid, variant, 53) * WALL_TEX_COUNT);
			const torch = hash01(jc, jr, variant * 29 + 3) < 0.4;

			tiles[jr * cols + jc] = COLUMN;
			out.push({ col: jc, row: jr, style, tex, torch });
		}
	}
	return out;
}

// One carved tile grid for a whole sector: a tile is FLOOR when its lattice cell
// is owned by a room or corridor, else solid WALL rock. Walls, floors, coves and
// niches all fall out of the geometry builders reading this grid. Openings between
// adjacent owned cells are open by construction, so the room graph's connectivity
// is exactly what the player can walk.
export function genSectorDesc(seed: number, sx: number, sy: number): RoomDesc {
	const sector = genSector(seed, sx, sy);
	const cols = SECTOR_TILES;
	const rows = SECTOR_TILES;
	const tiles = new Uint8Array(cols * rows);
	for (let tr = 0; tr < rows; tr++) {
		const ly = Math.floor(tr / CELL);
		for (let tc = 0; tc < cols; tc++) {
			const lx = Math.floor(tc / CELL);
			const owned = sector.cellOwner.has(sectorCellIndex(lx, ly));
			tiles[tr * cols + tc] = owned ? FLOOR : WALL;
		}
	}

	// The world is a continuous lattice, but each sector's geometry treats its
	// out-of-bounds edge as solid and renders a perimeter wall. Force the border
	// ring to WALL so collision (which samples the tile grid) matches that rendered
	// wall — otherwise the neighbour sector's floor shows through and the player
	// walks straight past the seam wall. Connector gates are re-carved right after,
	// so the mirrored gate on each side stays the one opening between sectors.
	for (let tc = 0; tc < cols; tc++) {
		tiles[tc] = WALL;
		tiles[(rows - 1) * cols + tc] = WALL;
	}
	for (let tr = 0; tr < rows; tr++) {
		tiles[tr * cols] = WALL;
		tiles[tr * cols + cols - 1] = WALL;
	}

	carveConnectorGates(tiles, cols, sector.connectors);

	const variant = Math.floor(hash01(sx, sy, seed | 0) * VARIANTS);
	const torches = genTorchesGrid(tiles, cols, rows, variant);
	const columns = genColumns(sector, tiles, cols, rows, variant);

	return {
		cx: sx,
		cy: sy,
		cols,
		rows,
		originCol: sx * SECTOR_TILES,
		originRow: sy * SECTOR_TILES,
		tiles,
		doors: 0,
		variant,
		signature: `sector:${sx}:${sy}`,
		torches,
		columns,
		spawnSlots: [],
	};
}

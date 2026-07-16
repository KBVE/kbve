import {
	ARCH,
	FLOOR,
	WALL,
	COLUMN,
	OASIS,
	OPEN,
	type Grid,
} from '../geometry/grid';
import { WALL_TEX_COUNT } from '../geometry/walls';
import { hash01 } from '../geometry/rng';
import {
	genSector,
	SECTOR,
	cellIndex as sectorCellIndex,
	OWNER_ROOM,
	SIDE_N,
	SIDE_E,
	SIDE_S,
	SIDE_W,
	type Connector,
	type CellOwner,
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

export interface ColumnSlot {
	col: number;
	row: number;
	style: number;
	tex: number;
	torch: boolean;
}

export interface DoorSlot {
	lc: number;
	lr: number;
	axis: 'x' | 'z';
}

export interface OasisSlot {
	col: number;
	row: number;
	w: number;
	h: number;
	// Room tile bounds (local grid), for the dome that vaults the whole room.
	rc: number;
	rr: number;
	rw: number;
	rh: number;
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
	doorways: DoorSlot[];
	oases: OasisSlot[];
}

const NEIGHBORS: { di: number; bit: number; dc: number; dr: number }[] = [
	{ di: 0, bit: DOOR_N, dc: 0, dr: -1 },
	{ di: 1, bit: DOOR_S, dc: 0, dr: 1 },
	{ di: 2, bit: DOOR_W, dc: -1, dr: 0 },
	{ di: 3, bit: DOOR_E, dc: 1, dr: 0 },
];

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

function setInterior(
	tiles: Uint8Array,
	col: number,
	row: number,
	v: number,
): void {
	if (col > 0 && col < CELL - 1 && row > 0 && row < CELL - 1)
		tiles[idx(col, row)] = v;
}

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
		doorways: [],
		oases: [],
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

const OASIS_KEEP = 0.3;
const OASIS_MAX = 6;
const OASIS_MIN = 3;
const OASIS_MARGIN = 2;

function genOases(
	sector: ReturnType<typeof genSector>,
	tiles: Uint8Array,
	cols: number,
	seed: number,
): OasisSlot[] {
	const out: OasisSlot[] = [];
	for (const r of sector.rooms) {
		if (r.w < 2 || r.h < 2) continue;
		const h = hash01(
			r.id,
			Math.imul(sector.sx, 73856093) ^ Math.imul(sector.sy, 19349663),
			(seed | 0) ^ 0x9001,
		);
		if (h >= OASIS_KEEP) continue;
		const tw = r.w * CELL;
		const th = r.h * CELL;
		const w = Math.min(OASIS_MAX, tw - OASIS_MARGIN * 2);
		const ph = Math.min(OASIS_MAX, th - OASIS_MARGIN * 2);
		if (w < OASIS_MIN || ph < OASIS_MIN) continue;
		const col = r.col0 * CELL + ((tw - w) >> 1);
		const row = r.row0 * CELL + ((th - ph) >> 1);
		let clear = true;
		for (let tr = row; tr < row + ph && clear; tr++)
			for (let tc = col; tc < col + w; tc++)
				if (tiles[tr * cols + tc] !== FLOOR) {
					clear = false;
					break;
				}
		if (!clear) continue;
		for (let tr = row; tr < row + ph; tr++)
			for (let tc = col; tc < col + w; tc++)
				tiles[tr * cols + tc] = OASIS;
		// Open the whole room to the sky (floor, water AND its walls) so sky light
		// reaches the walls, not just the floor. The ceiling is only skipped over
		// non-solid OPEN tiles, so no gap opens above the room's boundary walls.
		const rc0 = r.col0 * CELL;
		const rr0 = r.row0 * CELL;
		const rows = tiles.length / cols;
		for (let tr = rr0; tr < rr0 + r.h * CELL && tr < rows; tr++)
			for (let tc = rc0; tc < rc0 + r.w * CELL && tc < cols; tc++)
				tiles[tr * cols + tc] |= OPEN;
		out.push({
			col,
			row,
			w,
			h: ph,
			rc: rc0,
			rr: rr0,
			rw: r.w * CELL,
			rh: r.h * CELL,
		});
	}
	return out;
}

const DOOR_KEEP = 0.5;

// Symmetric keep-hash over an unordered world-cell pair, so a seam gets the same
// verdict regardless of iteration order.
function seamKept(
	seed: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): boolean {
	const first = ax < bx || (ax === bx && ay <= by);
	const x1 = first ? ax : bx;
	const y1 = first ? ay : by;
	const x2 = first ? bx : ax;
	const y2 = first ? by : ay;
	return (
		hash01(
			Math.imul(x1, 73856093) ^ Math.imul(x2, 19349663),
			Math.imul(y1, 83492791) ^ Math.imul(y2, 49979687),
			(seed | 0) ^ 0xd00,
		) < DOOR_KEEP
	);
}

// Seal every passage seam — the boundary between two adjacent owned cells with
// different owners where at least one is a room. The 6-wide open seam is walled
// to a single centre ARCH tile (a real 1-wide doorway), so rooms are fully
// enclosed and can't be walked around; connectivity survives through the gap.
// The seam hash now only picks which arches get a door leaf (DoorSlot). Runs
// before genColumns so columns never land on a fresh doorway wall.
function genDoorways(
	tiles: Uint8Array,
	cols: number,
	cellOwner: Map<number, CellOwner>,
	seed: number,
	sx: number,
	sy: number,
): DoorSlot[] {
	const out: DoorSlot[] = [];
	const mid = Math.floor(CELL / 2);
	const isRoom = (o: CellOwner): boolean => o.kind === OWNER_ROOM;
	const diff = (a: CellOwner, b: CellOwner): boolean =>
		a.kind !== b.kind || a.id !== b.id;
	const wcx = sx * SECTOR;
	const wcy = sy * SECTOR;

	for (let cy = 0; cy < SECTOR; cy++) {
		for (let cx = 0; cx < SECTOR; cx++) {
			const o = cellOwner.get(sectorCellIndex(cx, cy));
			if (!o) continue;

			const oe =
				cx + 1 < SECTOR
					? cellOwner.get(sectorCellIndex(cx + 1, cy))
					: undefined;
			if (oe && diff(o, oe) && (isRoom(o) || isRoom(oe))) {
				const bc = (cx + 1) * CELL;
				for (let k = 0; k < CELL; k++)
					tiles[(cy * CELL + k) * cols + bc] =
						k === mid ? ARCH : WALL;
				if (seamKept(seed, wcx + cx, wcy + cy, wcx + cx + 1, wcy + cy))
					out.push({ lc: bc, lr: cy * CELL + mid, axis: 'x' });
			}

			const os =
				cy + 1 < SECTOR
					? cellOwner.get(sectorCellIndex(cx, cy + 1))
					: undefined;
			if (os && diff(o, os) && (isRoom(o) || isRoom(os))) {
				const br = (cy + 1) * CELL;
				for (let k = 0; k < CELL; k++)
					tiles[br * cols + cx * CELL + k] = k === mid ? ARCH : WALL;
				if (seamKept(seed, wcx + cx, wcy + cy, wcx + cx, wcy + cy + 1))
					out.push({ lc: cx * CELL + mid, lr: br, axis: 'z' });
			}
		}
	}
	return out;
}

// Doors on a hash-selected subset of sector-border connector gates. Only the E and
// S gates emit, so the smaller-coord sector of each shared border owns the single
// leaf (its neighbour's mirrored W/N gate stays a plain arch). Narrows the 3-wide
// gate carveConnectorGates opened down to its centre so a leaf seats in it.
function genConnectorDoors(
	tiles: Uint8Array,
	cols: number,
	connectors: Connector[],
	seed: number,
	sx: number,
	sy: number,
): DoorSlot[] {
	const out: DoorSlot[] = [];
	const mid = Math.floor(CELL / 2);
	for (const c of connectors) {
		// The E/S sector owns the leaf; W/N mirrors must still narrow their side
		// of the gate, or the flank walls have no outward face (nobody generates
		// it: the owner's grid ends at the border and the mirror's ARCH tiles
		// skip their OOB faces) and the seam reads as a hole from the hall.
		// Both sides derive the same verdict from the owner's hash.
		const osx = c.side === SIDE_W ? sx - 1 : sx;
		const osy = c.side === SIDE_N ? sy - 1 : sy;
		const oside =
			c.side === SIDE_W ? SIDE_E : c.side === SIDE_N ? SIDE_S : c.side;
		if (hash01(osx, osy, ((seed | 0) ^ 0xc0d) + oside) >= DOOR_KEEP)
			continue;
		const baseCol = c.lx * CELL;
		const baseRow = c.ly * CELL;
		if (c.side === SIDE_E || c.side === SIDE_W) {
			const tc = c.side === SIDE_E ? baseCol + CELL - 1 : baseCol;
			for (let k = -GATE_HALF; k <= GATE_HALF; k++)
				tiles[(baseRow + mid + k) * cols + tc] = k === 0 ? ARCH : WALL;
			if (c.side === SIDE_E)
				out.push({ lc: tc, lr: baseRow + mid, axis: 'x' });
		} else {
			const tr = c.side === SIDE_S ? baseRow + CELL - 1 : baseRow;
			for (let k = -GATE_HALF; k <= GATE_HALF; k++)
				tiles[tr * cols + baseCol + mid + k] = k === 0 ? ARCH : WALL;
			if (c.side === SIDE_S)
				out.push({ lc: baseCol + mid, lr: tr, axis: 'z' });
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
	const doorways = genDoorways(tiles, cols, sector.cellOwner, seed, sx, sy);
	doorways.push(
		...genConnectorDoors(tiles, cols, sector.connectors, seed, sx, sy),
	);

	const oases = genOases(sector, tiles, cols, seed);
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
		doorways,
		oases,
	};
}

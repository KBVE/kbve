/**
 * Deterministic procedural maps — byte-for-byte identical to the Rust
 * generator (packages/rust/simgrid/src/dungeon.rs). Same Mulberry32 PRNG +
 * same carve/placement order, so the server only sends a seed and the client
 * reproduces the exact layout for render + prediction.
 *
 * Generators emit a semantic **role grid** (TileRole, matching mapdb). The
 * collision bitset derives from the role via roleBlocks (parity-frozen). A
 * per-biome TilePalette resolves role -> render gid — presentation only, so
 * the same seed restyles per location without touching collision.
 */

export const DUNGEON_W = 48;
export const DUNGEON_H = 48;
const MAX_ROOMS = 14;
const ROOM_MIN = 4;
const ROOM_MAX = 9;

const TILE_SIZE = 16;

/** Semantic tile roles — values match the mapdb TileRole proto enum. */
export const Role = {
	UNSPECIFIED: 0,
	GROUND: 1,
	PLAZA: 2,
	ROAD: 3,
	GRASS: 4,
	WALL: 5,
	ROOF: 6,
	DOOR: 7,
	WATER: 8,
	PROP: 9,
	PROP_SOLID: 10,
	VOID: 11,
} as const;

const BLOCKING = new Set<number>([
	Role.WALL,
	Role.ROOF,
	Role.WATER,
	Role.PROP_SOLID,
	Role.VOID,
]);

/** Single source of truth for collision — mirrors Rust role_blocks. */
export function roleBlocks(r: number): boolean {
	return BLOCKING.has(r);
}

function blockedFromRoles(roles: number[]): boolean[] {
	return roles.map(roleBlocks);
}

export interface Room {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Dungeon {
	width: number;
	height: number;
	roles: number[];
	blocked: boolean[];
	spawn: { x: number; y: number };
	rooms: Room[];
}

export interface Town {
	width: number;
	height: number;
	roles: number[];
	blocked: boolean[];
	spawn: { x: number; y: number };
	buildings: Room[];
}

/** Mulberry32 — must match the Rust port exactly (32-bit wrapping). */
function mulberry32(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
		t = (t ^ (t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0))) >>> 0;
		return (t ^ (t >>> 14)) >>> 0;
	};
}

export function generateDungeon(
	seed: number,
	width = DUNGEON_W,
	height = DUNGEON_H,
): Dungeon {
	const next = mulberry32(seed);
	const range = (lo: number, hi: number) => {
		const span = Math.max(hi - lo + 1, 1);
		return lo + (next() % span);
	};
	const roles = new Array<number>(width * height).fill(Role.WALL);
	const rooms: Room[] = [];
	const carve = (x: number, y: number) => {
		if (x >= 0 && x < width && y >= 0 && y < height)
			roles[y * width + x] = Role.GROUND;
	};

	for (let i = 0; i < MAX_ROOMS; i++) {
		const rw = range(ROOM_MIN, ROOM_MAX);
		const rh = range(ROOM_MIN, ROOM_MAX);
		const rx = range(1, width - rw - 1);
		const ry = range(1, height - rh - 1);
		const overlaps = rooms.some(
			(o) =>
				rx < o.x + o.w + 1 &&
				rx + rw + 1 > o.x &&
				ry < o.y + o.h + 1 &&
				ry + rh + 1 > o.y,
		);
		if (overlaps && rooms.length > 0) continue;

		for (let yy = ry; yy < ry + rh; yy++)
			for (let xx = rx; xx < rx + rw; xx++) carve(xx, yy);

		const cx = rx + Math.floor(rw / 2);
		const cy = ry + Math.floor(rh / 2);
		const prev = rooms[rooms.length - 1];
		if (prev) {
			const px = prev.x + Math.floor(prev.w / 2);
			const py = prev.y + Math.floor(prev.h / 2);
			const hCorr = (x1: number, x2: number, y: number) => {
				for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
					carve(x, y);
			};
			const vCorr = (y1: number, y2: number, x: number) => {
				for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
					carve(x, y);
			};
			if ((next() & 1) === 0) {
				hCorr(px, cx, py);
				vCorr(py, cy, cx);
			} else {
				vCorr(py, cy, px);
				hCorr(px, cx, cy);
			}
		}
		rooms.push({ x: rx, y: ry, w: rw, h: rh });
	}

	const first = rooms[0];
	return {
		width,
		height,
		roles,
		blocked: blockedFromRoles(roles),
		spawn: {
			x: first.x + Math.floor(first.w / 2),
			y: first.y + Math.floor(first.h / 2),
		},
		rooms,
	};
}

export const TOWN_W = 60;
export const TOWN_H = 60;
const TOWN_CELL = 10;
const TOWN_MARGIN = 2;
const TOWN_PLAZA_R = 7;
const TOWN_EMPTY_PCT = 25;

export function generateTown(
	seed: number,
	width = TOWN_W,
	height = TOWN_H,
): Town {
	const next = mulberry32(seed);
	const range = (lo: number, hi: number) => {
		const span = Math.max(hi - lo + 1, 1);
		return lo + (next() % span);
	};
	const roles = new Array<number>(width * height).fill(Role.GROUND);
	const buildings: Room[] = [];
	const ccx = Math.floor(width / 2);
	const ccy = Math.floor(height / 2);
	const maxB = Math.max(TOWN_CELL - 2 * TOWN_MARGIN, 3);
	const inPlaza = (x: number, y: number) =>
		Math.max(Math.abs(x - ccx), Math.abs(y - ccy)) <= TOWN_PLAZA_R;

	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++)
			if (inPlaza(x, y)) roles[y * width + x] = Role.PLAZA;

	const cols = Math.floor(width / TOWN_CELL);
	const rows = Math.floor(height / TOWN_CELL);
	for (let gy = 0; gy < rows; gy++) {
		for (let gx = 0; gx < cols; gx++) {
			const ox = gx * TOWN_CELL;
			const oy = gy * TOWN_CELL;
			const bw = range(3, maxB);
			const bh = range(3, maxB);
			const bxj = range(0, Math.max(TOWN_CELL - 2 * TOWN_MARGIN - bw, 0));
			const byj = range(0, Math.max(TOWN_CELL - 2 * TOWN_MARGIN - bh, 0));
			const empty = next() % 100 < TOWN_EMPTY_PCT;

			const bx = ox + TOWN_MARGIN + bxj;
			const by = oy + TOWN_MARGIN + byj;
			const bcx = bx + Math.floor(bw / 2);
			const bcy = by + Math.floor(bh / 2);
			if (bx + bw >= width || by + bh >= height || inPlaza(bcx, bcy))
				continue;
			if (empty) {
				roles[bcy * width + bcx] = Role.PROP_SOLID;
				continue;
			}
			for (let y = by; y < by + bh; y++)
				for (let x = bx; x < bx + bw; x++) {
					const edge =
						x === bx ||
						x === bx + bw - 1 ||
						y === by ||
						y === by + bh - 1;
					roles[y * width + x] = edge ? Role.WALL : Role.ROOF;
				}
			buildings.push({ x: bx, y: by, w: bw, h: bh });
		}
	}

	return {
		width,
		height,
		roles,
		blocked: blockedFromRoles(roles),
		spawn: { x: ccx, y: ccy },
		buildings,
	};
}

/** FNV-1a over the role grid — canonical cross-language parity fingerprint. */
export function fingerprintRoles(roles: number[]): number {
	let h = 0x811c9dc5;
	for (const r of roles) {
		h = (h ^ (r & 0xff)) >>> 0;
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h >>> 0;
}

/** FNV-1a over the blocked bitset — collision parity. */
export function fingerprint(blocked: boolean[]): number {
	let h = 0x811c9dc5;
	for (const b of blocked) {
		h = (h ^ (b ? 1 : 0)) >>> 0;
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h >>> 0;
}

// =============================================================================
// Tile palettes — a TilePalette maps each TileRole to dense gid variants in a
// packed per-biome atlas. Generated by gen-palette-atlas.mjs, which sources
// tiles from the tiledb catalog (one MDX per tile); loaded here, never
// hand-authored. Presentation only — collision authority lives in the role
// grid; the per-gid `collision`/`animations` maps are render-side hints
// carried through from the catalog.
// =============================================================================

import cityPaletteJson from './palettes/cloud-city.palette.json';
import dungeonPaletteJson from './palettes/dungeon.palette.json';

export interface TileAnimation {
	frames: number[];
	frameDurations?: number[];
	loop?: boolean;
}

export interface TilePalette {
	ref: string;
	name: string;
	biome: string;
	tileSize: number;
	tilesetImage: string;
	tilesetColumns: number;
	entries: Record<number, number[]>;
	animations?: Record<number, TileAnimation>;
	collision?: Record<number, boolean>;
}

export const CITY_PALETTE = cityPaletteJson as TilePalette;
export const DUNGEON_PALETTE = dungeonPaletteJson as TilePalette;

/** Deterministic per-tile variant pick — stable, client-only (no parity). */
function variant(gids: number[] | undefined, x: number, y: number): number {
	if (!gids || gids.length === 0) return 0;
	if (gids.length === 1) return gids[0];
	const h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
	return gids[h % gids.length];
}

/** Resolve a role grid to a render gid layer through a palette. */
export function resolveLayer(
	roles: number[],
	width: number,
	palette: TilePalette,
): number[] {
	const { entries } = palette;
	return roles.map((role, i) =>
		variant(
			entries[role] ?? entries[Role.GROUND],
			i % width,
			Math.floor(i / width),
		),
	);
}

function gridTilemap(
	ref: string,
	name: string,
	width: number,
	height: number,
	roles: number[],
	blocked: boolean[],
	spawn: { x: number; y: number },
	regions: Array<{ name: string } & Room>,
	palette: TilePalette,
) {
	return {
		ref,
		name,
		width,
		height,
		tileSize: TILE_SIZE,
		spawn,
		blocked,
		layers: [{ name: 'floor', data: resolveLayer(roles, width, palette) }],
		regions,
		tilesetImage: palette.tilesetImage,
		tilesetColumns: palette.tilesetColumns,
	};
}

/** Build a GridTilemap from a town seed, styled with the city palette. */
export function townTilemap(seed: number, palette: TilePalette = CITY_PALETTE) {
	const t = generateTown(seed);
	return gridTilemap(
		`town-${seed}`,
		'Procedural Town',
		t.width,
		t.height,
		t.roles,
		t.blocked,
		t.spawn,
		t.buildings.map((b, i) => ({ name: `Building ${i + 1}`, ...b })),
		palette,
	);
}

/** Build a GridTilemap from a dungeon seed, styled with the dungeon palette. */
export function dungeonTilemap(
	seed: number,
	palette: TilePalette = DUNGEON_PALETTE,
) {
	const d = generateDungeon(seed);
	return gridTilemap(
		`dungeon-${seed}`,
		'Procedural Dungeon',
		d.width,
		d.height,
		d.roles,
		d.blocked,
		d.spawn,
		d.rooms.map((r, i) => ({ name: `Chamber ${i + 1}`, ...r })),
		palette,
	);
}

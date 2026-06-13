/**
 * Deterministic procedural dungeon — byte-for-byte identical to the Rust
 * generator (packages/rust/simgrid/src/dungeon.rs). Same Mulberry32 PRNG +
 * same rooms/L-corridor carve order, so the server only sends a seed and
 * the client reproduces the exact dungeon for render + prediction.
 *
 * Parity is gated by dungeon.test.ts against the Rust fingerprint.
 */

export const DUNGEON_W = 48;
export const DUNGEON_H = 48;
const MAX_ROOMS = 14;
const ROOM_MIN = 4;
const ROOM_MAX = 9;

// Render gids sampled from cloud_tileset (floor/wall) so the dungeon draws
// with the live atlas — matches gen_dungeon.py.
const FLOOR_GID = 368;
const WALL_GID = 363;
const TILE_SIZE = 16;

export interface Room {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Dungeon {
	width: number;
	height: number;
	blocked: boolean[];
	spawn: { x: number; y: number };
	rooms: Room[];
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
	const blocked = new Array<boolean>(width * height).fill(true);
	const rooms: Room[] = [];
	const carve = (x: number, y: number) => {
		if (x >= 0 && x < width && y >= 0 && y < height)
			blocked[y * width + x] = false;
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
		blocked,
		spawn: {
			x: first.x + Math.floor(first.w / 2),
			y: first.y + Math.floor(first.h / 2),
		},
		rooms,
	};
}

/** FNV-1a over the blocked bitset — cross-language parity fingerprint. */
export function fingerprint(blocked: boolean[]): number {
	let h = 0x811c9dc5;
	for (const b of blocked) {
		h = (h ^ (b ? 1 : 0)) >>> 0;
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h >>> 0;
}

/** Build a GridTilemap (the shape the scene renders) from a dungeon seed. */
export function dungeonTilemap(seed: number) {
	const d = generateDungeon(seed);
	const data = d.blocked.map((b) => (b ? WALL_GID : FLOOR_GID));
	return {
		ref: `dungeon-${seed}`,
		name: 'Procedural Dungeon',
		width: d.width,
		height: d.height,
		tileSize: TILE_SIZE,
		spawn: d.spawn,
		blocked: d.blocked,
		layers: [{ name: 'floor', data }],
		regions: d.rooms.map((r, i) => ({
			name: `Chamber ${i + 1}`,
			x: r.x,
			y: r.y,
			w: r.w,
			h: r.h,
		})),
		tilesetColumns: 45,
	};
}

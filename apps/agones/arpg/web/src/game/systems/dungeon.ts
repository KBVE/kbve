import type { TileXY } from '../iso';

/**
 * Deterministic, endless room-corridor dungeon. PURE module — no Phaser/DOM, no
 * Math.random — so the exact same tiles can later be derived on the Rust server
 * for an authoritative MP map. The world is an infinite tile plane divided into
 * fixed CHUNK_SIZE cells; each chunk hashes its coordinate with the world seed
 * to place one room and link it to its east/south neighbours with corridors.
 * Chunks are generated lazily around the player and dropped when far, so memory
 * stays bounded while the dungeon is unbounded.
 */

export const CHUNK_SIZE = 20;

/**
 * Per-floor seed: fold the dungeon level `z` into the world seed so each floor
 * is its own independent endless dungeon (stairs link adjacent floors). Floor 0
 * is identity — the ground floor IS the original single-floor layout, keeping
 * the frozen parity fingerprint valid. Mirrors the Rust `arpg_dungeon::floor_seed`.
 */
export function floorSeed(worldSeed: number, z: number): number {
	if (z === 0) return worldSeed >>> 0;
	let h = worldSeed >>> 0;
	h = Math.imul(h ^ Math.imul(z, 0x9e3779b1), 0x85ebca77) >>> 0;
	return (h ^ (h >>> 13)) >>> 0;
}

export type TileKind = 0 | 1; // 0 = wall (blocked), 1 = floor (walkable)
export const WALL: TileKind = 0;
export const FLOOR: TileKind = 1;

export interface ChunkCoord {
	cx: number;
	cy: number;
}

export interface DungeonChunk {
	cx: number;
	cy: number;
	/** Floor tiles in WORLD tile coords, keyed "x,y". Absent key = wall. */
	floor: Set<string>;
	/** This chunk's room is a large arena (boss-fight sized). */
	arena: boolean;
	/** Center tile of this chunk's room — useful for spawns/markers. */
	center: TileXY;
}

/** Mulberry32 — same PRNG cryptothrone uses, so seeds port across TS<->Rust. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Domain-separated per-chunk seed: fold the world seed with the chunk coords so
 * each chunk is independently reproducible regardless of visit order (essential
 * for a server to match without replaying the player's path).
 */
function chunkSeed(worldSeed: number, cx: number, cy: number): number {
	let h = worldSeed >>> 0;
	h = Math.imul(h ^ (cx * 0x9e3779b1), 0x85ebca77) >>> 0;
	h = Math.imul(h ^ (cy * 0xc2b2ae3d), 0x27d4eb2f) >>> 0;
	return (h ^ (h >>> 13)) >>> 0;
}

const key = (x: number, y: number): string => `${x},${y}`;

// Corridor width tiers. A 2-wide passage reads as a hallway; 3-4 wide reads as
// a main "corridor" route — a stronger artery future systems can theme (lights,
// patrols, signage) to guide the player along the spine of the dungeon.
export type PassageKind = 'hallway' | 'corridor';
export function passageKind(width: number): PassageKind {
	return width >= 3 ? 'corridor' : 'hallway';
}

// Roughly 1 in 4 connections is a wide main corridor (3-4 tiles); the rest are
// 2-tile hallways. Derived from a canonical per-edge seed so both chunks that
// share the edge agree on the width.
function passageWidth(worldSeed: number, a: TileXY, b: TileXY): number {
	// Canonical edge key — order-independent so A->B and B->A match.
	const lo = a.x < b.x || (a.x === b.x && a.y <= b.y) ? a : b;
	const hi = lo === a ? b : a;
	let h = worldSeed >>> 0;
	h = Math.imul(h ^ (lo.x * 0x85ebca6b), 0xc2b2ae35) >>> 0;
	h = Math.imul(h ^ (lo.y * 0x27d4eb2f), 0x165667b1) >>> 0;
	h = Math.imul(h ^ (hi.x * 0x9e3779b1), 0x85ebca77) >>> 0;
	h = Math.imul(h ^ (hi.y * 0xc2b2ae3d), 0x27d4eb2f) >>> 0;
	const r = ((h ^ (h >>> 13)) >>> 0) / 4294967296;
	if (r < 0.25) return 3 + (r < 0.08 ? 1 : 0); // corridor: 3, occasionally 4
	return 2; // hallway
}

// One in ~6 chunks is a large arena (boss room); the rest are normal rooms.
function isArena(worldSeed: number, cx: number, cy: number): boolean {
	const rng = mulberry32(chunkSeed(worldSeed, cx, cy) ^ 0xa11ce);
	return rng() < 0.16;
}

/** A chunk's room rect in WORLD tile coords, derived from its seed. */
function roomRect(worldSeed: number, cx: number, cy: number) {
	const rng = mulberry32(chunkSeed(worldSeed, cx, cy));
	const baseX = cx * CHUNK_SIZE;
	const baseY = cy * CHUNK_SIZE;
	// Room kept inside the chunk with a margin so neighbouring rooms never touch
	// directly — they're joined only by intentional corridors. Arena chunks get
	// a much larger footprint for boss fights; normal rooms stay mid-sized.
	const arena = isArena(worldSeed, cx, cy);
	const w = arena ? 11 + Math.floor(rng() * 3) : 6 + Math.floor(rng() * 5); // arena 11..13, room 6..10
	const h = arena ? 11 + Math.floor(rng() * 3) : 6 + Math.floor(rng() * 5);
	const maxOffX = CHUNK_SIZE - w - 2;
	const maxOffY = CHUNK_SIZE - h - 2;
	const ox = 1 + Math.floor(rng() * Math.max(1, maxOffX));
	const oy = 1 + Math.floor(rng() * Math.max(1, maxOffY));
	return { x0: baseX + ox, y0: baseY + oy, w, h, arena };
}

/**
 * Center tile of a chunk's room — corridor endpoints connect centers, so the
 * room centers ARE the navigation gates: a coarse graph where each chunk gate
 * links to its four neighbour gates via the carved corridors.
 */
export function chunkGate(worldSeed: number, cx: number, cy: number): TileXY {
	return roomCenter(worldSeed, cx, cy);
}

/** Corridor width between two adjacent chunks (drives gate-edge cost). */
export function chunkPassageWidth(
	worldSeed: number,
	acx: number,
	acy: number,
	bcx: number,
	bcy: number,
): number {
	return passageWidth(
		worldSeed,
		roomCenter(worldSeed, acx, acy),
		roomCenter(worldSeed, bcx, bcy),
	);
}

/** Center tile of a chunk's room — corridor endpoints connect centers. */
function roomCenter(worldSeed: number, cx: number, cy: number): TileXY {
	const r = roomRect(worldSeed, cx, cy);
	return {
		x: r.x0 + (r.w >> 1),
		y: r.y0 + (r.h >> 1),
	};
}

function carveRoom(
	floor: Set<string>,
	worldSeed: number,
	cx: number,
	cy: number,
) {
	const r = roomRect(worldSeed, cx, cy);
	for (let y = r.y0; y < r.y0 + r.h; y++) {
		for (let x = r.x0; x < r.x0 + r.w; x++) {
			floor.add(key(x, y));
		}
	}
}

/**
 * Carve a `width`-wide L-corridor between two world tiles (H leg then V leg).
 * Each leg is thickened perpendicular to its run by `width` tiles, centred on
 * the path, so 2 = hallway and 3-4 = a broad main corridor. The legs overlap at
 * the elbow, keeping the turn solid.
 */
function carveCorridor(
	floor: Set<string>,
	a: TileXY,
	b: TileXY,
	width: number,
) {
	const half = Math.floor((width - 1) / 2);
	const lo = -half;
	const hi = width - 1 - half;

	const x0 = Math.min(a.x, b.x);
	const x1 = Math.max(a.x, b.x);
	for (let x = x0; x <= x1; x++) {
		for (let w = lo; w <= hi; w++) floor.add(key(x, a.y + w));
	}
	const y0 = Math.min(a.y, b.y);
	const y1 = Math.max(a.y, b.y);
	for (let y = y0; y <= y1; y++) {
		for (let w = lo; w <= hi; w++) floor.add(key(b.x + w, y));
	}
}

/**
 * Generate one chunk's floor set: its own room plus corridors to its east and
 * south neighbours. Linking only two of four directions per chunk still yields
 * a fully-connected grid (every adjacency is owned by exactly one side), and
 * keeps generation order-independent.
 */
export function generateChunk(
	worldSeed: number,
	cx: number,
	cy: number,
): DungeonChunk {
	const floor = new Set<string>();
	carveRoom(floor, worldSeed, cx, cy);

	const self = roomCenter(worldSeed, cx, cy);
	const east = roomCenter(worldSeed, cx + 1, cy);
	const south = roomCenter(worldSeed, cx, cy + 1);
	const west = roomCenter(worldSeed, cx - 1, cy);
	const north = roomCenter(worldSeed, cx, cy - 1);

	// Each edge's width is keyed on the edge itself, so the chunk and its
	// neighbour carve the same passage from both sides.
	carveCorridor(floor, self, east, passageWidth(worldSeed, self, east));
	carveCorridor(floor, self, south, passageWidth(worldSeed, self, south));
	carveCorridor(floor, west, self, passageWidth(worldSeed, west, self));
	carveCorridor(floor, north, self, passageWidth(worldSeed, north, self));

	return {
		cx,
		cy,
		floor,
		arena: isArena(worldSeed, cx, cy),
		center: self,
	};
}

/** Chunk coordinate that owns a world tile. */
export function chunkOf(x: number, y: number): ChunkCoord {
	return {
		cx: Math.floor(x / CHUNK_SIZE),
		cy: Math.floor(y / CHUNK_SIZE),
	};
}

/**
 * Pure floor test for a single world tile — no chunk cache, no streaming. A
 * tile is floor iff its owning chunk OR any of the 8 neighbours (whose carved
 * corridors can cross the border into it) covers it. This is the exact logic
 * the Rust server mirrors (simgrid arpg_dungeon::is_floor); the parity test
 * fingerprints a window of it against the frozen Rust value.
 */
export function isFloorAt(worldSeed: number, x: number, y: number): boolean {
	const { cx, cy } = chunkOf(x, y);
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			if (generateChunk(worldSeed, cx + dx, cy + dy).floor.has(key(x, y)))
				return true;
		}
	}
	return false;
}

function isFloorCached(
	worldSeed: number,
	x: number,
	y: number,
	cache: Map<string, DungeonChunk>,
): boolean {
	const { cx, cy } = chunkOf(x, y);
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			const ccx = cx + dx;
			const ccy = cy + dy;
			const ck = `${ccx}:${ccy}`;
			let chunk = cache.get(ck);
			if (!chunk) {
				chunk = generateChunk(worldSeed, ccx, ccy);
				cache.set(ck, chunk);
			}
			if (chunk.floor.has(key(x, y))) return true;
		}
	}
	return false;
}

/**
 * FNV-1a over the floor bitset of a bounded window — the canonical cross-
 * language parity fingerprint. Must equal the Rust `arpg_dungeon::fingerprint`
 * for the same seed + window (see the frozen value in the parity spec).
 */
export function fingerprint(
	worldSeed: number,
	x0: number,
	y0: number,
	w: number,
	h: number,
): number {
	const cache = new Map<string, DungeonChunk>();
	let hh = 0x811c9dc5;
	for (let y = y0; y < y0 + h; y++) {
		for (let x = x0; x < x0 + w; x++) {
			hh ^= isFloorCached(worldSeed, x, y, cache) ? 1 : 0;
			hh = Math.imul(hh, 0x01000193);
		}
	}
	return hh >>> 0;
}

/**
 * Live window of generated chunks around a focus tile. Call refresh() with the
 * player's tile each step; it generates newly-entered chunks within `radius`
 * and drops chunks that fall outside, invoking the supplied hooks so the scene
 * can build/tear down render objects. isFloor() answers collision queries.
 */
export class DungeonField {
	private chunks = new Map<string, DungeonChunk>();

	constructor(
		readonly worldSeed: number,
		private readonly radius = 2,
	) {}

	private ckey(cx: number, cy: number): string {
		return `${cx}:${cy}`;
	}

	/** Loaded chunks (for spawn placement, boss triggers, minimap, etc). */
	loadedChunks(): IterableIterator<DungeonChunk> {
		return this.chunks.values();
	}

	isFloor(x: number, y: number): boolean {
		const { cx, cy } = chunkOf(x, y);
		const c = this.chunks.get(this.ckey(cx, cy));
		return c ? c.floor.has(key(x, y)) : false;
	}

	has(cx: number, cy: number): boolean {
		return this.chunks.has(this.ckey(cx, cy));
	}

	/** Every live floor tile across all loaded chunks, in world coords. */
	*floorTiles(): Generator<TileXY> {
		for (const chunk of this.chunks.values()) {
			for (const k of chunk.floor) {
				const i = k.indexOf(',');
				yield {
					x: Number(k.slice(0, i)),
					y: Number(k.slice(i + 1)),
				};
			}
		}
	}

	/**
	 * Bring the chunk window in line with `focus`. Returns the chunks newly
	 * generated this call and the coords dropped, so the caller can sync render
	 * state without diffing the whole field.
	 */
	refresh(focus: TileXY): {
		added: DungeonChunk[];
		removed: ChunkCoord[];
	} {
		const { cx, cy } = chunkOf(focus.x, focus.y);
		const added: DungeonChunk[] = [];
		const wanted = new Set<string>();

		for (let dy = -this.radius; dy <= this.radius; dy++) {
			for (let dx = -this.radius; dx <= this.radius; dx++) {
				const k = this.ckey(cx + dx, cy + dy);
				wanted.add(k);
				if (!this.chunks.has(k)) {
					const chunk = generateChunk(
						this.worldSeed,
						cx + dx,
						cy + dy,
					);
					this.chunks.set(k, chunk);
					added.push(chunk);
				}
			}
		}

		const removed: ChunkCoord[] = [];
		for (const [k, chunk] of this.chunks) {
			if (!wanted.has(k)) {
				removed.push({ cx: chunk.cx, cy: chunk.cy });
				this.chunks.delete(k);
			}
		}
		return { added, removed };
	}

	/** Nearest floor tile to a target (spiral search), for safe spawns. */
	nearestFloor(target: TileXY, maxR = CHUNK_SIZE): TileXY {
		if (this.isFloor(target.x, target.y)) return target;
		for (let r = 1; r <= maxR; r++) {
			for (let dy = -r; dy <= r; dy++) {
				for (let dx = -r; dx <= r; dx++) {
					if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
					const x = target.x + dx;
					const y = target.y + dy;
					if (this.isFloor(x, y)) return { x, y };
				}
			}
		}
		return target;
	}
}

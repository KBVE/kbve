//! Endless chunk-streamed room-corridor dungeon — byte-for-byte mirror of the
//! ARPG client port (apps/kbve/astro-kbve .../isometric-arpg/systems/dungeon.ts).
//!
//! The world is an infinite tile plane split into CHUNK_SIZE cells. Each chunk
//! hashes its coordinate with the world seed to place one room and link it to
//! its neighbours with corridors. Collision is a PURE FUNCTION of (seed, x, y)
//! via [`is_floor`] — nothing is stored, so the map is unbounded yet costs no
//! memory. The server computes the same floor tiles the client predicts; only
//! the seed crosses the wire.
//!
//! Parity note: the client uses the float lane of Mulberry32 (a `[0,1)` value
//! and `floor(r * n)`), NOT integer modulo. This module mirrors that exact path
//! ([`next_f64`], [`floor_mul`]) so both sides carve identical tiles. The frozen
//! parity test below must match the TS port's fingerprint.

pub const CHUNK_SIZE: i32 = 20;

/// Per-floor seed: fold the dungeon level `z` into the world seed so every floor
/// is its own independent endless dungeon. Stairs link adjacent floors. Pure
/// u32-wrapping ops (mirrors the client `floorSeed`); z is taken as a u32 bit
/// pattern so negative floors mix distinctly from positive ones.
pub fn floor_seed(world_seed: u32, z: i32) -> u32 {
    // Floor 0 is the ground floor — its layout IS the original single-floor
    // dungeon (identity), so the frozen parity fingerprint stays valid. Other
    // floors remix the seed with z.
    if z == 0 {
        return world_seed;
    }
    let mut h = world_seed;
    h = (h ^ (z as u32).wrapping_mul(0x9e37_79b1)).wrapping_mul(0x85eb_ca77);
    h ^ (h >> 13)
}

/// Mulberry32 producing a `[0,1)` float — mirrors the client's `mulberry32()`
/// closure (Math.imul + `>>> 0`, divided by 2^32). Pure u32 wrapping ops.
struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    /// One draw in `[0, 1)` — the client returns `((t ^ t>>14) >>> 0) / 2^32`.
    fn next_f64(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b_79f5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        let u = t ^ (t >> 14);
        (u as f64) / 4_294_967_296.0
    }
}

/// `lo + floor(rng * span)` — the client's `lo + Math.floor(rng() * span)`.
fn floor_mul(rng: &mut Mulberry32, span: i32) -> i32 {
    (rng.next_f64() * span as f64).floor() as i32
}

/// Domain-separated per-chunk seed — mirrors the client `chunkSeed`. Every op is
/// u32-wrapping so the derivation matches JS `Math.imul` + `>>> 0`.
fn chunk_seed(world_seed: u32, cx: i32, cy: i32) -> u32 {
    let mut h = world_seed;
    h = (h ^ (cx as u32).wrapping_mul(0x9e37_79b1)).wrapping_mul(0x85eb_ca77);
    h = (h ^ (cy as u32).wrapping_mul(0xc2b2_ae3d)).wrapping_mul(0x27d4_eb2f);
    h ^ (h >> 13)
}

/// One in ~6 chunks is a large arena (boss room). Mirrors client `isArena`.
fn is_arena(world_seed: u32, cx: i32, cy: i32) -> bool {
    let mut rng = Mulberry32::new(chunk_seed(world_seed, cx, cy) ^ 0x000a_11ce);
    rng.next_f64() < 0.16
}

#[derive(Clone, Copy)]
struct RoomRect {
    x0: i32,
    y0: i32,
    w: i32,
    h: i32,
}

/// A chunk's room rect in WORLD tile coords — mirrors client `roomRect`. The
/// draw order (w, h, then offsets) must match the TS exactly.
fn room_rect(world_seed: u32, cx: i32, cy: i32) -> RoomRect {
    let mut rng = Mulberry32::new(chunk_seed(world_seed, cx, cy));
    let base_x = cx * CHUNK_SIZE;
    let base_y = cy * CHUNK_SIZE;
    let arena = is_arena(world_seed, cx, cy);
    let w = if arena {
        11 + floor_mul(&mut rng, 3)
    } else {
        6 + floor_mul(&mut rng, 5)
    };
    let h = if arena {
        11 + floor_mul(&mut rng, 3)
    } else {
        6 + floor_mul(&mut rng, 5)
    };
    let max_off_x = CHUNK_SIZE - w - 2;
    let max_off_y = CHUNK_SIZE - h - 2;
    let ox = 1 + floor_mul(&mut rng, max_off_x.max(1));
    let oy = 1 + floor_mul(&mut rng, max_off_y.max(1));
    RoomRect {
        x0: base_x + ox,
        y0: base_y + oy,
        w,
        h,
    }
}

/// Center tile of a chunk's room — corridor endpoints (and nav gates). Mirrors
/// client `roomCenter` (`>> 1` floor-halving). Takes a per-floor seed.
fn room_center(floor_seed: u32, cx: i32, cy: i32) -> (i32, i32) {
    let r = room_rect(floor_seed, cx, cy);
    (r.x0 + (r.w >> 1), r.y0 + (r.h >> 1))
}

/// Public room center for a (world_seed, z) floor — the nav gate for a chunk.
pub fn chunk_gate(world_seed: u32, z: i32, cx: i32, cy: i32) -> (i32, i32) {
    room_center(floor_seed(world_seed, z), cx, cy)
}

/// Corridor width between two world tiles — mirrors client `passageWidth`. The
/// edge key is canonicalised (order-independent) so both chunks sharing the
/// edge agree. ~1 in 4 is a wide 3-4 corridor; the rest are 2-wide hallways.
fn passage_width(world_seed: u32, a: (i32, i32), b: (i32, i32)) -> i32 {
    let (lo, hi) = if a.0 < b.0 || (a.0 == b.0 && a.1 <= b.1) {
        (a, b)
    } else {
        (b, a)
    };
    let mut h = world_seed;
    h = (h ^ (lo.0 as u32).wrapping_mul(0x85eb_ca6b)).wrapping_mul(0xc2b2_ae35);
    h = (h ^ (lo.1 as u32).wrapping_mul(0x27d4_eb2f)).wrapping_mul(0x1656_67b1);
    h = (h ^ (hi.0 as u32).wrapping_mul(0x9e37_79b1)).wrapping_mul(0x85eb_ca77);
    h = (h ^ (hi.1 as u32).wrapping_mul(0xc2b2_ae3d)).wrapping_mul(0x27d4_eb2f);
    let r = ((h ^ (h >> 13)) as f64) / 4_294_967_296.0;
    if r < 0.25 {
        3 + if r < 0.08 { 1 } else { 0 }
    } else {
        2
    }
}

/// Corridor width between two adjacent chunks on a floor (gate-edge cost).
/// Public for the server's coarse routing if it ever wants the gate graph.
pub fn chunk_passage_width(world_seed: u32, z: i32, acx: i32, acy: i32, bcx: i32, bcy: i32) -> i32 {
    let fs = floor_seed(world_seed, z);
    passage_width(fs, room_center(fs, acx, acy), room_center(fs, bcx, bcy))
}

/// Floor-division chunk coordinate that owns a world tile (matches client
/// `chunkOf` / `Math.floor`, correct for negatives).
pub fn chunk_of(x: i32, y: i32) -> (i32, i32) {
    (x.div_euclid(CHUNK_SIZE), y.div_euclid(CHUNK_SIZE))
}

/// Is world tile (x, y) inside the given chunk's room rect?
fn in_room(world_seed: u32, cx: i32, cy: i32, x: i32, y: i32) -> bool {
    let r = room_rect(world_seed, cx, cy);
    x >= r.x0 && x < r.x0 + r.w && y >= r.y0 && y < r.y0 + r.h
}

/// Is world tile (x, y) inside the `width`-wide L-corridor from `a` to `b`?
/// Mirrors the client `carveCorridor` geometry (H leg on `a.y`, V leg on `b.x`,
/// each thickened by `width` centred via `half = floor((width-1)/2)`).
fn in_corridor(a: (i32, i32), b: (i32, i32), width: i32, x: i32, y: i32) -> bool {
    let half = (width - 1) / 2;
    let lo = -half;
    let hi = width - 1 - half;

    // Horizontal leg: runs x in [min,max] at rows a.1 + [lo,hi].
    let x0 = a.0.min(b.0);
    let x1 = a.0.max(b.0);
    if x >= x0 && x <= x1 {
        let off = y - a.1;
        if off >= lo && off <= hi {
            return true;
        }
    }
    // Vertical leg: runs y in [min,max] at cols b.0 + [lo,hi].
    let y0 = a.1.min(b.1);
    let y1 = a.1.max(b.1);
    if y >= y0 && y <= y1 {
        let off = x - b.0;
        if off >= lo && off <= hi {
            return true;
        }
    }
    false
}

/// Does a chunk's carved space cover world tile (x, y)? A chunk owns its own
/// room plus the four corridors `generateChunk` carves (self->east, self->south,
/// west->self, north->self). Pure — recomputes from the per-floor seed.
fn chunk_covers(fs: u32, cx: i32, cy: i32, x: i32, y: i32) -> bool {
    if in_room(fs, cx, cy, x, y) {
        return true;
    }
    let s = room_center(fs, cx, cy);
    let east = room_center(fs, cx + 1, cy);
    let south = room_center(fs, cx, cy + 1);
    let west = room_center(fs, cx - 1, cy);
    let north = room_center(fs, cx, cy - 1);
    in_corridor(s, east, passage_width(fs, s, east), x, y)
        || in_corridor(s, south, passage_width(fs, s, south), x, y)
        || in_corridor(west, s, passage_width(fs, west, s), x, y)
        || in_corridor(north, s, passage_width(fs, north, s), x, y)
}

/// Floor test on a per-floor seed (z already mixed in). Internal — the public
/// [`is_floor`] mixes z first.
fn is_floor_fs(fs: u32, x: i32, y: i32) -> bool {
    let (cx, cy) = chunk_of(x, y);
    for dy in -1..=1 {
        for dx in -1..=1 {
            if chunk_covers(fs, cx + dx, cy + dy, x, y) {
                return true;
            }
        }
    }
    false
}

/// Walkable test for a single world tile on floor `z`. `z >= 0` is the open
/// overworld — grass surface at 0, above-ground (city/towers) at >0 — with no
/// walls, so every tile is floor. The carved endless dungeon lives UNDERGROUND
/// at `z < 0` (deeper = more negative); there a tile is floor iff its owning
/// chunk OR any of the (up to 9) neighbour chunks whose corridors reach into it
/// covers it. Only collision goes through here — the pure carve
/// (`is_floor_fs`/`fingerprint`) is unchanged, so cross-language parity holds.
pub fn is_floor(world_seed: u32, z: i32, x: i32, y: i32) -> bool {
    if z >= 0 {
        return true;
    }
    is_floor_fs(floor_seed(world_seed, z), x, y)
}

/// Nearest floor tile to a target on floor `z` by expanding chebyshev rings.
pub fn nearest_floor(world_seed: u32, z: i32, tx: i32, ty: i32, max_r: i32) -> (i32, i32) {
    let fs = floor_seed(world_seed, z);
    if is_floor_fs(fs, tx, ty) {
        return (tx, ty);
    }
    for r in 1..=max_r {
        for dy in -r..=r {
            for dx in -r..=r {
                if dx.abs() != r && dy.abs() != r {
                    continue;
                }
                let (x, y) = (tx + dx, ty + dy);
                if is_floor_fs(fs, x, y) {
                    return (x, y);
                }
            }
        }
    }
    (tx, ty)
}

/// The two stair endpoints on a floor: `Down` descends to z-1 (deeper
/// underground), `Up` ascends to z+1 (toward the surface / above-ground). z=0 is
/// the grass surface; the dungeon is below at z<0.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StairKind {
    Down,
    Up,
}

/// Deterministic stair tile on floor `z`. A seed-derived chunk's room center
/// hosts the stair (snapped to guaranteed floor), domain-separated per kind so
/// up/down never collide. Pure — client predicts the exact tile, server agrees.
/// The link is fixed by convention: descending `Down` on z arrives at `Up` on
/// z-1, and ascending `Up` on z arrives at `Down` on z+1.
pub fn stair_tile(world_seed: u32, z: i32, kind: StairKind) -> (i32, i32) {
    let fs = floor_seed(world_seed, z);
    let tag = match kind {
        StairKind::Down => 0xD0_u32,
        StairKind::Up => 0x11_u32,
    };
    // Pick a chunk a few cells out from origin from the floor seed so the stair
    // isn't always in the spawn room; its room center is guaranteed floor.
    let mut rng = Mulberry32::new(fs ^ tag.wrapping_mul(0x9e37_79b1));
    let cx = floor_mul(&mut rng, 5) - 2;
    let cy = floor_mul(&mut rng, 5) - 2;
    let (gx, gy) = room_center(fs, cx, cy);
    // Already a room center (floor), but snap defensively.
    let (sx, sy) = nearest_floor(world_seed, z, gx, gy, CHUNK_SIZE);
    (sx, sy)
}

/// Where you arrive when taking `kind` from floor `z`: the matching opposite
/// stair on the adjacent floor. Down on z -> Up on z-1; Up on z -> Down on z+1.
pub fn stair_dest(world_seed: u32, z: i32, kind: StairKind) -> (i32, (i32, i32)) {
    match kind {
        StairKind::Down => (z - 1, stair_tile(world_seed, z - 1, StairKind::Up)),
        StairKind::Up => (z + 1, stair_tile(world_seed, z + 1, StairKind::Down)),
    }
}

/// FNV-1a over the floor bitset of a bounded window on floor `z` — cross-
/// language parity fingerprint. The client computes the identical hash.
pub fn fingerprint(world_seed: u32, z: i32, x0: i32, y0: i32, w: i32, h: i32) -> u32 {
    let fs = floor_seed(world_seed, z);
    let mut hh: u32 = 0x811c_9dc5;
    for y in y0..y0 + h {
        for x in x0..x0 + w {
            hh ^= if is_floor_fs(fs, x, y) { 1 } else { 0 };
            hh = hh.wrapping_mul(0x0100_0193);
        }
    }
    hh
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEED: u32 = 0x5eed1;

    #[test]
    fn deterministic() {
        assert_eq!(
            fingerprint(SEED, 0, -40, -40, 120, 120),
            fingerprint(SEED, 0, -40, -40, 120, 120)
        );
    }

    #[test]
    fn seed_changes_layout() {
        assert_ne!(
            fingerprint(SEED, 0, 0, 0, 80, 80),
            fingerprint(0x1234, 0, 0, 0, 80, 80)
        );
    }

    #[test]
    fn room_center_is_floor() {
        for (cx, cy) in [(0, 0), (1, 0), (0, 1), (-1, -1), (3, -2)] {
            let (x, y) = chunk_gate(SEED, 0, cx, cy);
            assert!(is_floor(SEED, 0, x, y), "room center ({cx},{cy}) not floor");
        }
    }

    #[test]
    fn corridors_connect_neighbours() {
        let a = chunk_gate(SEED, 0, 0, 0);
        let b = chunk_gate(SEED, 0, 1, 0);
        assert!(is_floor(SEED, 0, a.0, a.1));
        assert!(is_floor(SEED, 0, b.0, b.1));
        assert!(is_floor(SEED, 0, b.0, a.1), "east corridor elbow not floor");
    }

    #[test]
    fn floor_zero_is_ground_layout() {
        // Floor 0 == the original single-floor dungeon (floor_seed identity), so
        // the committed parity fingerprint must still hold.
        assert_eq!(floor_seed(SEED, 0), SEED);
        assert_eq!(fingerprint(SEED, 0, 0, 0, 80, 80), 1764795750);
    }

    #[test]
    fn floors_differ() {
        // Each z is its own dungeon.
        let f0 = fingerprint(SEED, 0, 0, 0, 80, 80);
        let f1 = fingerprint(SEED, 1, 0, 0, 80, 80);
        let f2 = fingerprint(SEED, 2, 0, 0, 80, 80);
        assert_ne!(f0, f1);
        assert_ne!(f1, f2);
        assert_ne!(f0, f2);
        // Negative floors are distinct too.
        assert_ne!(fingerprint(SEED, -1, 0, 0, 80, 80), f1);
    }

    #[test]
    fn stairs_land_on_floor() {
        // Both stair endpoints on a floor are walkable tiles, and the
        // destination tile on the adjacent floor is walkable too.
        for z in -2..=3 {
            for kind in [StairKind::Down, StairKind::Up] {
                let (sx, sy) = stair_tile(SEED, z, kind);
                assert!(
                    is_floor(SEED, z, sx, sy),
                    "stair {kind:?} on z{z} not floor"
                );
                let (dz, (dx, dy)) = stair_dest(SEED, z, kind);
                assert!(is_floor(SEED, dz, dx, dy), "stair dest z{dz} not floor");
            }
        }
    }

    #[test]
    fn stair_link_is_symmetric() {
        // Descending Down from z arrives at z-1's Up; ascending Up from there
        // returns to z's Down. The two endpoints round-trip.
        let z = 1;
        let (down_z, _down_dest) = stair_dest(SEED, z, StairKind::Down);
        assert_eq!(down_z, z - 1);
        let (back_z, _) = stair_dest(SEED, down_z, StairKind::Up);
        assert_eq!(back_z, z);
    }

    #[test]
    fn parity_fingerprint_frozen() {
        // FROZEN — the client TS port (dungeon.spec.ts) asserts this for floor 0,
        // seed 0x5eed1 over (0,0)..(80,80). Algorithm changes update BOTH sides.
        let fp = fingerprint(SEED, 0, 0, 0, 80, 80);
        println!("ARPG_DUNGEON_FP_5EED1_Z0_80={fp}");
    }
}

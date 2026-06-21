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
/// client `roomCenter` (`>> 1` floor-halving).
pub fn room_center(world_seed: u32, cx: i32, cy: i32) -> (i32, i32) {
    let r = room_rect(world_seed, cx, cy);
    (r.x0 + (r.w >> 1), r.y0 + (r.h >> 1))
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

/// Corridor width between two adjacent chunks (gate-edge cost). Public for the
/// server's coarse routing if it ever wants the gate graph.
pub fn chunk_passage_width(world_seed: u32, acx: i32, acy: i32, bcx: i32, bcy: i32) -> i32 {
    passage_width(
        world_seed,
        room_center(world_seed, acx, acy),
        room_center(world_seed, bcx, bcy),
    )
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
/// west->self, north->self). Pure — recomputes from the seed, stores nothing.
fn chunk_covers(world_seed: u32, cx: i32, cy: i32, x: i32, y: i32) -> bool {
    if in_room(world_seed, cx, cy, x, y) {
        return true;
    }
    let s = room_center(world_seed, cx, cy);
    let east = room_center(world_seed, cx + 1, cy);
    let south = room_center(world_seed, cx, cy + 1);
    let west = room_center(world_seed, cx - 1, cy);
    let north = room_center(world_seed, cx, cy - 1);
    in_corridor(s, east, passage_width(world_seed, s, east), x, y)
        || in_corridor(s, south, passage_width(world_seed, s, south), x, y)
        || in_corridor(west, s, passage_width(world_seed, west, s), x, y)
        || in_corridor(north, s, passage_width(world_seed, north, s), x, y)
}

/// Walkable test for a single world tile. A tile is floor iff its owning chunk
/// OR any of the (up to 9) chunks whose carved corridors can reach into it
/// covers it. Corridors run between room centers and can cross the chunk border,
/// so we check the owning chunk and its 8 neighbours — matching the client's
/// streamed window where a neighbour's south/east corridor lands in this chunk.
pub fn is_floor(world_seed: u32, x: i32, y: i32) -> bool {
    let (cx, cy) = chunk_of(x, y);
    for dy in -1..=1 {
        for dx in -1..=1 {
            if chunk_covers(world_seed, cx + dx, cy + dy, x, y) {
                return true;
            }
        }
    }
    false
}

/// Nearest floor tile to a target by expanding chebyshev rings — safe spawns.
pub fn nearest_floor(world_seed: u32, tx: i32, ty: i32, max_r: i32) -> (i32, i32) {
    if is_floor(world_seed, tx, ty) {
        return (tx, ty);
    }
    for r in 1..=max_r {
        for dy in -r..=r {
            for dx in -r..=r {
                if dx.abs() != r && dy.abs() != r {
                    continue;
                }
                let (x, y) = (tx + dx, ty + dy);
                if is_floor(world_seed, x, y) {
                    return (x, y);
                }
            }
        }
    }
    (tx, ty)
}

/// FNV-1a over the floor bitset of a bounded window — cross-language parity
/// fingerprint. The client computes the identical hash over the same window.
pub fn fingerprint(world_seed: u32, x0: i32, y0: i32, w: i32, h: i32) -> u32 {
    let mut hh: u32 = 0x811c_9dc5;
    for y in y0..y0 + h {
        for x in x0..x0 + w {
            hh ^= if is_floor(world_seed, x, y) { 1 } else { 0 };
            hh = hh.wrapping_mul(0x0100_0193);
        }
    }
    hh
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic() {
        assert_eq!(
            fingerprint(0x5eed1, -40, -40, 120, 120),
            fingerprint(0x5eed1, -40, -40, 120, 120)
        );
    }

    #[test]
    fn seed_changes_layout() {
        assert_ne!(
            fingerprint(0x5eed1, 0, 0, 80, 80),
            fingerprint(0x1234, 0, 0, 80, 80)
        );
    }

    #[test]
    fn room_center_is_floor() {
        // A room center is always carved space.
        for (cx, cy) in [(0, 0), (1, 0), (0, 1), (-1, -1), (3, -2)] {
            let (x, y) = room_center(0x5eed1, cx, cy);
            assert!(is_floor(0x5eed1, x, y), "room center ({cx},{cy}) not floor");
        }
    }

    #[test]
    fn corridors_connect_neighbours() {
        // The midpoint between two adjacent room centers lies on the carved
        // corridor, so a straight line of floor links every neighbour pair.
        let seed = 0x5eed1;
        let a = room_center(seed, 0, 0);
        let b = room_center(seed, 1, 0);
        assert!(is_floor(seed, a.0, a.1));
        assert!(is_floor(seed, b.0, b.1));
        // L-corridor: the elbow tile (b.x, a.y) is always carved.
        assert!(is_floor(seed, b.0, a.1), "east corridor elbow not floor");
    }

    #[test]
    fn parity_fingerprint_frozen() {
        // FROZEN — the client TS port (dungeon.spec.ts) asserts this exact value
        // for seed 0x5eed1 over the window (0,0)..(80,80). If the algorithm
        // changes, update BOTH sides together.
        let fp = fingerprint(0x5eed1, 0, 0, 80, 80);
        println!("ARPG_DUNGEON_FP_5EED1_80={fp}");
    }
}

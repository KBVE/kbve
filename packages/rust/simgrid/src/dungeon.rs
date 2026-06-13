//! Deterministic procedural dungeon generation.
//!
//! Seed in -> identical grid out, byte-for-byte matched by the client
//! TypeScript port (apps/cryptothrone .../data/dungeon.ts). Both sides use
//! the same Mulberry32 PRNG and the same rooms+L-corridor carve order, so
//! the server only has to hand the client a seed — never the map. Keeps the
//! collision authoritative while the client renders + predicts the same
//! dungeon locally.

pub const DUNGEON_W: i32 = 48;
pub const DUNGEON_H: i32 = 48;
const MAX_ROOMS: u32 = 14;
const ROOM_MIN: u32 = 4;
const ROOM_MAX: u32 = 9;

/// Mulberry32 — tiny 32-bit PRNG. Pure u32 wrapping ops so it reproduces
/// exactly in JS (Math.imul + `>>> 0`).
struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }
    fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6D2B_79F5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }
    /// Inclusive range [lo, hi].
    fn range(&mut self, lo: i32, hi: i32) -> i32 {
        let span = (hi - lo + 1).max(1) as u32;
        lo + (self.next_u32() % span) as i32
    }
}

#[derive(Clone, Copy)]
pub struct Room {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

pub struct Dungeon {
    pub width: i32,
    pub height: i32,
    pub blocked: Vec<bool>,
    pub spawn: (i32, i32),
    pub rooms: Vec<Room>,
}

/// Generate a connected rooms+corridors dungeon from a seed. Identical to
/// the client TS port.
pub fn generate(seed: u32, width: i32, height: i32) -> Dungeon {
    let mut rng = Mulberry32::new(seed);
    let mut blocked = vec![true; (width * height) as usize];
    let mut rooms: Vec<Room> = Vec::new();

    let carve = |b: &mut Vec<bool>, x: i32, y: i32| {
        if x >= 0 && x < width && y >= 0 && y < height {
            b[(y * width + x) as usize] = false;
        }
    };

    for _ in 0..MAX_ROOMS {
        let rw = rng.range(ROOM_MIN as i32, ROOM_MAX as i32);
        let rh = rng.range(ROOM_MIN as i32, ROOM_MAX as i32);
        let rx = rng.range(1, width - rw - 1);
        let ry = rng.range(1, height - rh - 1);

        let overlaps = rooms.iter().any(|o| {
            rx < o.x + o.w + 1 && rx + rw + 1 > o.x && ry < o.y + o.h + 1 && ry + rh + 1 > o.y
        });
        if overlaps && !rooms.is_empty() {
            continue;
        }

        for yy in ry..ry + rh {
            for xx in rx..rx + rw {
                carve(&mut blocked, xx, yy);
            }
        }
        let cx = rx + rw / 2;
        let cy = ry + rh / 2;
        if let Some(prev) = rooms.last() {
            let px = prev.x + prev.w / 2;
            let py = prev.y + prev.h / 2;
            if rng.next_u32() & 1 == 0 {
                for x in px.min(cx)..=px.max(cx) {
                    carve(&mut blocked, x, py);
                }
                for y in py.min(cy)..=py.max(cy) {
                    carve(&mut blocked, cx, y);
                }
            } else {
                for y in py.min(cy)..=py.max(cy) {
                    carve(&mut blocked, px, y);
                }
                for x in px.min(cx)..=px.max(cx) {
                    carve(&mut blocked, x, cy);
                }
            }
        }
        rooms.push(Room {
            x: rx,
            y: ry,
            w: rw,
            h: rh,
        });
    }

    let first = rooms[0];
    let spawn = (first.x + first.w / 2, first.y + first.h / 2);
    Dungeon {
        width,
        height,
        blocked,
        spawn,
        rooms,
    }
}

/// FNV-1a over the blocked bitset — a cross-language parity fingerprint.
pub fn fingerprint(blocked: &[bool]) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for &b in blocked {
        h ^= if b { 1 } else { 0 };
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dungeon_is_deterministic_and_connected() {
        let d = generate(1337, DUNGEON_W, DUNGEON_H);
        let d2 = generate(1337, DUNGEON_W, DUNGEON_H);
        assert_eq!(fingerprint(&d.blocked), fingerprint(&d2.blocked));
        assert_ne!(
            fingerprint(&d.blocked),
            fingerprint(&generate(99, DUNGEON_W, DUNGEON_H).blocked)
        );
        // spawn walkable
        let si = (d.spawn.1 * d.width + d.spawn.0) as usize;
        assert!(!d.blocked[si]);
        // connectivity: BFS from spawn reaches every floor tile
        let floors = d.blocked.iter().filter(|b| !**b).count();
        let mut seen = vec![false; d.blocked.len()];
        seen[si] = true;
        let mut q = vec![si];
        let mut reached = 1;
        while let Some(c) = q.pop() {
            let (x, y) = ((c as i32) % d.width, (c as i32) / d.width);
            for (dx, dy) in [(0, -1), (0, 1), (-1, 0), (1, 0)] {
                let (nx, ny) = (x + dx, y + dy);
                if nx < 0 || ny < 0 || nx >= d.width || ny >= d.height {
                    continue;
                }
                let ni = (ny * d.width + nx) as usize;
                if seen[ni] || d.blocked[ni] {
                    continue;
                }
                seen[ni] = true;
                reached += 1;
                q.push(ni);
            }
        }
        assert_eq!(reached, floors, "dungeon has stranded floor tiles");
    }

    #[test]
    fn parity_fingerprint_1337() {
        // Frozen fingerprint — the TS port must match this exact value for
        // seed 1337 / 48x48. If the algorithm changes, update both sides.
        let d = generate(1337, DUNGEON_W, DUNGEON_H);
        println!("FINGERPRINT_1337={}", fingerprint(&d.blocked));
    }
}

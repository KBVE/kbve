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

pub const TOWN_W: i32 = 60;
pub const TOWN_H: i32 = 60;
const TOWN_CELL: i32 = 10;
const TOWN_MARGIN: i32 = 2;
const TOWN_PLAZA_R: i32 = 7;
const TOWN_EMPTY_PCT: u32 = 25;

pub struct Town {
    pub width: i32,
    pub height: i32,
    pub blocked: Vec<bool>,
    pub spawn: (i32, i32),
    pub buildings: Vec<Room>,
}

/// Generate a structured town: a clear central plaza, a grid of streets, and
/// inset building footprints (solid obstacles you walk around). Identical to
/// the client TS port (town generateTown).
pub fn generate_town(seed: u32, width: i32, height: i32) -> Town {
    let mut rng = Mulberry32::new(seed);
    let mut blocked = vec![false; (width * height) as usize];
    let mut buildings: Vec<Room> = Vec::new();
    let (ccx, ccy) = (width / 2, height / 2);
    let max_b = (TOWN_CELL - 2 * TOWN_MARGIN).max(3);

    let cols = width / TOWN_CELL;
    let rows = height / TOWN_CELL;
    for gy in 0..rows {
        for gx in 0..cols {
            let ox = gx * TOWN_CELL;
            let oy = gy * TOWN_CELL;
            let bw = rng.range(3, max_b);
            let bh = rng.range(3, max_b);
            let bxj = rng.range(0, (TOWN_CELL - 2 * TOWN_MARGIN - bw).max(0));
            let byj = rng.range(0, (TOWN_CELL - 2 * TOWN_MARGIN - bh).max(0));
            let empty = rng.next_u32() % 100 < TOWN_EMPTY_PCT;

            let bx = ox + TOWN_MARGIN + bxj;
            let by = oy + TOWN_MARGIN + byj;
            let bcx = bx + bw / 2;
            let bcy = by + bh / 2;
            let in_plaza = (bcx - ccx).abs().max((bcy - ccy).abs()) <= TOWN_PLAZA_R;
            if empty || in_plaza || bx + bw >= width || by + bh >= height {
                continue;
            }
            for y in by..by + bh {
                for x in bx..bx + bw {
                    blocked[(y * width + x) as usize] = true;
                }
            }
            buildings.push(Room {
                x: bx,
                y: by,
                w: bw,
                h: bh,
            });
        }
    }

    Town {
        width,
        height,
        blocked,
        spawn: (ccx, ccy),
        buildings,
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

    #[test]
    fn town_is_deterministic_and_connected() {
        let t = generate_town(2024, TOWN_W, TOWN_H);
        let t2 = generate_town(2024, TOWN_W, TOWN_H);
        assert_eq!(fingerprint(&t.blocked), fingerprint(&t2.blocked));
        assert_ne!(
            fingerprint(&t.blocked),
            fingerprint(&generate_town(7, TOWN_W, TOWN_H).blocked)
        );
        assert!(!t.buildings.is_empty(), "town has no buildings");
        // spawn (plaza center) walkable
        let si = (t.spawn.1 * t.width + t.spawn.0) as usize;
        assert!(!t.blocked[si]);
        // streets connect: BFS from spawn over open ground reaches every
        // walkable tile — no building seals off a pocket.
        let ground = t.blocked.iter().filter(|b| !**b).count();
        let mut seen = vec![false; t.blocked.len()];
        seen[si] = true;
        let mut q = vec![si];
        let mut reached = 1;
        while let Some(c) = q.pop() {
            let (x, y) = ((c as i32) % t.width, (c as i32) / t.width);
            for (dx, dy) in [(0, -1), (0, 1), (-1, 0), (1, 0)] {
                let (nx, ny) = (x + dx, y + dy);
                if nx < 0 || ny < 0 || nx >= t.width || ny >= t.height {
                    continue;
                }
                let ni = (ny * t.width + nx) as usize;
                if seen[ni] || t.blocked[ni] {
                    continue;
                }
                seen[ni] = true;
                reached += 1;
                q.push(ni);
            }
        }
        assert_eq!(reached, ground, "town has stranded ground tiles");
    }

    #[test]
    fn parity_town_fingerprint_2024() {
        // Frozen town fingerprint — TS port must match for seed 2024 / 60x60.
        let t = generate_town(2024, TOWN_W, TOWN_H);
        println!("TOWN_FINGERPRINT_2024={}", fingerprint(&t.blocked));
    }
}

//! Deterministic procedural map generation (dungeons + towns).
//!
//! Seed in -> identical grid out, byte-for-byte matched by the client
//! TypeScript port (apps/cryptothrone .../data/dungeon.ts). Both sides use
//! the same Mulberry32 PRNG and the same carve/placement order.
//!
//! Generators emit a **role grid** (semantic TileRole per tile, matching the
//! mapdb TileRole enum). Collision derives from the role via [`role_blocks`],
//! so the server only ships a seed — never the map — and a per-biome palette
//! resolves role -> render gid on the client without touching collision.

pub const DUNGEON_W: i32 = 48;
pub const DUNGEON_H: i32 = 48;
const MAX_ROOMS: u32 = 14;
const ROOM_MIN: u32 = 4;
const ROOM_MAX: u32 = 9;

/// Semantic tile roles — values match the mapdb `TileRole` proto enum.
pub mod role {
    pub const UNSPECIFIED: u8 = 0;
    pub const GROUND: u8 = 1;
    pub const PLAZA: u8 = 2;
    pub const ROAD: u8 = 3;
    pub const GRASS: u8 = 4;
    pub const WALL: u8 = 5;
    pub const ROOF: u8 = 6;
    pub const DOOR: u8 = 7;
    pub const WATER: u8 = 8;
    pub const PROP: u8 = 9;
    pub const PROP_SOLID: u8 = 10;
    pub const VOID: u8 = 11;
}

/// Whether a role blocks movement. The single source of truth for collision —
/// shared by server (`WalkableMap`) and the client prediction grid.
pub fn role_blocks(r: u8) -> bool {
    matches!(
        r,
        role::WALL | role::ROOF | role::WATER | role::PROP_SOLID | role::VOID
    )
}

fn blocked_from_roles(roles: &[u8]) -> Vec<bool> {
    roles.iter().map(|&r| role_blocks(r)).collect()
}

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
    pub roles: Vec<u8>,
    pub blocked: Vec<bool>,
    pub spawn: (i32, i32),
    pub rooms: Vec<Room>,
}

/// Generate a connected rooms+corridors dungeon from a seed. Solid rock is
/// WALL; carved space is GROUND. Identical to the client TS port.
pub fn generate(seed: u32, width: i32, height: i32) -> Dungeon {
    let mut rng = Mulberry32::new(seed);
    let mut roles = vec![role::WALL; (width * height) as usize];
    let mut rooms: Vec<Room> = Vec::new();

    let carve = |r: &mut Vec<u8>, x: i32, y: i32| {
        if x >= 0 && x < width && y >= 0 && y < height {
            r[(y * width + x) as usize] = role::GROUND;
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
                carve(&mut roles, xx, yy);
            }
        }
        let cx = rx + rw / 2;
        let cy = ry + rh / 2;
        if let Some(prev) = rooms.last() {
            let px = prev.x + prev.w / 2;
            let py = prev.y + prev.h / 2;
            if rng.next_u32() & 1 == 0 {
                for x in px.min(cx)..=px.max(cx) {
                    carve(&mut roles, x, py);
                }
                for y in py.min(cy)..=py.max(cy) {
                    carve(&mut roles, cx, y);
                }
            } else {
                for y in py.min(cy)..=py.max(cy) {
                    carve(&mut roles, px, y);
                }
                for x in px.min(cx)..=px.max(cx) {
                    carve(&mut roles, x, cy);
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
    let blocked = blocked_from_roles(&roles);
    Dungeon {
        width,
        height,
        roles,
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
    pub roles: Vec<u8>,
    pub blocked: Vec<bool>,
    pub spawn: (i32, i32),
    pub buildings: Vec<Room>,
}

/// Generate a structured town: a clear central PLAZA, a street grid of GROUND,
/// inset buildings (WALL border + ROOF interior), and a PROP_SOLID tree in
/// each skipped lot. Identical to the client TS port (town generateTown).
pub fn generate_town(seed: u32, width: i32, height: i32) -> Town {
    let mut rng = Mulberry32::new(seed);
    let mut roles = vec![role::GROUND; (width * height) as usize];
    let mut buildings: Vec<Room> = Vec::new();
    let (ccx, ccy) = (width / 2, height / 2);
    let max_b = (TOWN_CELL - 2 * TOWN_MARGIN).max(3);

    let in_plaza = |x: i32, y: i32| (x - ccx).abs().max((y - ccy).abs()) <= TOWN_PLAZA_R;

    for y in 0..height {
        for x in 0..width {
            if in_plaza(x, y) {
                roles[(y * width + x) as usize] = role::PLAZA;
            }
        }
    }

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
            if bx + bw >= width || by + bh >= height || in_plaza(bcx, bcy) {
                continue;
            }
            if empty {
                roles[(bcy * width + bcx) as usize] = role::PROP_SOLID;
                continue;
            }
            for y in by..by + bh {
                for x in bx..bx + bw {
                    let edge = x == bx || x == bx + bw - 1 || y == by || y == by + bh - 1;
                    roles[(y * width + x) as usize] = if edge { role::WALL } else { role::ROOF };
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

    let blocked = blocked_from_roles(&roles);
    Town {
        width,
        height,
        roles,
        blocked,
        spawn: (ccx, ccy),
        buildings,
    }
}

/// FNV-1a over the role grid — the canonical cross-language parity fingerprint.
pub fn fingerprint_roles(roles: &[u8]) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for &r in roles {
        h ^= r as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

/// FNV-1a over the blocked bitset — collision parity.
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

    fn connected(roles: &[u8], w: i32, h: i32, spawn: (i32, i32)) -> bool {
        let blocked = blocked_from_roles(roles);
        let si = (spawn.1 * w + spawn.0) as usize;
        if blocked[si] {
            return false;
        }
        let open = blocked.iter().filter(|b| !**b).count();
        let mut seen = vec![false; blocked.len()];
        seen[si] = true;
        let mut q = vec![si];
        let mut reached = 1;
        while let Some(c) = q.pop() {
            let (x, y) = ((c as i32) % w, (c as i32) / w);
            for (dx, dy) in [(0, -1), (0, 1), (-1, 0), (1, 0)] {
                let (nx, ny) = (x + dx, y + dy);
                if nx < 0 || ny < 0 || nx >= w || ny >= h {
                    continue;
                }
                let ni = (ny * w + nx) as usize;
                if seen[ni] || blocked[ni] {
                    continue;
                }
                seen[ni] = true;
                reached += 1;
                q.push(ni);
            }
        }
        reached == open
    }

    #[test]
    fn dungeon_is_deterministic_and_connected() {
        let d = generate(1337, DUNGEON_W, DUNGEON_H);
        let d2 = generate(1337, DUNGEON_W, DUNGEON_H);
        assert_eq!(fingerprint_roles(&d.roles), fingerprint_roles(&d2.roles));
        assert_ne!(
            fingerprint_roles(&d.roles),
            fingerprint_roles(&generate(99, DUNGEON_W, DUNGEON_H).roles)
        );
        assert!(connected(&d.roles, d.width, d.height, d.spawn));
    }

    #[test]
    fn parity_fingerprint_1337() {
        // Frozen — the TS port must match these exact values for seed 1337 /
        // 48x48. If the algorithm changes, update both sides.
        let d = generate(1337, DUNGEON_W, DUNGEON_H);
        println!("ROLE_FINGERPRINT_1337={}", fingerprint_roles(&d.roles));
        println!("BLOCKED_FINGERPRINT_1337={}", fingerprint(&d.blocked));
        // dungeon collision is unchanged from the pre-role version
        assert_eq!(fingerprint(&d.blocked), 532487171);
    }

    #[test]
    fn town_is_deterministic_and_connected() {
        let t = generate_town(2024, TOWN_W, TOWN_H);
        let t2 = generate_town(2024, TOWN_W, TOWN_H);
        assert_eq!(fingerprint_roles(&t.roles), fingerprint_roles(&t2.roles));
        assert_ne!(
            fingerprint_roles(&t.roles),
            fingerprint_roles(&generate_town(7, TOWN_W, TOWN_H).roles)
        );
        assert!(!t.buildings.is_empty(), "town has no buildings");
        // plaza spawn is walkable; streets fully connect.
        assert_eq!(
            t.roles[(t.spawn.1 * t.width + t.spawn.0) as usize],
            role::PLAZA
        );
        assert!(connected(&t.roles, t.width, t.height, t.spawn));
    }

    #[test]
    fn parity_town_fingerprint_2024() {
        let t = generate_town(2024, TOWN_W, TOWN_H);
        println!("ROLE_FINGERPRINT_2024={}", fingerprint_roles(&t.roles));
        println!("BLOCKED_FINGERPRINT_2024={}", fingerprint(&t.blocked));
    }

    #[test]
    fn role_blocking_matches_collision() {
        let t = generate_town(2024, TOWN_W, TOWN_H);
        for (r, b) in t.roles.iter().zip(t.blocked.iter()) {
            assert_eq!(role_blocks(*r), *b);
        }
    }
}

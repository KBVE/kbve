//! Attack geometry — the shared, pure target-selection layer for the three
//! combat pillars (melee / ranged / magic). Byte-for-byte mirrored by the
//! client (`@kbve/laser` combat module) so client prediction picks the same
//! tiles the authoritative server does; the server still owns hit truth.
//!
//! Pure functions over `Tile` + a `is_blocked` predicate (the same walkability
//! bitset both sides already share). No bevy, no RNG — damage resolution and
//! crit rolls live in `sim.rs` / `rng.rs`.

use crate::proto::Tile;

/// How an attack selects target tiles from the attacker's position.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AttackShape {
    /// Single target within Chebyshev `range`. Melee.
    Adjacent,
    /// Tile raycast toward the target; first blocked tile or entity stops it.
    /// Single target. Bow / bolt.
    Line,
    /// Every tile within Chebyshev `radius` of the target tile. Magic AoE.
    Aoe,
}

/// Default melee reach. A melee swing hits a single Chebyshev-adjacent tile.
pub const MELEE_RANGE: i32 = 1;

/// Default bow reach, in tiles, along the line of sight.
pub const BOW_RANGE: i32 = 8;

/// Whether `b` is within Chebyshev `range` of `a` (the melee gate).
pub fn in_range_adjacent(a: Tile, b: Tile, range: i32) -> bool {
    a.chebyshev(b) <= range
}

/// Walk a Bresenham line from `origin` toward `target`, at most `max_range`
/// steps (origin excluded). Stops at and includes the first blocked tile.
/// Returns the ordered traversed tiles — the projectile's flight path. The
/// caller scans the path for the first entity (the hit) or treats the final
/// blocked tile as the impact point.
pub fn line_cast(
    origin: Tile,
    target: Tile,
    max_range: i32,
    is_blocked: impl Fn(Tile) -> bool,
) -> Vec<Tile> {
    let mut out = Vec::new();
    let (mut x, mut y) = (origin.x, origin.y);
    let dx = (target.x - x).abs();
    let dy = -(target.y - y).abs();
    let sx = if x < target.x { 1 } else { -1 };
    let sy = if y < target.y { 1 } else { -1 };
    let mut err = dx + dy;
    let mut steps = 0;
    loop {
        if x == target.x && y == target.y {
            break;
        }
        let e2 = 2 * err;
        if e2 >= dy {
            err += dy;
            x += sx;
        }
        if e2 <= dx {
            err += dx;
            y += sy;
        }
        steps += 1;
        let t = Tile::new(x, y);
        out.push(t);
        if is_blocked(t) || steps >= max_range {
            break;
        }
    }
    out
}

/// Every tile within Chebyshev `radius` of `center` — a (2r+1)² square disc in
/// row-major order. The AoE footprint; the caller hits entities standing on
/// any returned tile.
pub fn aoe_tiles(center: Tile, radius: i32) -> Vec<Tile> {
    let mut out = Vec::with_capacity(((2 * radius + 1) * (2 * radius + 1)).max(1) as usize);
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            out.push(Tile::new(center.x + dx, center.y + dy));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open(_: Tile) -> bool {
        false
    }

    #[test]
    fn adjacent_range_gate() {
        let a = Tile::new(4, 4);
        assert!(in_range_adjacent(a, Tile::new(5, 5), MELEE_RANGE));
        assert!(!in_range_adjacent(a, Tile::new(6, 4), MELEE_RANGE));
    }

    #[test]
    fn line_cast_open_path_frozen() {
        // Frozen — the client mirror (@kbve/laser combat.test.ts) asserts this.
        let path = line_cast(Tile::new(0, 0), Tile::new(5, 3), 10, open);
        assert_eq!(
            path,
            vec![
                Tile::new(1, 1),
                Tile::new(2, 1),
                Tile::new(3, 2),
                Tile::new(4, 2),
                Tile::new(5, 3),
            ]
        );
    }

    #[test]
    fn line_cast_stops_at_wall() {
        let wall = |t: Tile| t.x == 3;
        let path = line_cast(Tile::new(0, 0), Tile::new(6, 0), 10, wall);
        assert_eq!(path.last(), Some(&Tile::new(3, 0)));
    }

    #[test]
    fn line_cast_respects_range() {
        let path = line_cast(Tile::new(0, 0), Tile::new(20, 0), 4, open);
        assert_eq!(path.len(), 4);
        assert_eq!(path.last(), Some(&Tile::new(4, 0)));
    }

    #[test]
    fn aoe_radius_one_is_nine_tiles() {
        let tiles = aoe_tiles(Tile::new(2, 2), 1);
        assert_eq!(tiles.len(), 9);
        assert_eq!(tiles[0], Tile::new(1, 1));
        assert_eq!(tiles[8], Tile::new(3, 3));
    }
}

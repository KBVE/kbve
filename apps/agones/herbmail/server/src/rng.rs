//! Transliteration of `apps/herbmail/herbmail-game/src/game/geometry/rng.ts`.
//!
//! The client's world is a pure function of a seed, so these three functions
//! decide where every wall, arch and ore node in the dungeon lands. They must
//! agree with the TS exactly — a single ulp of difference in `jitter` changes a
//! doorway half-width, and a player would be blocked on one side of an arch and
//! not the other.
//!
//! Two details carry the parity and are easy to get wrong:
//!
//! - JS `Math.imul` is a **32-bit signed** multiply that wraps. That is
//!   `i32::wrapping_mul`, not `u32` and not a widening multiply.
//! - JS `>>>` is a **logical** shift on the u32 reinterpretation of the value,
//!   while `>>` on a negative i32 in Rust is arithmetic. Every shift here goes
//!   through the u32 view for that reason.
//!
//! `hash01` divides by `4294967295` (u32::MAX, not 2^32) exactly as the TS does,
//! in `f64` — the client is f64 throughout and f32 here would drift the doorway
//! widths that depend on it.

/// 32-bit integer hash of up to three coordinates. Mirrors `hashInt`.
pub fn hash_int(x: i32, y: i32, z: i32) -> u32 {
    let h = x
        .wrapping_mul(374761393)
        .wrapping_add(y.wrapping_mul(668265263))
        .wrapping_add(z.wrapping_mul(1274126177));
    let h = ((h as u32) ^ ((h as u32) >> 13)) as i32;
    let h = h.wrapping_mul(1274126177) as u32;
    h ^ (h >> 16)
}

/// Hash mapped to [0, 1]. Mirrors `hash01`.
pub fn hash01(x: i32, y: i32, z: i32) -> f64 {
    hash_int(x, y, z) as f64 / 4294967295.0
}

/// Hash mapped to [min, max]. Mirrors `jitter`.
pub fn jitter(x: i32, y: i32, z: i32, min: f64, max: f64) -> f64 {
    min + hash01(x, y, z) * (max - min)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pinned parity vectors: `(x, y, z, hash_int)`.
    ///
    /// Asserted bit-exactly here and mirrored in `rngParity.test.ts` in the
    /// client. Neither side may be regenerated to match the other — if these
    /// diverge, the world has changed and every persisted position is suspect.
    /// Same discipline as `simgrid/src/heightfield.rs::PINNED_BITS`.
    const PINNED: &[(i32, i32, i32, u32)] = &[
        (0, 0, 0, 0),
        (1, 0, 0, 2182377942),
        (0, 1, 0, 3299714085),
        (0, 0, 1, 978089601),
        (1, 1, 1, 1621154374),
        (-1, 0, 0, 2321422717),
        (0, -1, 0, 2314630687),
        (-1, -1, -1, 995778845),
        (1337, 0, 0, 2082178126),
        (48, 48, 0, 1098198025),
        (1000000, 1000000, 0, 2147371341),
        (-1000000, 999999, 7, 2431402538),
        (2147483647, 0, 0, 2363105273),
        (-2147483648, 0, 0, 4253351300),
        (123456789, 987654321, 42, 301882944),
    ];

    #[test]
    fn hash_int_matches_pinned_vectors() {
        for &(x, y, z, want) in PINNED {
            assert_eq!(
                hash_int(x, y, z),
                want,
                "hash_int({x}, {y}, {z}) diverged from the pinned client value"
            );
        }
    }

    #[test]
    fn hash01_is_within_unit_range() {
        for &(x, y, z, _) in PINNED {
            let v = hash01(x, y, z);
            assert!((0.0..=1.0).contains(&v), "hash01({x},{y},{z}) = {v}");
        }
    }

    #[test]
    fn jitter_spans_the_requested_range() {
        // The doorway half-width case the collision predicate depends on.
        for &(x, y, z, _) in PINNED {
            let v = jitter(x, y, z, 3.0 * 0.28, 3.0 * 0.38);
            assert!((0.84..=1.14).contains(&v), "jitter({x},{y},{z}) = {v}");
        }
    }

    #[test]
    fn wraps_rather_than_panicking_on_extremes() {
        // i32::MIN.wrapping_mul is the case a naive port overflows on in debug.
        let _ = hash_int(i32::MIN, i32::MIN, i32::MIN);
        let _ = hash_int(i32::MAX, i32::MAX, i32::MAX);
    }
}

//! Shared deterministic RNG primitives, byte-for-byte mirrored by the client
//! TypeScript port (`@kbve/laser` determ module). Server and client derive the
//! same rolls (crit prediction) and the same procedural layouts (dungeons)
//! from a single server-owned seed, so the wire only ever carries a seed.
//!
//! Two lanes:
//!   - u32 lane (`Mulberry32`, `mix32`, `stream`, `roll_pct`) — pure 32-bit
//!     wrapping ops, reproduces exactly in JS via `Math.imul` + `>>> 0`. Use
//!     for anything the client must predict.
//!   - u64 lane (`hash3`) — splitmix finalize for server-only rolls that never
//!     need a client mirror.
//!
//! Domain separation: every consumer mixes a distinct `domain` tag into seed
//! derivation, so independent systems draw decorrelated streams and combat
//! rolls can never leak (or correlate with) dungeon layout.

/// RNG domain tags. Frozen FourCC values — the client mirror must match.
pub mod domain {
    pub const COMBAT: u32 = u32::from_be_bytes(*b"COMB");
    pub const PETBATTLE: u32 = u32::from_be_bytes(*b"PBTL");
    pub const DUNGEON: u32 = u32::from_be_bytes(*b"DUNG");
    pub const WANDER: u32 = u32::from_be_bytes(*b"WAND");
    pub const LOOT: u32 = u32::from_be_bytes(*b"LOOT");
    pub const TREE: u32 = u32::from_be_bytes(*b"TREE");
    pub const BUSH: u32 = u32::from_be_bytes(*b"BUSH");
}

/// Mulberry32 — tiny 32-bit PRNG. Pure u32 wrapping ops so it reproduces
/// exactly in JS (`Math.imul` + `>>> 0`).
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    pub fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6D2B_79F5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    /// Inclusive range [lo, hi].
    pub fn range(&mut self, lo: i32, hi: i32) -> i32 {
        let span = (hi - lo + 1).max(1) as u32;
        lo + (self.next_u32() % span) as i32
    }
}

/// FNV-1a over the little-endian bytes of each word — pure 32-bit, mirrors
/// exactly in JS. Folds an arbitrary context into a single u32 sub-seed.
pub fn mix32(words: &[u32]) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for &w in words {
        for byte in w.to_le_bytes() {
            h ^= byte as u32;
            h = h.wrapping_mul(0x0100_0193);
        }
    }
    h
}

/// Narrow a u64 root seed to u32 for the client-mirrorable lane.
pub fn root32(seed: u64) -> u32 {
    (seed ^ (seed >> 32)) as u32
}

/// Seed a `Mulberry32` stream for a domain + context. Client-mirrorable.
pub fn stream(root: u32, domain: u32, ctx: &[u32]) -> Mulberry32 {
    let mut words = Vec::with_capacity(ctx.len() + 2);
    words.push(root);
    words.push(domain);
    words.extend_from_slice(ctx);
    Mulberry32::new(mix32(&words))
}

/// One-shot percentage roll in [0, 100) for a domain + context.
/// Client-mirrorable — both sides compute the identical value.
pub fn roll_pct(root: u32, domain: u32, ctx: &[u32]) -> u32 {
    stream(root, domain, ctx).next_u32() % 100
}

/// splitmix finalize over three u64s — server-only rolls (no client mirror).
pub fn hash3(a: u64, b: u64, c: u64) -> u64 {
    let mut x = a ^ b.rotate_left(17) ^ c.rotate_left(31);
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roll_is_deterministic() {
        assert_eq!(
            roll_pct(1337, domain::COMBAT, &[7, 42]),
            roll_pct(1337, domain::COMBAT, &[7, 42])
        );
    }

    #[test]
    fn domains_decorrelate() {
        assert_ne!(
            roll_pct(1337, domain::COMBAT, &[7, 42]),
            roll_pct(1337, domain::DUNGEON, &[7, 42])
        );
    }

    #[test]
    fn parity_vectors_frozen() {
        // The client mirror (@kbve/laser determ.test.ts) asserts these exact
        // values. If the algorithm changes, update both sides together.
        assert_eq!(mix32(&[1337, domain::COMBAT, 7, 42]), 3335238993);
        assert_eq!(roll_pct(1337, domain::COMBAT, &[7, 42]), 15);
        assert_eq!(roll_pct(1337, domain::DUNGEON, &[7, 42]), 20);
    }
}

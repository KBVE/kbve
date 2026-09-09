/// A small, seeded, portable random number generator.
///
/// Combat rolls have to reproduce exactly: a server re-running a client's
/// attack must reach the same verdict, and a replay must play back the fight it
/// recorded. That rules out the thread RNG, and it rules out anything whose
/// stream depends on the platform. PCG32 is a few lines, has no dependencies,
/// and produces the same sequence everywhere from the same seed.
///
/// Not cryptographic. Nothing here should be guarding a secret.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rng {
    state: u64,
    stream: u64,
}

const MULTIPLIER: u64 = 6_364_136_223_846_793_005;

impl Rng {
    /// Seeds a generator. `stream` selects an independent sequence, so two
    /// systems sharing a seed but using different streams do not correlate --
    /// give damage rolls and loot rolls different streams and a fight stops
    /// perturbing the drops.
    pub const fn new(seed: u64, stream: u64) -> Self {
        let mut rng = Self {
            state: 0,
            stream: (stream << 1) | 1,
        };
        rng.state = rng.state.wrapping_mul(MULTIPLIER).wrapping_add(rng.stream);
        rng.state = rng.state.wrapping_add(seed);
        rng.state = rng.state.wrapping_mul(MULTIPLIER).wrapping_add(rng.stream);
        rng
    }

    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        let previous = self.state;
        self.state = previous.wrapping_mul(MULTIPLIER).wrapping_add(self.stream);
        let xorshifted = (((previous >> 18) ^ previous) >> 27) as u32;
        let rotation = (previous >> 59) as u32;
        xorshifted.rotate_right(rotation)
    }

    /// A uniform value in `0..bound`, with the modulo bias rejected rather than
    /// ignored. Returns 0 for a bound of 0.
    pub fn below(&mut self, bound: u32) -> u32 {
        if bound == 0 {
            return 0;
        }
        let threshold = bound.wrapping_neg() % bound;
        loop {
            let candidate = self.next_u32();
            if candidate >= threshold {
                return candidate % bound;
            }
        }
    }

    /// A uniform value in `low..=high`, inclusive. Order of the bounds does not
    /// matter.
    pub fn range(&mut self, low: i32, high: i32) -> i32 {
        let (low, high) = if low <= high {
            (low, high)
        } else {
            (high, low)
        };
        let span = (high as i64 - low as i64) as u64 + 1;
        if span > u32::MAX as u64 {
            return low;
        }
        low + self.below(span as u32) as i32
    }

    /// Rolls against a chance in per-mille, so `250` is 25%.
    ///
    /// Per-mille integers rather than a float probability: comparing floats
    /// across platforms is the sort of thing that produces a client and server
    /// disagreeing about whether a killing blow landed.
    #[inline]
    pub fn chance(&mut self, permille: u16) -> bool {
        if permille == 0 {
            return false;
        }
        if permille >= 1000 {
            return true;
        }
        self.below(1000) < permille as u32
    }
}

/// A duration in milliseconds.
///
/// Every duration in this crate is one of these, and that is the single
/// decision that lets real-time and turn-based combat share one implementation.
/// A turn is not a different kind of time, it is a larger step of the same
/// time: a real-time game advances the clock by the frame's delta, a turn-based
/// one advances it by whatever it decides a turn is worth. Cooldowns decay,
/// effects expire and casts complete through the identical code either way.
///
/// Integer milliseconds rather than a float because this arithmetic has to
/// agree bit-for-bit between a client predicting an outcome and a server
/// re-simulating it. Accumulated float deltas do not.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Millis(pub u32);

impl Millis {
    pub const ZERO: Self = Self(0);

    /// Milliseconds in one second, for callers converting from a frame delta.
    pub const SECOND: Self = Self(1000);

    #[inline]
    pub const fn is_zero(self) -> bool {
        self.0 == 0
    }

    /// Advances a countdown, stopping at zero rather than wrapping.
    #[inline]
    pub const fn saturating_sub(self, elapsed: Self) -> Self {
        Self(self.0.saturating_sub(elapsed.0))
    }

    #[inline]
    pub const fn saturating_add(self, other: Self) -> Self {
        Self(self.0.saturating_add(other.0))
    }

    /// Converts a real-time frame delta, saturating instead of wrapping on a
    /// hitch or a debugger pause.
    #[cfg(feature = "std")]
    pub fn from_secs_f32(seconds: f32) -> Self {
        // NaN and infinity both reach here from a stalled or corrupted frame
        // clock, and both must produce a step of zero rather than a duration.
        if !seconds.is_finite() || seconds <= 0.0 {
            return Self::ZERO;
        }
        let millis = seconds * 1000.0;
        if millis >= u32::MAX as f32 {
            Self(u32::MAX)
        } else {
            Self(millis as u32)
        }
    }
}

/// A countdown that something has to wait out: a cooldown, a cast, a global
/// cooldown, the remaining life of an effect.
///
/// Deliberately not a collection. A character has many of these and the shape
/// of that storage is the caller's business -- an ECS component, a fixed array
/// per ability slot, a map keyed by ability id. Keeping the core free of
/// collections is what keeps it free of an allocator.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Timer {
    remaining: Millis,
}

impl Timer {
    /// A timer that has already finished.
    pub const READY: Self = Self {
        remaining: Millis::ZERO,
    };

    #[inline]
    pub const fn new(duration: Millis) -> Self {
        Self {
            remaining: duration,
        }
    }

    #[inline]
    pub const fn remaining(self) -> Millis {
        self.remaining
    }

    #[inline]
    pub const fn is_ready(self) -> bool {
        self.remaining.is_zero()
    }

    /// Advances by `elapsed`. Returns true on the step that finishes it, and
    /// false on every step after -- so a caller can fire a cast's completion
    /// exactly once without tracking a separate "already fired" flag.
    #[inline]
    pub fn tick(&mut self, elapsed: Millis) -> bool {
        if self.remaining.is_zero() {
            return false;
        }
        self.remaining = self.remaining.saturating_sub(elapsed);
        self.remaining.is_zero()
    }

    /// Restarts the countdown, keeping whichever of the two is longer.
    ///
    /// A shorter cooldown must never cut an existing one short, or any ability
    /// that shares a cooldown with a faster one becomes a way to skip it.
    #[inline]
    pub fn start(&mut self, duration: Millis) {
        if duration > self.remaining {
            self.remaining = duration;
        }
    }

    #[inline]
    pub fn clear(&mut self) {
        self.remaining = Millis::ZERO;
    }
}

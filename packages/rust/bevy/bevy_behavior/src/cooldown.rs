//! Tick-based cooldown system.
//!
//! Keeps behavior nodes decoupled from ECS types so trees can be
//! unit-tested without a Bevy `App`. Each game's ECS cooldown
//! components implement [`CooldownState`]; the tree only sees the trait.

/// Minimal interface for cooldown tracking. ECS components / resources
/// implement this so behavior nodes can check + bump cooldowns without
/// knowing the concrete Bevy type.
pub trait CooldownState: Send + Sync {
    /// Returns `true` if enough ticks have elapsed since the last fire.
    ///
    /// # Arguments
    ///
    /// * `current_tick` — the game's current monotonic tick counter.
    fn can_fire(&self, current_tick: u64) -> bool;

    /// Record that the ability was fired at `current_tick`. Subsequent
    /// [`can_fire`] calls will block until enough ticks have elapsed.
    ///
    /// [`can_fire`]: CooldownState::can_fire
    fn mark_fired(&mut self, current_tick: u64);
}

/// Simple tick-based cooldown — fires once, then blocks for `interval`
/// ticks. Starts unfired (`last_fired = None`) so the first activation
/// always succeeds regardless of the current tick.
#[derive(Debug, Clone)]
pub struct TickCooldown {
    /// Minimum number of ticks between activations.
    pub interval: u64,
    /// Tick at which the cooldown was last triggered, or `None` if never fired.
    pub last_fired: Option<u64>,
}

impl TickCooldown {
    /// Create a new cooldown that blocks for `interval` ticks between fires.
    ///
    /// # Examples
    ///
    /// ```
    /// use bevy_behavior::{TickCooldown, CooldownState};
    ///
    /// let mut cd = TickCooldown::new(10);
    /// assert!(cd.can_fire(0));
    /// cd.mark_fired(0);
    /// assert!(!cd.can_fire(5));
    /// assert!(cd.can_fire(10));
    /// ```
    pub fn new(interval: u64) -> Self {
        Self {
            interval,
            last_fired: None,
        }
    }
}

impl CooldownState for TickCooldown {
    fn can_fire(&self, current_tick: u64) -> bool {
        match self.last_fired {
            None => true,
            Some(last) => current_tick >= last + self.interval,
        }
    }

    fn mark_fired(&mut self, current_tick: u64) {
        self.last_fired = Some(current_tick);
    }
}

/// Mutable per-evaluation context passed to every behavior node.
///
/// Carries the current tick plus borrows of the per-NPC and global
/// cooldown state. Nodes check + bump cooldowns through the
/// [`CooldownState`] trait — no separate commit step.
///
/// The `'a` lifetime ties the context to the borrows held inside; the
/// trait method takes `&mut BehaviorContext<'_>` so callers don't need
/// to thread the lifetime through tree types.
pub struct BehaviorContext<'a> {
    /// The game's current monotonic tick counter.
    pub current_tick: u64,
    /// Per-NPC cooldown handle (e.g. an ability cooldown component on
    /// this entity).
    pub per_npc: &'a mut dyn CooldownState,
    /// Global cooldown handle (e.g. a shared resource limiting how
    /// often any NPC can broadcast a "call for help" message).
    pub global: &'a mut dyn CooldownState,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tick_cooldown_respects_interval() {
        let mut cd = TickCooldown::new(10);
        assert!(cd.can_fire(0));
        cd.mark_fired(0);
        assert!(!cd.can_fire(5));
        assert!(cd.can_fire(10));
        cd.mark_fired(10);
        assert!(!cd.can_fire(15));
        assert!(cd.can_fire(20));
    }
}

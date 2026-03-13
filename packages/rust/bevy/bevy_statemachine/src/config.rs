/// Which Bevy schedule the snapshot system should run in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SnapshotSchedule {
    /// Run during the `Update` schedule — suitable for gameplay state that changes frequently.
    Update,
    /// Run during `PostUpdate` (default) — captures final state after all game systems.
    PostUpdate,
    /// Run during `FixedUpdate` — useful for physics state snapshotted at a fixed rate.
    FixedUpdate,
    /// Run during `Last` — absolute last chance before the frame ends.
    Last,
}

/// Configuration for a [`StateSnapshotPlugin`](crate::StateSnapshotPlugin).
#[derive(Debug, Clone)]
pub struct SnapshotConfig {
    /// Which schedule the snapshot system runs in.
    pub schedule: SnapshotSchedule,
}

impl Default for SnapshotConfig {
    fn default() -> Self {
        Self {
            schedule: SnapshotSchedule::PostUpdate,
        }
    }
}

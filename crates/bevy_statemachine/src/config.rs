/// Which Bevy schedule the snapshot system should run in.
///
/// # Examples
///
/// ```
/// use bevy_statemachine::SnapshotSchedule;
///
/// let schedule = SnapshotSchedule::PostUpdate;
/// assert_eq!(schedule, SnapshotSchedule::PostUpdate);
///
/// // All variants are Copy + Clone + Debug.
/// let copy = schedule;
/// assert_eq!(format!("{:?}", copy), "PostUpdate");
/// ```
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
///
/// # Examples
///
/// ```
/// use bevy_statemachine::{SnapshotConfig, SnapshotSchedule};
///
/// // Default is PostUpdate.
/// let config = SnapshotConfig::default();
/// assert_eq!(config.schedule, SnapshotSchedule::PostUpdate);
///
/// // Override to FixedUpdate for physics state.
/// let config = SnapshotConfig { schedule: SnapshotSchedule::FixedUpdate };
/// assert_eq!(config.schedule, SnapshotSchedule::FixedUpdate);
/// ```
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

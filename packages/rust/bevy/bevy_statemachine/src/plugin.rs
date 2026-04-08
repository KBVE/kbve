//! Bevy plugins for automatic resource snapshotting.

use std::marker::PhantomData;

use bevy::prelude::*;

use crate::config::{SnapshotConfig, SnapshotSchedule};
use crate::store;

// ---------------------------------------------------------------------------
// Helper macro: register a system on a configurable schedule
// ---------------------------------------------------------------------------

macro_rules! add_to_schedule {
    ($app:expr, $schedule:expr, $sys:expr) => {
        match $schedule {
            SnapshotSchedule::Update => $app.add_systems(Update, $sys),
            SnapshotSchedule::PostUpdate => $app.add_systems(PostUpdate, $sys),
            SnapshotSchedule::FixedUpdate => $app.add_systems(FixedUpdate, $sys),
            SnapshotSchedule::Last => $app.add_systems(Last, $sys),
        }
    };
}

// ---------------------------------------------------------------------------
// StateSnapshotPlugin — persistent, read-many snapshots
// ---------------------------------------------------------------------------

/// Bevy plugin that automatically snapshots a resource `T` whenever it changes.
///
/// The snapshot is stored in a thread-safe global, readable via
/// [`get_snapshot`](crate::get_snapshot), [`get_snapshot_json`](crate::get_snapshot_json),
/// or [`get_snapshot_binary`](crate::get_snapshot_binary).
///
/// `T` must implement `serde::Serialize` when either the `serde` or `bincode`
/// feature is enabled.
///
/// # Examples
///
/// ```ignore
/// use bevy::prelude::*;
/// use bevy_statemachine::{StateSnapshotPlugin, SnapshotConfig, SnapshotSchedule};
///
/// #[derive(Resource, Clone, Default, serde::Serialize)]
/// struct PlayerState { health: f32 }
///
/// // Default (PostUpdate):
/// app.add_plugins(StateSnapshotPlugin::<PlayerState>::new());
///
/// // Custom schedule:
/// let config = SnapshotConfig { schedule: SnapshotSchedule::FixedUpdate };
/// app.add_plugins(StateSnapshotPlugin::<PlayerState>::with_config(config));
/// ```
pub struct StateSnapshotPlugin<T: Resource + Clone + 'static> {
    config: SnapshotConfig,
    _marker: PhantomData<T>,
}

impl<T: Resource + Clone + 'static> StateSnapshotPlugin<T> {
    /// Create with default configuration (`PostUpdate` schedule).
    pub fn new() -> Self {
        Self {
            config: SnapshotConfig::default(),
            _marker: PhantomData,
        }
    }

    /// Create with custom configuration.
    pub fn with_config(config: SnapshotConfig) -> Self {
        Self {
            config,
            _marker: PhantomData,
        }
    }
}

impl<T: Resource + Clone + 'static> Default for StateSnapshotPlugin<T> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(feature = "serde", feature = "bincode"))]
impl<T: Resource + Clone + serde::Serialize + 'static> Plugin for StateSnapshotPlugin<T> {
    fn build(&self, app: &mut App) {
        add_to_schedule!(app, self.config.schedule, snapshot_system::<T>);
    }
}

#[cfg(not(any(feature = "serde", feature = "bincode")))]
impl<T: Resource + Clone + 'static> Plugin for StateSnapshotPlugin<T> {
    fn build(&self, _app: &mut App) {}
}

#[cfg(any(feature = "serde", feature = "bincode"))]
fn snapshot_system<T: Resource + Clone + serde::Serialize + 'static>(resource: Res<T>) {
    if resource.is_changed() {
        #[cfg(feature = "serde")]
        let json = serde_json::to_string(resource.as_ref()).ok();

        #[cfg(feature = "bincode")]
        let binary =
            bincode::serde::encode_to_vec(resource.as_ref(), bincode::config::standard()).ok();

        store::write_snapshot::<T>(
            #[cfg(feature = "serde")]
            json,
            #[cfg(feature = "bincode")]
            binary,
        );
    }
}

// ---------------------------------------------------------------------------
// TakeSnapshotPlugin — one-shot, read-and-clear snapshots
// ---------------------------------------------------------------------------

/// Bevy plugin that writes a resource `T` to the take-once store whenever it changes.
///
/// Useful for event-like resources where external consumers only need the latest
/// value once (e.g. click selections, action triggers).
///
/// # Examples
///
/// ```ignore
/// use bevy::prelude::*;
/// use bevy_statemachine::TakeSnapshotPlugin;
///
/// #[derive(Resource, Clone, Default, serde::Serialize)]
/// struct ClickSelection { entity_id: u64 }
///
/// app.add_plugins(TakeSnapshotPlugin::<ClickSelection>::new());
/// ```
pub struct TakeSnapshotPlugin<T: Resource + Clone + 'static> {
    config: SnapshotConfig,
    _marker: PhantomData<T>,
}

impl<T: Resource + Clone + 'static> TakeSnapshotPlugin<T> {
    /// Create with default configuration (`PostUpdate` schedule).
    pub fn new() -> Self {
        Self {
            config: SnapshotConfig::default(),
            _marker: PhantomData,
        }
    }
}

impl<T: Resource + Clone + 'static> Default for TakeSnapshotPlugin<T> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(feature = "serde")]
impl<T: Resource + Clone + serde::Serialize + 'static> Plugin for TakeSnapshotPlugin<T> {
    fn build(&self, app: &mut App) {
        add_to_schedule!(app, self.config.schedule, take_snapshot_system::<T>);
    }
}

#[cfg(not(feature = "serde"))]
impl<T: Resource + Clone + 'static> Plugin for TakeSnapshotPlugin<T> {
    fn build(&self, _app: &mut App) {}
}

#[cfg(feature = "serde")]
fn take_snapshot_system<T: Resource + Clone + serde::Serialize + 'static>(resource: Res<T>) {
    if resource.is_changed() {
        crate::take::write_take_snapshot(resource.as_ref());
    }
}

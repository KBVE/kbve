//! FSM bridge — first-class integration with Bevy's `bevy_state` system.
//!
//! Automatically snapshots FSM state values and transition events to the
//! global snapshot stores, making them readable by external consumers
//! (Tauri IPC, WASM JS) without touching the ECS.

use std::marker::PhantomData;

use bevy::prelude::*;

use crate::store;

// ---------------------------------------------------------------------------
// Snapshot wrapper types
// ---------------------------------------------------------------------------

/// Wrapper that stores the current FSM state value in the snapshot store.
///
/// External consumers read the current state via
/// `get_snapshot::<FsmSnapshot<MyState>>()`.
///
/// # Examples
///
/// ```ignore
/// use bevy_statemachine::{StateBridgePlugin, FsmSnapshot, get_snapshot};
///
/// #[derive(States, Clone, Debug, Default, PartialEq, Eq, Hash,
///          serde::Serialize, serde::Deserialize)]
/// enum GameState { #[default] Menu, Playing, Paused }
///
/// // After registering StateBridgePlugin::<GameState>::new():
/// let state: Option<FsmSnapshot<GameState>> = get_snapshot();
/// ```
#[derive(Clone, Debug)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct FsmSnapshot<S> {
    /// The current FSM state value.
    pub current: S,
}

/// Serializable record of a state transition, written to the take-once store.
///
/// External consumers call
/// `take_snapshot::<StateTransitionRecord<MyState>>()` to detect transitions.
/// The value is consumed on read (take-once semantics).
///
/// # Examples
///
/// ```ignore
/// use bevy_statemachine::{take_snapshot, StateTransitionRecord};
///
/// // After a state transition occurs:
/// if let Some(record) = take_snapshot::<StateTransitionRecord<GameState>>() {
///     println!("Transitioned from {:?} to {:?}", record.exited, record.entered);
/// }
/// ```
#[derive(Clone, Debug)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct StateTransitionRecord<S> {
    /// The state that was exited (`None` if state was just created).
    pub exited: Option<S>,
    /// The state that was entered (`None` if state was removed).
    pub entered: Option<S>,
}

// ---------------------------------------------------------------------------
// StateBridgePlugin<S> — FSM → snapshot bridge
// ---------------------------------------------------------------------------

/// Bevy plugin that bridges a `States` type to the snapshot system.
///
/// Adds two systems:
/// 1. **Persistent snapshot** — writes `FsmSnapshot<S>` to the persistent store
///    whenever the state changes, readable via `get_snapshot::<FsmSnapshot<S>>()`.
/// 2. **Transition record** — writes `StateTransitionRecord<S>` to the take-once
///    store on each transition, readable via `take_snapshot::<StateTransitionRecord<S>>()`.
///
/// # Examples
///
/// ```ignore
/// use bevy::prelude::*;
/// use bevy_statemachine::StateBridgePlugin;
///
/// #[derive(States, Clone, Debug, Default, PartialEq, Eq, Hash,
///          serde::Serialize, serde::Deserialize)]
/// enum GameState { #[default] Menu, Playing, Paused }
///
/// app.init_state::<GameState>();
/// app.add_plugins(StateBridgePlugin::<GameState>::new());
/// ```
pub struct StateBridgePlugin<S: States + 'static> {
    _marker: PhantomData<S>,
}

impl<S: States + 'static> StateBridgePlugin<S> {
    /// Create a new FSM bridge plugin for state type `S`.
    pub fn new() -> Self {
        Self {
            _marker: PhantomData,
        }
    }
}

impl<S: States + 'static> Default for StateBridgePlugin<S> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(feature = "serde")]
impl<S> Plugin for StateBridgePlugin<S>
where
    S: States + serde::Serialize + for<'de> serde::Deserialize<'de> + 'static,
{
    fn build(&self, app: &mut App) {
        app.add_systems(PostUpdate, fsm_snapshot_system::<S>);
        app.add_systems(PostUpdate, fsm_transition_system::<S>);
    }
}

#[cfg(not(feature = "serde"))]
impl<S: States + 'static> Plugin for StateBridgePlugin<S> {
    fn build(&self, _app: &mut App) {}
}

#[cfg(feature = "serde")]
fn fsm_snapshot_system<S>(state: Res<State<S>>)
where
    S: States + serde::Serialize + 'static,
{
    if state.is_changed() {
        let snapshot = FsmSnapshot {
            current: state.get().clone(),
        };

        #[cfg(feature = "serde")]
        let json = serde_json::to_string(&snapshot).ok();

        #[cfg(feature = "bincode")]
        let binary = bincode::serialize(&snapshot).ok();

        store::write_snapshot::<FsmSnapshot<S>>(
            #[cfg(feature = "serde")]
            json,
            #[cfg(feature = "bincode")]
            binary,
        );
    }
}

#[cfg(feature = "serde")]
fn fsm_transition_system<S>(mut transitions: MessageReader<StateTransitionEvent<S>>)
where
    S: States + serde::Serialize + 'static,
{
    if let Some(event) = transitions.read().last() {
        let record = StateTransitionRecord {
            exited: event.exited.clone(),
            entered: event.entered.clone(),
        };
        crate::take::write_take_snapshot(&record);
    }
}

// ---------------------------------------------------------------------------
// ScopedSnapshotPlugin<S, R> — state-scoped resource snapshots
// ---------------------------------------------------------------------------

/// Bevy plugin that snapshots a resource `R` only while in a specific state.
///
/// When the FSM exits the target state, the snapshot is automatically cleared.
/// Useful for state-specific UI: "only show inventory while Playing."
///
/// # Examples
///
/// ```ignore
/// use bevy::prelude::*;
/// use bevy_statemachine::ScopedSnapshotPlugin;
///
/// #[derive(States, Clone, Debug, Default, PartialEq, Eq, Hash)]
/// enum GameState { #[default] Menu, Playing }
///
/// #[derive(Resource, Clone, Default, serde::Serialize)]
/// struct Inventory { items: Vec<String> }
///
/// // Only snapshot Inventory while in Playing state:
/// app.add_plugins(ScopedSnapshotPlugin::<GameState, Inventory>::new(GameState::Playing));
/// ```
pub struct ScopedSnapshotPlugin<S: States + 'static, R: Resource + Clone + 'static> {
    state: S,
    _marker: PhantomData<R>,
}

impl<S: States + 'static, R: Resource + Clone + 'static> ScopedSnapshotPlugin<S, R> {
    /// Create a scoped snapshot plugin that only snapshots `R` while in `state`.
    pub fn new(state: S) -> Self {
        Self {
            state,
            _marker: PhantomData,
        }
    }
}

#[cfg(feature = "serde")]
impl<S, R> Plugin for ScopedSnapshotPlugin<S, R>
where
    S: States + 'static,
    R: Resource + Clone + serde::Serialize + 'static,
{
    fn build(&self, app: &mut App) {
        let state = self.state.clone();
        app.add_systems(
            PostUpdate,
            scoped_snapshot_system::<R>.run_if(in_state(state)),
        );
        app.add_systems(OnExit(self.state.clone()), scoped_clear_system::<R>);
    }
}

#[cfg(not(feature = "serde"))]
impl<S: States + 'static, R: Resource + Clone + 'static> Plugin for ScopedSnapshotPlugin<S, R> {
    fn build(&self, _app: &mut App) {}
}

#[cfg(feature = "serde")]
fn scoped_snapshot_system<R>(resource: Res<R>)
where
    R: Resource + Clone + serde::Serialize + 'static,
{
    if resource.is_changed() {
        #[cfg(feature = "serde")]
        let json = serde_json::to_string(resource.as_ref()).ok();

        #[cfg(feature = "bincode")]
        let binary = bincode::serialize(resource.as_ref()).ok();

        store::write_snapshot::<R>(
            #[cfg(feature = "serde")]
            json,
            #[cfg(feature = "bincode")]
            binary,
        );
    }
}

fn scoped_clear_system<R: 'static>() {
    store::clear_snapshot::<R>();
}

// ---------------------------------------------------------------------------
// Batch version query macro
// ---------------------------------------------------------------------------

/// Query snapshot versions for multiple types at once.
///
/// Returns a `Vec<(&str, u64)>` of `(type_name, version)` pairs.
/// Useful for reducing IPC round-trips when polling from a UI frontend.
///
/// # Examples
///
/// ```
/// use bevy_statemachine::{snapshot_versions_batch, snapshot_version, clear_snapshot};
///
/// #[derive(Clone, serde::Serialize, serde::Deserialize)]
/// struct A { x: i32 }
/// #[derive(Clone, serde::Serialize, serde::Deserialize)]
/// struct B { y: i32 }
///
/// bevy_statemachine::store::write_snapshot::<A>(Some(r#"{"x":1}"#.into()), );
/// bevy_statemachine::store::write_snapshot::<B>(Some(r#"{"y":2}"#.into()), );
///
/// let versions = snapshot_versions_batch!(A, B);
/// assert_eq!(versions.len(), 2);
/// assert!(versions[0].1 > 0); // A has been written
/// assert!(versions[1].1 > 0); // B has been written
///
/// clear_snapshot::<A>();
/// clear_snapshot::<B>();
/// ```
#[macro_export]
macro_rules! snapshot_versions_batch {
    ($($t:ty),+ $(,)?) => {{
        vec![
            $((stringify!($t), $crate::snapshot_version::<$t>())),+
        ]
    }};
}

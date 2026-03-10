//! # bevy_kbve_state
//!
//! Generic state snapshot bridge for Bevy. Automatically publishes any
//! serializable ECS resource to a thread-safe snapshot that external
//! consumers (Tauri commands, WASM JS bindings) can read without touching
//! the ECS.
//!
//! ## Usage
//!
//! ```ignore
//! use bevy_kbve_state::{StateSnapshotPlugin, get_snapshot, get_snapshot_json};
//!
//! #[derive(Resource, Clone, Default, serde::Serialize, serde::Deserialize)]
//! struct PlayerState { health: f32, position: [f32; 3] }
//!
//! // Register the snapshot system:
//! app.add_plugins(StateSnapshotPlugin::<PlayerState>::new());
//!
//! // Read from outside the ECS (e.g. Tauri command):
//! let state: Option<PlayerState> = get_snapshot::<PlayerState>();
//! let json: Option<String> = get_snapshot_json::<PlayerState>();
//! ```

use std::any::TypeId;
use std::collections::HashMap;
use std::marker::PhantomData;
use std::sync::{LazyLock, Mutex, RwLock};

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

// ── Snapshot store ──────────────────────────────────────────────────────

/// Global snapshot store keyed by TypeId. Each resource type gets its own
/// JSON string entry, updated only when Bevy detects a change.
static SNAPSHOT_STORE: LazyLock<RwLock<HashMap<TypeId, String>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

/// Read the latest snapshot for a given resource type.
pub fn get_snapshot<T>() -> Option<T>
where
    T: Resource + Clone + for<'de> Deserialize<'de> + 'static,
{
    let store = SNAPSHOT_STORE.read().ok()?;
    let json = store.get(&TypeId::of::<T>())?;
    serde_json::from_str(json).ok()
}

/// Read the latest snapshot as a raw JSON string.
pub fn get_snapshot_json<T: 'static>() -> Option<String> {
    let store = SNAPSHOT_STORE.read().ok()?;
    store.get(&TypeId::of::<T>()).cloned()
}

/// Write a snapshot (called by the ECS system).
fn write_snapshot<T: 'static>(json: String) {
    if let Ok(mut store) = SNAPSHOT_STORE.write() {
        store.insert(TypeId::of::<T>(), json);
    }
}

/// Clear a snapshot entry.
pub fn clear_snapshot<T: 'static>() {
    if let Ok(mut store) = SNAPSHOT_STORE.write() {
        store.remove(&TypeId::of::<T>());
    }
}

// ── Take-once snapshot (for click/selection events) ─────────────────────

/// Store for "take" semantics — reading clears the value.
/// Useful for one-shot events like click selections.
static TAKE_STORE: LazyLock<Mutex<HashMap<TypeId, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Write a take-once snapshot.
pub fn write_take_snapshot<T: Serialize + 'static>(value: &T) {
    if let Ok(json) = serde_json::to_string(value) {
        if let Ok(mut store) = TAKE_STORE.lock() {
            store.insert(TypeId::of::<T>(), json);
        }
    }
}

/// Read and clear a take-once snapshot.
pub fn take_snapshot<T>() -> Option<T>
where
    T: for<'de> Deserialize<'de> + 'static,
{
    let json = TAKE_STORE.lock().ok()?.remove(&TypeId::of::<T>())?;
    serde_json::from_str(&json).ok()
}

/// Peek at a take-once snapshot without clearing it.
pub fn peek_take_snapshot<T>() -> Option<T>
where
    T: for<'de> Deserialize<'de> + 'static,
{
    let store = TAKE_STORE.lock().ok()?;
    let json = store.get(&TypeId::of::<T>())?;
    serde_json::from_str(json).ok()
}

// ── Plugin ──────────────────────────────────────────────────────────────

/// Bevy plugin that automatically snapshots a resource `T` whenever it changes.
/// The snapshot is stored as JSON in a thread-safe global, readable via
/// `get_snapshot::<T>()` or `get_snapshot_json::<T>()`.
pub struct StateSnapshotPlugin<T: Resource + Clone + Serialize + 'static> {
    _marker: PhantomData<T>,
}

impl<T: Resource + Clone + Serialize + 'static> StateSnapshotPlugin<T> {
    pub fn new() -> Self {
        Self {
            _marker: PhantomData,
        }
    }
}

impl<T: Resource + Clone + Serialize + 'static> Default for StateSnapshotPlugin<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T: Resource + Clone + Serialize + 'static> Plugin for StateSnapshotPlugin<T> {
    fn build(&self, app: &mut App) {
        app.add_systems(PostUpdate, snapshot_system::<T>);
    }
}

fn snapshot_system<T: Resource + Clone + Serialize + 'static>(resource: Res<T>) {
    if resource.is_changed() {
        if let Ok(json) = serde_json::to_string(resource.as_ref()) {
            write_snapshot::<T>(json);
        }
    }
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Resource, Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
    struct TestState {
        value: i32,
    }

    #[test]
    fn write_and_read_snapshot() {
        let state = TestState { value: 42 };
        let json = serde_json::to_string(&state).unwrap();
        write_snapshot::<TestState>(json);

        let read: TestState = get_snapshot::<TestState>().unwrap();
        assert_eq!(read.value, 42);
    }

    #[test]
    fn read_json_snapshot() {
        #[derive(Resource, Clone, Default, Serialize, Deserialize)]
        struct JsonTestState {
            val: i32,
        }

        let state = JsonTestState { val: 99 };
        let json = serde_json::to_string(&state).unwrap();
        write_snapshot::<JsonTestState>(json);

        let json_str = get_snapshot_json::<JsonTestState>().unwrap();
        assert!(json_str.contains("99"));
    }

    #[test]
    fn take_snapshot_clears() {
        #[derive(Serialize, Deserialize, Debug, PartialEq)]
        struct ClickEvent {
            id: u32,
        }

        write_take_snapshot(&ClickEvent { id: 7 });
        let first: Option<ClickEvent> = take_snapshot();
        assert_eq!(first.unwrap().id, 7);

        let second: Option<ClickEvent> = take_snapshot::<ClickEvent>();
        assert!(second.is_none());
    }

    #[test]
    fn clear_snapshot_removes_entry() {
        let state = TestState { value: 10 };
        let json = serde_json::to_string(&state).unwrap();
        write_snapshot::<TestState>(json);
        assert!(get_snapshot::<TestState>().is_some());

        clear_snapshot::<TestState>();
        assert!(get_snapshot::<TestState>().is_none());
    }
}

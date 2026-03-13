//! # bevy_statemachine
//!
//! Thread-safe state snapshot bridge for Bevy. Automatically publishes any
//! serializable ECS resource to a global snapshot that external consumers
//! (Tauri commands, WASM JS bindings, lightyear networking) can read without
//! touching the ECS.
//!
//! ## Features
//!
//! - **`serde`** (default) — JSON snapshots via `serde_json`, for UI/IPC bridging
//! - **`bincode`** — Binary snapshots via `bincode`, for efficient network serialization
//!
//! Both features can be enabled simultaneously. The snapshot system will
//! serialize to all enabled formats on each change.
//!
//! ## Usage
//!
//! ```ignore
//! use bevy_statemachine::{StateSnapshotPlugin, get_snapshot, get_snapshot_json, snapshot_version};
//!
//! #[derive(Resource, Clone, Default, serde::Serialize, serde::Deserialize)]
//! struct PlayerState { health: f32, position: [f32; 3] }
//!
//! // Register the snapshot system (runs in PostUpdate by default):
//! app.add_plugins(StateSnapshotPlugin::<PlayerState>::new());
//!
//! // Read from outside the ECS (e.g. Tauri command or WASM JS binding):
//! let state: Option<PlayerState> = get_snapshot::<PlayerState>();
//! let json: Option<String> = get_snapshot_json::<PlayerState>();
//! let ver: u64 = snapshot_version::<PlayerState>(); // 0 = never written
//! ```
//!
//! ## Take-Once Snapshots
//!
//! For one-shot events (click selections, action triggers), use the take-once API:
//!
//! ```ignore
//! use bevy_statemachine::{write_take_snapshot, take_snapshot};
//!
//! #[derive(serde::Serialize, serde::Deserialize)]
//! struct ClickEvent { entity_id: u64 }
//!
//! // Write from ECS system:
//! write_take_snapshot(&ClickEvent { entity_id: 42 });
//!
//! // Read from external consumer (clears the value):
//! let event: Option<ClickEvent> = take_snapshot();
//! ```

pub mod config;
pub mod plugin;
pub mod store;
pub mod take;

// Re-exports — persistent snapshots
#[cfg(feature = "serde")]
pub use store::get_snapshot;
#[cfg(feature = "bincode")]
pub use store::get_snapshot_binary;
#[cfg(feature = "serde")]
pub use store::get_snapshot_json;
pub use store::{clear_snapshot, snapshot_version};

// Re-exports — take-once snapshots
pub use take::clear_take_snapshot;
#[cfg(feature = "serde")]
pub use take::{peek_take_snapshot, take_snapshot, write_take_snapshot};

// Re-exports — plugins and config
pub use config::{SnapshotConfig, SnapshotSchedule};
pub use plugin::{StateSnapshotPlugin, TakeSnapshotPlugin};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
#[cfg(feature = "serde")]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    // Use unique types per test to avoid cross-test interference in the global store.

    #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
    struct TestState {
        value: i32,
    }

    #[test]
    fn write_and_read_snapshot() {
        store::write_snapshot::<TestState>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&TestState { value: 42 }).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );

        let read: TestState = get_snapshot::<TestState>().unwrap();
        assert_eq!(read.value, 42);
    }

    #[test]
    fn read_json_snapshot() {
        #[derive(Clone, Default, Serialize, Deserialize)]
        struct JsonTestState {
            val: i32,
        }

        store::write_snapshot::<JsonTestState>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&JsonTestState { val: 99 }).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );

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
        #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
        struct ClearTestState {
            value: i32,
        }

        store::write_snapshot::<ClearTestState>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&ClearTestState { value: 10 }).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );
        assert!(get_snapshot::<ClearTestState>().is_some());

        clear_snapshot::<ClearTestState>();
        assert!(get_snapshot::<ClearTestState>().is_none());
    }

    #[test]
    fn snapshot_version_increments() {
        #[derive(Clone, Default, Serialize, Deserialize)]
        struct VersionTestState {
            x: i32,
        }

        assert_eq!(snapshot_version::<VersionTestState>(), 0);

        store::write_snapshot::<VersionTestState>(
            #[cfg(feature = "serde")]
            Some(r#"{"x":1}"#.to_string()),
            #[cfg(feature = "bincode")]
            None,
        );
        let v1 = snapshot_version::<VersionTestState>();
        assert!(v1 > 0);

        store::write_snapshot::<VersionTestState>(
            #[cfg(feature = "serde")]
            Some(r#"{"x":2}"#.to_string()),
            #[cfg(feature = "bincode")]
            None,
        );
        let v2 = snapshot_version::<VersionTestState>();
        assert!(v2 > v1);
    }

    #[test]
    fn clear_take_snapshot_removes() {
        #[derive(Serialize, Deserialize, Debug)]
        struct ClearTakeEvent {
            x: u32,
        }

        write_take_snapshot(&ClearTakeEvent { x: 5 });
        clear_take_snapshot::<ClearTakeEvent>();
        let result: Option<ClearTakeEvent> = take_snapshot();
        assert!(result.is_none());
    }

    #[test]
    fn peek_does_not_clear() {
        #[derive(Serialize, Deserialize, Debug, PartialEq)]
        struct PeekEvent {
            id: u32,
        }

        write_take_snapshot(&PeekEvent { id: 3 });

        let peeked: Option<PeekEvent> = peek_take_snapshot();
        assert_eq!(peeked.unwrap().id, 3);

        // Should still be there after peek
        let taken: Option<PeekEvent> = take_snapshot();
        assert_eq!(taken.unwrap().id, 3);

        // Now should be gone
        let gone: Option<PeekEvent> = take_snapshot::<PeekEvent>();
        assert!(gone.is_none());
    }
}

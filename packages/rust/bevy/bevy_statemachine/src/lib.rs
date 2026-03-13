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

    // -----------------------------------------------------------------------
    // Each test uses a unique type to avoid cross-test interference in the
    // global store (tests run in parallel within the same process).
    // -----------------------------------------------------------------------

    // === Persistent store: basic read/write ================================

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

    // === Persistent store: overwrite semantics =============================

    #[test]
    fn overwrite_replaces_previous_value() {
        #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
        struct OverwriteState {
            n: i32,
        }

        store::write_snapshot::<OverwriteState>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&OverwriteState { n: 1 }).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );
        store::write_snapshot::<OverwriteState>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&OverwriteState { n: 2 }).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );

        let read: OverwriteState = get_snapshot().unwrap();
        assert_eq!(read.n, 2);

        clear_snapshot::<OverwriteState>();
    }

    #[test]
    fn read_is_non_destructive() {
        #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
        struct ReadTwice {
            x: i32,
        }

        store::write_snapshot::<ReadTwice>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&ReadTwice { x: 7 }).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );

        let a: ReadTwice = get_snapshot().unwrap();
        let b: ReadTwice = get_snapshot().unwrap();
        assert_eq!(a, b);

        clear_snapshot::<ReadTwice>();
    }

    // === Persistent store: empty / missing reads ===========================

    #[test]
    fn read_unwritten_type_returns_none() {
        #[derive(Serialize, Deserialize)]
        struct NeverWritten {
            z: bool,
        }

        assert!(get_snapshot::<NeverWritten>().is_none());
        assert!(get_snapshot_json::<NeverWritten>().is_none());
    }

    #[test]
    fn write_none_json_returns_none_on_read() {
        #[derive(Clone, Default, Serialize, Deserialize)]
        struct NoneJsonState {
            v: i32,
        }

        store::write_snapshot::<NoneJsonState>(
            #[cfg(feature = "serde")]
            None,
            #[cfg(feature = "bincode")]
            None,
        );

        // JSON was None, so deserialized read should also be None.
        assert!(get_snapshot::<NoneJsonState>().is_none());
        // But version still incremented.
        assert!(snapshot_version::<NoneJsonState>() > 0);

        clear_snapshot::<NoneJsonState>();
    }

    #[test]
    fn invalid_json_returns_none() {
        #[derive(Clone, Default, Serialize, Deserialize)]
        struct BadJsonState {
            w: i32,
        }

        store::write_snapshot::<BadJsonState>(
            #[cfg(feature = "serde")]
            Some("not valid json{{{".to_string()),
            #[cfg(feature = "bincode")]
            None,
        );

        // Deserialization should fail gracefully.
        assert!(get_snapshot::<BadJsonState>().is_none());
        // Raw JSON string is still accessible.
        let raw = get_snapshot_json::<BadJsonState>().unwrap();
        assert!(raw.contains("not valid json"));

        clear_snapshot::<BadJsonState>();
    }

    // === Persistent store: versioning ======================================

    #[test]
    fn snapshot_version_increments() {
        #[derive(Clone, Default, Serialize, Deserialize)]
        struct VersionTestState {
            x: i32,
        }

        let v0 = snapshot_version::<VersionTestState>();

        store::write_snapshot::<VersionTestState>(
            #[cfg(feature = "serde")]
            Some(r#"{"x":1}"#.to_string()),
            #[cfg(feature = "bincode")]
            None,
        );
        let v1 = snapshot_version::<VersionTestState>();
        assert!(v1 > v0);

        store::write_snapshot::<VersionTestState>(
            #[cfg(feature = "serde")]
            Some(r#"{"x":2}"#.to_string()),
            #[cfg(feature = "bincode")]
            None,
        );
        let v2 = snapshot_version::<VersionTestState>();
        assert!(v2 > v1);
        assert_eq!(v2, v1 + 1);

        clear_snapshot::<VersionTestState>();
    }

    #[test]
    fn version_resets_after_clear() {
        #[derive(Clone, Default, Serialize, Deserialize)]
        struct VersionResetState {
            y: i32,
        }

        store::write_snapshot::<VersionResetState>(
            #[cfg(feature = "serde")]
            Some(r#"{"y":1}"#.to_string()),
            #[cfg(feature = "bincode")]
            None,
        );
        assert!(snapshot_version::<VersionResetState>() > 0);

        clear_snapshot::<VersionResetState>();
        assert_eq!(snapshot_version::<VersionResetState>(), 0);
    }

    // === Persistent store: clear ==========================================

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
    fn clear_nonexistent_is_noop() {
        #[derive(Serialize, Deserialize)]
        struct NeverExisted {
            phantom: bool,
        }

        // Should not panic.
        clear_snapshot::<NeverExisted>();
        assert_eq!(snapshot_version::<NeverExisted>(), 0);
    }

    #[test]
    fn double_clear_is_safe() {
        #[derive(Clone, Default, Serialize, Deserialize)]
        struct DoubleClearState {
            v: i32,
        }

        store::write_snapshot::<DoubleClearState>(
            #[cfg(feature = "serde")]
            Some(r#"{"v":1}"#.to_string()),
            #[cfg(feature = "bincode")]
            None,
        );

        clear_snapshot::<DoubleClearState>();
        clear_snapshot::<DoubleClearState>(); // second clear should not panic
        assert_eq!(snapshot_version::<DoubleClearState>(), 0);
    }

    // === Persistent store: type isolation =================================

    #[test]
    fn different_types_are_isolated() {
        #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
        struct TypeA {
            a: i32,
        }

        #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
        struct TypeB {
            b: String,
        }

        store::write_snapshot::<TypeA>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&TypeA { a: 10 }).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );
        store::write_snapshot::<TypeB>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&TypeB { b: "hello".into() }).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );

        let a: TypeA = get_snapshot().unwrap();
        let b: TypeB = get_snapshot().unwrap();
        assert_eq!(a.a, 10);
        assert_eq!(b.b, "hello");

        // Clearing one does not affect the other.
        clear_snapshot::<TypeA>();
        assert!(get_snapshot::<TypeA>().is_none());
        assert!(get_snapshot::<TypeB>().is_some());

        clear_snapshot::<TypeB>();
    }

    // === Persistent store: complex types ==================================

    #[test]
    fn nested_struct_roundtrip() {
        #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
        struct Inner {
            values: Vec<i32>,
        }

        #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
        struct Outer {
            name: String,
            inner: Inner,
            optional: Option<f64>,
        }

        let original = Outer {
            name: "test".into(),
            inner: Inner {
                values: vec![1, 2, 3],
            },
            optional: Some(3.14),
        };

        store::write_snapshot::<Outer>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&original).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );

        let read: Outer = get_snapshot().unwrap();
        assert_eq!(read, original);

        clear_snapshot::<Outer>();
    }

    #[test]
    fn enum_variant_roundtrip() {
        #[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
        enum GamePhase {
            Loading,
            Playing { level: u32 },
            Paused,
        }

        #[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
        struct PhaseState {
            phase: GamePhase,
        }

        let state = PhaseState {
            phase: GamePhase::Playing { level: 5 },
        };

        store::write_snapshot::<PhaseState>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&state).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );

        let read: PhaseState = get_snapshot().unwrap();
        assert_eq!(read, state);

        clear_snapshot::<PhaseState>();
    }

    #[test]
    fn empty_struct_roundtrip() {
        #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
        struct EmptyState {}

        store::write_snapshot::<EmptyState>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&EmptyState {}).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );

        let read: EmptyState = get_snapshot().unwrap();
        assert_eq!(read, EmptyState {});

        clear_snapshot::<EmptyState>();
    }

    // === Take-once store: basic operations ================================

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
    fn take_unwritten_returns_none() {
        #[derive(Serialize, Deserialize)]
        struct NeverWrittenEvent {
            x: u32,
        }

        assert!(take_snapshot::<NeverWrittenEvent>().is_none());
    }

    #[test]
    fn take_overwrite_returns_latest() {
        #[derive(Serialize, Deserialize, Debug, PartialEq)]
        struct OverwriteEvent {
            seq: u32,
        }

        write_take_snapshot(&OverwriteEvent { seq: 1 });
        write_take_snapshot(&OverwriteEvent { seq: 2 });
        write_take_snapshot(&OverwriteEvent { seq: 3 });

        let taken: OverwriteEvent = take_snapshot().unwrap();
        assert_eq!(taken.seq, 3);

        // Consumed — gone now.
        assert!(take_snapshot::<OverwriteEvent>().is_none());
    }

    // === Take-once store: peek ===========================================

    #[test]
    fn peek_does_not_clear() {
        #[derive(Serialize, Deserialize, Debug, PartialEq)]
        struct PeekEvent {
            id: u32,
        }

        write_take_snapshot(&PeekEvent { id: 3 });

        let peeked: Option<PeekEvent> = peek_take_snapshot();
        assert_eq!(peeked.unwrap().id, 3);

        // Should still be there after peek.
        let taken: Option<PeekEvent> = take_snapshot();
        assert_eq!(taken.unwrap().id, 3);

        // Now should be gone.
        let gone: Option<PeekEvent> = take_snapshot::<PeekEvent>();
        assert!(gone.is_none());
    }

    #[test]
    fn peek_unwritten_returns_none() {
        #[derive(Serialize, Deserialize)]
        struct NeverPeeked {
            v: bool,
        }

        assert!(peek_take_snapshot::<NeverPeeked>().is_none());
    }

    #[test]
    fn multiple_peeks_return_same_value() {
        #[derive(Serialize, Deserialize, Debug, PartialEq)]
        struct MultiPeek {
            val: String,
        }

        write_take_snapshot(&MultiPeek {
            val: "stable".into(),
        });

        for _ in 0..5 {
            let p: MultiPeek = peek_take_snapshot().unwrap();
            assert_eq!(p.val, "stable");
        }

        // Clean up.
        let _: Option<MultiPeek> = take_snapshot();
    }

    // === Take-once store: clear ==========================================

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
    fn clear_take_unwritten_is_noop() {
        #[derive(Serialize, Deserialize)]
        struct NeverWrittenClear {
            q: u8,
        }

        // Should not panic.
        clear_take_snapshot::<NeverWrittenClear>();
    }

    // === Take-once store: type isolation =================================

    #[test]
    fn take_types_are_isolated() {
        #[derive(Serialize, Deserialize, Debug, PartialEq)]
        struct EventA {
            a: i32,
        }

        #[derive(Serialize, Deserialize, Debug, PartialEq)]
        struct EventB {
            b: String,
        }

        write_take_snapshot(&EventA { a: 42 });
        write_take_snapshot(&EventB { b: "hi".into() });

        // Taking one doesn't affect the other.
        let a: EventA = take_snapshot().unwrap();
        assert_eq!(a.a, 42);

        let b: EventB = take_snapshot().unwrap();
        assert_eq!(b.b, "hi");
    }

    // === Take-once store: complex types ==================================

    #[test]
    fn take_with_vec_roundtrip() {
        #[derive(Serialize, Deserialize, Debug, PartialEq)]
        struct BatchEvent {
            ids: Vec<u64>,
        }

        write_take_snapshot(&BatchEvent {
            ids: vec![1, 2, 3, 4, 5],
        });

        let taken: BatchEvent = take_snapshot().unwrap();
        assert_eq!(taken.ids, vec![1, 2, 3, 4, 5]);
    }

    #[test]
    fn take_with_option_fields() {
        #[derive(Serialize, Deserialize, Debug, PartialEq)]
        struct OptionalEvent {
            required: u32,
            optional: Option<String>,
        }

        // With Some
        write_take_snapshot(&OptionalEvent {
            required: 1,
            optional: Some("present".into()),
        });
        let t: OptionalEvent = take_snapshot().unwrap();
        assert_eq!(t.optional, Some("present".into()));

        // With None
        write_take_snapshot(&OptionalEvent {
            required: 2,
            optional: None,
        });
        let t: OptionalEvent = take_snapshot().unwrap();
        assert_eq!(t.optional, None);
    }

    // === Config tests =====================================================

    #[test]
    fn config_default_is_post_update() {
        let config = SnapshotConfig::default();
        assert_eq!(config.schedule, SnapshotSchedule::PostUpdate);
    }

    #[test]
    fn schedule_variants_are_distinct() {
        let variants = [
            SnapshotSchedule::Update,
            SnapshotSchedule::PostUpdate,
            SnapshotSchedule::FixedUpdate,
            SnapshotSchedule::Last,
        ];

        for (i, a) in variants.iter().enumerate() {
            for (j, b) in variants.iter().enumerate() {
                if i == j {
                    assert_eq!(a, b);
                } else {
                    assert_ne!(a, b);
                }
            }
        }
    }

    #[test]
    fn schedule_is_copy_and_clone() {
        let s = SnapshotSchedule::FixedUpdate;
        let copy = s;
        let clone = s.clone();
        assert_eq!(s, copy);
        assert_eq!(s, clone);
    }

    #[test]
    fn schedule_debug_output() {
        assert_eq!(format!("{:?}", SnapshotSchedule::Update), "Update");
        assert_eq!(format!("{:?}", SnapshotSchedule::PostUpdate), "PostUpdate");
        assert_eq!(
            format!("{:?}", SnapshotSchedule::FixedUpdate),
            "FixedUpdate"
        );
        assert_eq!(format!("{:?}", SnapshotSchedule::Last), "Last");
    }

    #[test]
    fn config_clone() {
        let config = SnapshotConfig {
            schedule: SnapshotSchedule::Last,
        };
        let cloned = config.clone();
        assert_eq!(cloned.schedule, SnapshotSchedule::Last);
    }

    // === Write-after-clear cycle ==========================================

    #[test]
    fn write_after_clear_works() {
        #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
        struct CycleState {
            round: u32,
        }

        // Write → clear → write → read should return second value.
        store::write_snapshot::<CycleState>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&CycleState { round: 1 }).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );
        clear_snapshot::<CycleState>();
        store::write_snapshot::<CycleState>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&CycleState { round: 2 }).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );

        let read: CycleState = get_snapshot().unwrap();
        assert_eq!(read.round, 2);

        clear_snapshot::<CycleState>();
    }

    #[test]
    fn take_write_after_take_works() {
        #[derive(Serialize, Deserialize, Debug, PartialEq)]
        struct CycleTakeEvent {
            seq: u32,
        }

        write_take_snapshot(&CycleTakeEvent { seq: 1 });
        let _: CycleTakeEvent = take_snapshot().unwrap();

        write_take_snapshot(&CycleTakeEvent { seq: 2 });
        let t: CycleTakeEvent = take_snapshot().unwrap();
        assert_eq!(t.seq, 2);
    }

    // === Large data ======================================================

    #[test]
    fn large_string_roundtrip() {
        #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
        struct BigState {
            data: String,
        }

        let big = "x".repeat(100_000);
        store::write_snapshot::<BigState>(
            #[cfg(feature = "serde")]
            Some(serde_json::to_string(&BigState { data: big.clone() }).unwrap()),
            #[cfg(feature = "bincode")]
            None,
        );

        let read: BigState = get_snapshot().unwrap();
        assert_eq!(read.data.len(), 100_000);

        clear_snapshot::<BigState>();
    }

    // === Many rapid writes ===============================================

    #[test]
    fn rapid_writes_always_return_latest() {
        #[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
        struct RapidState {
            counter: u32,
        }

        for i in 0..100 {
            store::write_snapshot::<RapidState>(
                #[cfg(feature = "serde")]
                Some(serde_json::to_string(&RapidState { counter: i }).unwrap()),
                #[cfg(feature = "bincode")]
                None,
            );
        }

        let read: RapidState = get_snapshot().unwrap();
        assert_eq!(read.counter, 99);
        assert_eq!(snapshot_version::<RapidState>(), 100);

        clear_snapshot::<RapidState>();
    }

    // === JSON string content =============================================

    #[test]
    fn json_snapshot_is_valid_json() {
        #[derive(Clone, Default, Serialize, Deserialize)]
        struct JsonValidState {
            name: String,
            value: f64,
        }

        store::write_snapshot::<JsonValidState>(
            #[cfg(feature = "serde")]
            Some(
                serde_json::to_string(&JsonValidState {
                    name: "test".into(),
                    value: 3.14,
                })
                .unwrap(),
            ),
            #[cfg(feature = "bincode")]
            None,
        );

        let json = get_snapshot_json::<JsonValidState>().unwrap();
        // Should parse as valid JSON.
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["name"], "test");

        clear_snapshot::<JsonValidState>();
    }
}

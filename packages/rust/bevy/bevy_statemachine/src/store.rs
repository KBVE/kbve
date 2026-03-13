//! Persistent snapshot store — read-many semantics.
//!
//! Each resource type gets its own entry keyed by `TypeId`. Updated only when
//! Bevy detects a change via the plugin system.

use std::any::TypeId;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Snapshot entry
// ---------------------------------------------------------------------------

#[derive(Clone, Default)]
pub(crate) struct SnapshotEntry {
    #[cfg(feature = "serde")]
    pub json: Option<String>,
    #[cfg(feature = "bincode")]
    pub binary: Option<Vec<u8>>,
    pub version: u64,
}

// ---------------------------------------------------------------------------
// Platform-specific store
// ---------------------------------------------------------------------------

#[cfg(not(target_arch = "wasm32"))]
mod inner {
    use super::*;
    use std::sync::{LazyLock, Mutex};

    static STORE: LazyLock<Mutex<HashMap<TypeId, SnapshotEntry>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));

    pub(crate) fn write(type_id: TypeId, mut updater: impl FnMut(&mut SnapshotEntry)) {
        if let Ok(mut store) = STORE.lock() {
            let entry = store.entry(type_id).or_default();
            entry.version += 1;
            updater(entry);
        }
    }

    pub(crate) fn read(type_id: TypeId) -> Option<SnapshotEntry> {
        STORE.lock().ok()?.get(&type_id).cloned()
    }

    pub(crate) fn version(type_id: TypeId) -> u64 {
        STORE
            .lock()
            .ok()
            .and_then(|s| s.get(&type_id).map(|e| e.version))
            .unwrap_or(0)
    }

    pub(crate) fn clear(type_id: TypeId) {
        if let Ok(mut store) = STORE.lock() {
            store.remove(&type_id);
        }
    }
}

#[cfg(target_arch = "wasm32")]
mod inner {
    use super::*;
    use std::cell::RefCell;

    thread_local! {
        static STORE: RefCell<HashMap<TypeId, SnapshotEntry>> = RefCell::new(HashMap::new());
    }

    pub(crate) fn write(type_id: TypeId, mut updater: impl FnMut(&mut SnapshotEntry)) {
        STORE.with(|store| {
            let mut store = store.borrow_mut();
            let entry = store.entry(type_id).or_default();
            entry.version += 1;
            updater(entry);
        });
    }

    pub(crate) fn read(type_id: TypeId) -> Option<SnapshotEntry> {
        STORE.with(|store| store.borrow().get(&type_id).cloned())
    }

    pub(crate) fn version(type_id: TypeId) -> u64 {
        STORE.with(|store| store.borrow().get(&type_id).map(|e| e.version).unwrap_or(0))
    }

    pub(crate) fn clear(type_id: TypeId) {
        STORE.with(|store| {
            store.borrow_mut().remove(&type_id);
        });
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Write a snapshot for type `T`. Called internally by the snapshot system.
pub(crate) fn write_snapshot<T: 'static>(
    #[cfg(feature = "serde")] json: Option<String>,
    #[cfg(feature = "bincode")] binary: Option<Vec<u8>>,
) {
    inner::write(TypeId::of::<T>(), |entry| {
        #[cfg(feature = "serde")]
        {
            entry.json = json.clone();
        }
        #[cfg(feature = "bincode")]
        {
            entry.binary = binary.clone();
        }
    });
}

/// Read the latest snapshot as a deserialized value.
#[cfg(feature = "serde")]
pub fn get_snapshot<T>() -> Option<T>
where
    T: for<'de> serde::Deserialize<'de> + 'static,
{
    let entry = inner::read(TypeId::of::<T>())?;
    let json = entry.json.as_ref()?;
    serde_json::from_str(json).ok()
}

/// Read the latest snapshot as a raw JSON string.
#[cfg(feature = "serde")]
pub fn get_snapshot_json<T: 'static>() -> Option<String> {
    inner::read(TypeId::of::<T>())?.json
}

/// Read the latest snapshot as raw bincode bytes.
#[cfg(feature = "bincode")]
pub fn get_snapshot_binary<T: 'static>() -> Option<Vec<u8>> {
    inner::read(TypeId::of::<T>())?.binary
}

/// Returns the monotonic version counter for type `T`.
/// Returns `0` if no snapshot has been written yet.
pub fn snapshot_version<T: 'static>() -> u64 {
    inner::version(TypeId::of::<T>())
}

/// Remove the snapshot for type `T`.
pub fn clear_snapshot<T: 'static>() {
    inner::clear(TypeId::of::<T>());
}

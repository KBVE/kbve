//! Take-once snapshot store — read-and-clear semantics.
//!
//! Useful for one-shot events (click selections, UI actions) where the
//! consumer should only process each value once.

use std::any::TypeId;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Platform-specific store
// ---------------------------------------------------------------------------

#[cfg(not(target_arch = "wasm32"))]
mod inner {
    use super::*;
    use std::sync::{LazyLock, Mutex};

    static STORE: LazyLock<Mutex<HashMap<TypeId, String>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));

    pub(crate) fn write(type_id: TypeId, json: String) {
        if let Ok(mut store) = STORE.lock() {
            store.insert(type_id, json);
        }
    }

    pub(crate) fn take(type_id: TypeId) -> Option<String> {
        STORE.lock().ok()?.remove(&type_id)
    }

    pub(crate) fn peek(type_id: TypeId) -> Option<String> {
        STORE.lock().ok()?.get(&type_id).cloned()
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
        static STORE: RefCell<HashMap<TypeId, String>> = RefCell::new(HashMap::new());
    }

    pub(crate) fn write(type_id: TypeId, json: String) {
        STORE.with(|store| {
            store.borrow_mut().insert(type_id, json);
        });
    }

    pub(crate) fn take(type_id: TypeId) -> Option<String> {
        STORE.with(|store| store.borrow_mut().remove(&type_id))
    }

    pub(crate) fn peek(type_id: TypeId) -> Option<String> {
        STORE.with(|store| store.borrow().get(&type_id).cloned())
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

/// Write a take-once snapshot. Overwrites any previous unread value.
///
/// # Examples
///
/// ```
/// use bevy_statemachine::{write_take_snapshot, take_snapshot};
///
/// #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
/// struct Click { entity_id: u64 }
///
/// write_take_snapshot(&Click { entity_id: 42 });
/// let c: Click = take_snapshot().unwrap();
/// assert_eq!(c.entity_id, 42);
/// ```
#[cfg(feature = "serde")]
pub fn write_take_snapshot<T: serde::Serialize + 'static>(value: &T) {
    if let Ok(json) = serde_json::to_string(value) {
        inner::write(TypeId::of::<T>(), json);
    }
}

/// Read and clear a take-once snapshot.
///
/// Returns `None` if no value has been written, or if the value was
/// already consumed by a prior call. This is the primary consumption
/// method — each value can only be read once.
///
/// # Examples
///
/// ```
/// use bevy_statemachine::{write_take_snapshot, take_snapshot};
///
/// #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
/// struct Action { kind: String }
///
/// write_take_snapshot(&Action { kind: "jump".into() });
///
/// // First take succeeds:
/// let a: Action = take_snapshot().unwrap();
/// assert_eq!(a.kind, "jump");
///
/// // Second take returns None — value was consumed:
/// assert!(take_snapshot::<Action>().is_none());
/// ```
#[cfg(feature = "serde")]
pub fn take_snapshot<T>() -> Option<T>
where
    T: for<'de> serde::Deserialize<'de> + 'static,
{
    let json = inner::take(TypeId::of::<T>())?;
    serde_json::from_str(&json).ok()
}

/// Peek at a take-once snapshot without clearing it.
///
/// Useful when you need to inspect the value but leave it available for
/// a later [`take_snapshot`] call.
///
/// # Examples
///
/// ```
/// use bevy_statemachine::{write_take_snapshot, peek_take_snapshot, take_snapshot};
///
/// #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
/// struct Msg { text: String }
///
/// write_take_snapshot(&Msg { text: "hello".into() });
///
/// // Peek does not consume:
/// let peeked: Msg = peek_take_snapshot().unwrap();
/// assert_eq!(peeked.text, "hello");
///
/// // Value is still there for take:
/// let taken: Msg = take_snapshot().unwrap();
/// assert_eq!(taken.text, "hello");
/// ```
#[cfg(feature = "serde")]
pub fn peek_take_snapshot<T>() -> Option<T>
where
    T: for<'de> serde::Deserialize<'de> + 'static,
{
    let json = inner::peek(TypeId::of::<T>())?;
    serde_json::from_str(&json).ok()
}

/// Explicitly clear a take-once snapshot without reading it.
///
/// # Examples
///
/// ```
/// use bevy_statemachine::{write_take_snapshot, clear_take_snapshot, take_snapshot};
///
/// #[derive(serde::Serialize, serde::Deserialize)]
/// struct Evt { id: u32 }
///
/// write_take_snapshot(&Evt { id: 1 });
/// clear_take_snapshot::<Evt>();
/// assert!(take_snapshot::<Evt>().is_none());
/// ```
pub fn clear_take_snapshot<T: 'static>() {
    inner::clear(TypeId::of::<T>());
}

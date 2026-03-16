//! Adapter that implements [`bevy_inventory::ItemKind`] for [`ProtoItemId`].
//!
//! Enabled by the `inventory` feature flag. This lets any game use
//! `Inventory<ProtoItemKind>` to get slot-based inventory management backed
//! by the proto item database.
//!
//! # Setup
//!
//! Call [`init_item_db`] once during startup, after your [`ItemDb`] is loaded,
//! so that [`ProtoItemKind`] can resolve display names and max-stack values.
//!
//! ```rust,ignore
//! use bevy_items::{ItemDb, inventory_adapter};
//!
//! let db = ItemDb::from_json(json).unwrap();
//! inventory_adapter::init_item_db(&db);
//! // Now Inventory<ProtoItemKind> works
//! ```

use std::sync::OnceLock;

use bevy_inventory::ItemKind;
use serde::{Deserialize, Serialize};

use crate::{ItemDb, ProtoItemId};

/// Global reference to the loaded [`ItemDb`], used by [`ProtoItemKind`] to
/// resolve display names and max-stack values at runtime.
static ITEM_DB_REF: OnceLock<&'static ItemDb> = OnceLock::new();

/// Initialize the global [`ItemDb`] reference used by [`ProtoItemKind`].
///
/// Must be called once before any `ProtoItemKind::display_name()` or
/// `max_stack()` calls. Subsequent calls are no-ops.
pub fn init_item_db(db: &'static ItemDb) {
    let _ = ITEM_DB_REF.set(db);
}

/// Get the global [`ItemDb`] reference, if initialized.
pub fn get_item_db() -> Option<&'static ItemDb> {
    ITEM_DB_REF.get().copied()
}

/// A lightweight item identifier that implements [`ItemKind`] by looking up
/// metadata from the global [`ItemDb`].
///
/// Wraps a [`ProtoItemId`] (stable hash of the item ref) and an optional
/// cached ref string for serialization round-tripping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProtoItemKind {
    /// The stable numeric ID derived from the item ref.
    pub id: ProtoItemId,
}

impl ProtoItemKind {
    /// Create from a [`ProtoItemId`].
    pub fn new(id: ProtoItemId) -> Self {
        Self { id }
    }

    /// Create from an item ref (e.g. `"fire-flask"`).
    pub fn from_ref(r: &str) -> Self {
        Self {
            id: ProtoItemId::from_ref(r),
        }
    }

    /// Look up the full proto [`Item`](crate::Item) from the global database.
    pub fn item(&self) -> Option<&'static crate::Item> {
        get_item_db()?.get(self.id)
    }
}

impl ItemKind for ProtoItemKind {
    fn display_name(&self) -> &'static str {
        get_item_db()
            .map(|db| db.display_name(self.id))
            .unwrap_or("Unknown")
    }

    fn max_stack(&self) -> u32 {
        get_item_db().map(|db| db.max_stack(self.id)).unwrap_or(1)
    }
}

impl From<ProtoItemId> for ProtoItemKind {
    fn from(id: ProtoItemId) -> Self {
        Self::new(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proto_item_kind_from_ref() {
        let kind = ProtoItemKind::from_ref("potion");
        assert_eq!(kind.id, ProtoItemId::from_ref("potion"));
    }

    #[test]
    fn display_name_without_db_returns_unknown() {
        let kind = ProtoItemKind::from_ref("nonexistent");
        assert_eq!(kind.display_name(), "Unknown");
    }

    #[test]
    fn max_stack_without_db_returns_one() {
        let kind = ProtoItemKind::from_ref("nonexistent");
        assert_eq!(kind.max_stack(), 1);
    }
}

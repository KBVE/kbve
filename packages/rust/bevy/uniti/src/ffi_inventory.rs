// FFI bridge for the inventory system (Unity / C# consumer).
// Shared safety contract for `pub unsafe extern "C" fn` items is
// documented at the crate root (src/lib.rs).

use std::ffi::c_void;

use bevy_inventory::{Inventory, ItemKind};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// RareIcon item enum — the concrete type for FFI
// ---------------------------------------------------------------------------

/// Item kinds for RareIcon. This is the FFI-side definition that mirrors
/// what Unity uses. Add new items here and they're automatically available
/// through the FFI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u16)]
pub enum RareItem {
    // -- Consumables --
    HealthPotion = 0,
    ManaPotion = 1,
    Antidote = 2,

    // -- Equipment --
    IronSword = 100,
    IronShield = 101,
    IronArmor = 102,

    // -- Materials --
    WoodLog = 200,
    IronOre = 201,
    Crystal = 202,
    RawCacti = 207,
    CactiNeedle = 208,
    PricklyPear = 209,
    Dragonfruit = 210,
    CactiSeeds = 211,
    RawChicken = 221,
    Feather = 222,
    RawMutton = 223,
    Wool = 224,
    RawBeef = 225,
    Leather = 226,

    // -- Quest --
    QuestScroll = 300,
    BossKey = 301,
}

impl ItemKind for RareItem {
    fn display_name(&self) -> &'static str {
        match self {
            Self::HealthPotion => "Health Potion",
            Self::ManaPotion => "Mana Potion",
            Self::Antidote => "Antidote",
            Self::IronSword => "Iron Sword",
            Self::IronShield => "Iron Shield",
            Self::IronArmor => "Iron Armor",
            Self::WoodLog => "Wood Log",
            Self::IronOre => "Iron Ore",
            Self::Crystal => "Crystal",
            Self::RawCacti => "Raw Cacti",
            Self::CactiNeedle => "Cacti Needle",
            Self::PricklyPear => "Prickly Pear",
            Self::Dragonfruit => "Dragonfruit",
            Self::CactiSeeds => "Cacti Seeds",
            Self::RawChicken => "Raw Chicken",
            Self::Feather => "Feather",
            Self::RawMutton => "Raw Mutton",
            Self::Wool => "Wool",
            Self::RawBeef => "Raw Beef",
            Self::Leather => "Leather",
            Self::QuestScroll => "Quest Scroll",
            Self::BossKey => "Boss Key",
        }
    }

    fn max_stack(&self) -> u32 {
        match self {
            Self::HealthPotion | Self::ManaPotion | Self::Antidote => 16,
            Self::WoodLog | Self::IronOre | Self::Crystal => 64,
            Self::RawCacti | Self::CactiNeedle => 99,
            Self::PricklyPear | Self::Dragonfruit | Self::CactiSeeds => 64,
            Self::RawChicken | Self::RawMutton | Self::RawBeef => 32,
            Self::Feather | Self::Wool | Self::Leather => 99,
            Self::QuestScroll => 1,
            Self::BossKey => 1,
            _ => 1, // equipment doesn't stack
        }
    }
}

// ---------------------------------------------------------------------------
// FFI structs
// ---------------------------------------------------------------------------

/// Slot data returned to C#.
#[repr(C)]
pub struct FfiSlot {
    pub item_id: u16,
    pub quantity: u32,
    pub valid: u8,
}

// ---------------------------------------------------------------------------
// Inventory lifecycle
// ---------------------------------------------------------------------------

/// Create an inventory with the given slot capacity.
/// Caller must free with `uniti_inventory_free`.
#[unsafe(no_mangle)]
pub extern "C" fn uniti_inventory_new(max_slots: u32) -> *mut c_void {
    let inv = Box::new(Inventory::<RareItem>::new(max_slots as usize));
    Box::into_raw(inv) as *mut c_void
}

/// Free an inventory.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_free(inv: *mut c_void) {
    if !inv.is_null() {
        unsafe { drop(Box::from_raw(inv as *mut Inventory<RareItem>)) };
    }
}

// ---------------------------------------------------------------------------
// Add / Remove
// ---------------------------------------------------------------------------

/// Add items to the inventory. Returns overflow count (0 = all fit).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_add(inv: *mut c_void, item_id: u16, quantity: u32) -> u32 {
    let inv = match unsafe { to_inv_mut(inv) } {
        Some(i) => i,
        None => return quantity,
    };
    let kind = match id_to_item(item_id) {
        Some(k) => k,
        None => return quantity,
    };
    inv.add(kind, quantity)
}

/// Remove items from the inventory. Returns amount actually removed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_remove(
    inv: *mut c_void,
    item_id: u16,
    quantity: u32,
) -> u32 {
    let inv = match unsafe { to_inv_mut(inv) } {
        Some(i) => i,
        None => return 0,
    };
    let kind = match id_to_item(item_id) {
        Some(k) => k,
        None => return 0,
    };
    inv.remove(kind, quantity)
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/// Count total quantity of an item kind.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_count(inv: *const c_void, item_id: u16) -> u32 {
    let inv = match unsafe { to_inv(inv) } {
        Some(i) => i,
        None => return 0,
    };
    let kind = match id_to_item(item_id) {
        Some(k) => k,
        None => return 0,
    };
    inv.count(kind)
}

/// Number of occupied slots.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_slot_count(inv: *const c_void) -> u32 {
    match unsafe { to_inv(inv) } {
        Some(i) => i.slot_count() as u32,
        None => 0,
    }
}

/// Read a specific slot. Returns FfiSlot with valid=0 if out of bounds.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_get_slot(inv: *const c_void, index: u32) -> FfiSlot {
    let inv = match unsafe { to_inv(inv) } {
        Some(i) => i,
        None => {
            return FfiSlot {
                item_id: 0,
                quantity: 0,
                valid: 0,
            };
        }
    };
    match inv.get_slot(index as usize) {
        Some(stack) => FfiSlot {
            item_id: stack.kind as u16,
            quantity: stack.quantity,
            valid: 1,
        },
        None => FfiSlot {
            item_id: 0,
            quantity: 0,
            valid: 0,
        },
    }
}

/// Check if the inventory has room for a quantity of an item.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_has_room(
    inv: *const c_void,
    item_id: u16,
    quantity: u32,
) -> u8 {
    let inv = match unsafe { to_inv(inv) } {
        Some(i) => i,
        None => return 0,
    };
    let kind = match id_to_item(item_id) {
        Some(k) => k,
        None => return 0,
    };
    inv.has_room_for(kind, quantity) as u8
}

// ---------------------------------------------------------------------------
// Slot operations
// ---------------------------------------------------------------------------

/// Swap two slots. Returns 1 on success, 0 on failure.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_swap(inv: *mut c_void, a: u32, b: u32) -> u8 {
    match unsafe { to_inv_mut(inv) } {
        Some(i) => i.swap_slots(a as usize, b as usize) as u8,
        None => 0,
    }
}

/// Split a stack. Returns 1 on success, 0 on failure.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_split(inv: *mut c_void, slot: u32, quantity: u32) -> u8 {
    match unsafe { to_inv_mut(inv) } {
        Some(i) => i.split_stack(slot as usize, quantity) as u8,
        None => 0,
    }
}

/// Merge slot `from` into slot `to`. Returns items moved.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_merge(inv: *mut c_void, from: u32, to: u32) -> u32 {
    match unsafe { to_inv_mut(inv) } {
        Some(i) => i.merge_slots(from as usize, to as usize),
        None => 0,
    }
}

/// Compact fragmented stacks.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_compact(inv: *mut c_void) {
    if let Some(i) = unsafe { to_inv_mut(inv) } {
        i.compact();
    }
}

/// Clear all items.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_clear(inv: *mut c_void) {
    if let Some(i) = unsafe { to_inv_mut(inv) } {
        i.clear();
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

unsafe fn to_inv(ptr: *const c_void) -> Option<&'static Inventory<RareItem>> {
    if ptr.is_null() {
        None
    } else {
        Some(unsafe { &*(ptr as *const Inventory<RareItem>) })
    }
}

unsafe fn to_inv_mut(ptr: *mut c_void) -> Option<&'static mut Inventory<RareItem>> {
    if ptr.is_null() {
        None
    } else {
        Some(unsafe { &mut *(ptr as *mut Inventory<RareItem>) })
    }
}

fn id_to_item(id: u16) -> Option<RareItem> {
    match id {
        0 => Some(RareItem::HealthPotion),
        1 => Some(RareItem::ManaPotion),
        2 => Some(RareItem::Antidote),
        100 => Some(RareItem::IronSword),
        101 => Some(RareItem::IronShield),
        102 => Some(RareItem::IronArmor),
        200 => Some(RareItem::WoodLog),
        201 => Some(RareItem::IronOre),
        202 => Some(RareItem::Crystal),
        207 => Some(RareItem::RawCacti),
        208 => Some(RareItem::CactiNeedle),
        221 => Some(RareItem::RawChicken),
        222 => Some(RareItem::Feather),
        223 => Some(RareItem::RawMutton),
        224 => Some(RareItem::Wool),
        225 => Some(RareItem::RawBeef),
        226 => Some(RareItem::Leather),
        209 => Some(RareItem::PricklyPear),
        210 => Some(RareItem::Dragonfruit),
        211 => Some(RareItem::CactiSeeds),
        300 => Some(RareItem::QuestScroll),
        301 => Some(RareItem::BossKey),
        _ => None,
    }
}

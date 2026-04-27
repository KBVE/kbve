//! Inventory FFI surface — slot-based storage over an opaque handle.
//! See the crate root for the shared safety contract.

use std::ffi::c_void;

use bevy_inventory::{Inventory, ItemKind};
use serde::{Deserialize, Serialize};

/// Item kinds for RareIcon. Mirrors the Unity-side enum; new entries
/// here become available to C# automatically.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u16)]
pub enum RareItem {
    // Consumables
    HealthPotion = 0,
    ManaPotion = 1,
    Antidote = 2,

    // Equipment
    IronSword = 100,
    IronShield = 101,
    IronArmor = 102,

    // Materials
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
    CookedChicken = 227,
    CookedMutton = 228,
    CookedBeef = 229,
    WolfPelt = 230,
    WolfFang = 231,
    BanditCoin = 232,
    Egg = 233,
    Milk = 234,
    CookedEgg = 235,
    Cheese = 236,

    // Quest
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
            Self::CookedChicken => "Cooked Chicken",
            Self::CookedMutton => "Cooked Mutton",
            Self::CookedBeef => "Cooked Beef",
            Self::WolfPelt => "Wolf Pelt",
            Self::WolfFang => "Wolf Fang",
            Self::BanditCoin => "Bandit Coin",
            Self::Egg => "Egg",
            Self::Milk => "Milk",
            Self::CookedEgg => "Cooked Egg",
            Self::Cheese => "Cheese",
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
            Self::CookedChicken | Self::CookedMutton | Self::CookedBeef => 32,
            Self::WolfPelt => 99,
            Self::WolfFang | Self::BanditCoin => 64,
            Self::Egg | Self::Milk => 64,
            Self::CookedEgg | Self::Cheese => 32,
            Self::QuestScroll => 1,
            Self::BossKey => 1,
            _ => 1,
        }
    }
}

/// Slot data returned to C#. `valid = 0` indicates an empty or
/// out-of-range slot.
#[repr(C)]
pub struct FfiSlot {
    pub item_id: u16,
    pub quantity: u32,
    pub valid: u8,
}

/// Create an inventory with the given slot capacity.
///
/// # Arguments
///
/// * `max_slots` — slot capacity.
///
/// # Returns
///
/// Opaque handle the caller must eventually pass to
/// [`uniti_inventory_free`].
#[unsafe(no_mangle)]
pub extern "C" fn uniti_inventory_new(max_slots: u32) -> *mut c_void {
    let inv = Box::new(Inventory::<RareItem>::new(max_slots as usize));
    Box::into_raw(inv) as *mut c_void
}

/// Free an inventory. Null-safe.
///
/// # Safety
///
/// `inv` (when non-null) must be a live handle from
/// [`uniti_inventory_new`] that has not yet been freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_free(inv: *mut c_void) {
    if !inv.is_null() {
        unsafe { drop(Box::from_raw(inv as *mut Inventory<RareItem>)) };
    }
}

/// Add `quantity` of `item_id` to the inventory.
///
/// # Returns
///
/// Overflow count — items that did not fit (`0` = all fit). When `inv`
/// is null or `item_id` is unknown, returns `quantity` (nothing added).
///
/// # Safety
///
/// `inv` (when non-null) must point to a live inventory handle.
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

/// Remove up to `quantity` of `item_id` from the inventory.
///
/// # Returns
///
/// The amount actually removed. Returns `0` for null `inv` or unknown
/// `item_id`.
///
/// # Safety
///
/// `inv` (when non-null) must point to a live inventory handle.
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

/// Total quantity of `item_id` summed across all slots.
///
/// # Returns
///
/// `0` for null `inv` or unknown `item_id`.
///
/// # Safety
///
/// `inv` (when non-null) must point to a live inventory handle.
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
///
/// # Returns
///
/// Slot count, or `0` if `inv` is null.
///
/// # Safety
///
/// `inv` (when non-null) must point to a live inventory handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_slot_count(inv: *const c_void) -> u32 {
    match unsafe { to_inv(inv) } {
        Some(i) => i.slot_count() as u32,
        None => 0,
    }
}

/// Read the slot at `index`.
///
/// # Returns
///
/// [`FfiSlot`] with `valid = 1` and the stack contents on hit;
/// `valid = 0` (and zeroed `item_id`/`quantity`) when `inv` is null or
/// `index` is out of range.
///
/// # Safety
///
/// `inv` (when non-null) must point to a live inventory handle.
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

/// Returns `1` if the inventory has room for `quantity` of `item_id`,
/// `0` otherwise (also `0` for null `inv` or unknown `item_id`).
///
/// # Safety
///
/// `inv` (when non-null) must point to a live inventory handle.
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

/// Swap two slots by index.
///
/// # Returns
///
/// `1` on success, `0` if `inv` is null or either index is out of range.
///
/// # Safety
///
/// `inv` (when non-null) must point to a live inventory handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_swap(inv: *mut c_void, a: u32, b: u32) -> u8 {
    match unsafe { to_inv_mut(inv) } {
        Some(i) => i.swap_slots(a as usize, b as usize) as u8,
        None => 0,
    }
}

/// Split `quantity` items off the stack at `slot` into a new stack.
///
/// # Returns
///
/// `1` on success, `0` if `inv` is null, `slot` is out of range, or the
/// inventory has no free slot to receive the split.
///
/// # Safety
///
/// `inv` (when non-null) must point to a live inventory handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_split(inv: *mut c_void, slot: u32, quantity: u32) -> u8 {
    match unsafe { to_inv_mut(inv) } {
        Some(i) => i.split_stack(slot as usize, quantity) as u8,
        None => 0,
    }
}

/// Merge slot `from` into slot `to`.
///
/// # Returns
///
/// Number of items moved. `0` for null `inv` or invalid slot indices.
///
/// # Safety
///
/// `inv` (when non-null) must point to a live inventory handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_merge(inv: *mut c_void, from: u32, to: u32) -> u32 {
    match unsafe { to_inv_mut(inv) } {
        Some(i) => i.merge_slots(from as usize, to as usize),
        None => 0,
    }
}

/// Compact fragmented stacks (merges partial stacks of the same kind).
/// No-op if `inv` is null.
///
/// # Safety
///
/// `inv` (when non-null) must point to a live inventory handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_compact(inv: *mut c_void) {
    if let Some(i) = unsafe { to_inv_mut(inv) } {
        i.compact();
    }
}

/// Clear all items. No-op if `inv` is null.
///
/// # Safety
///
/// `inv` (when non-null) must point to a live inventory handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_inventory_clear(inv: *mut c_void) {
    if let Some(i) = unsafe { to_inv_mut(inv) } {
        i.clear();
    }
}

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
        227 => Some(RareItem::CookedChicken),
        228 => Some(RareItem::CookedMutton),
        229 => Some(RareItem::CookedBeef),
        230 => Some(RareItem::WolfPelt),
        231 => Some(RareItem::WolfFang),
        232 => Some(RareItem::BanditCoin),
        233 => Some(RareItem::Egg),
        234 => Some(RareItem::Milk),
        235 => Some(RareItem::CookedEgg),
        236 => Some(RareItem::Cheese),
        209 => Some(RareItem::PricklyPear),
        210 => Some(RareItem::Dragonfruit),
        211 => Some(RareItem::CactiSeeds),
        300 => Some(RareItem::QuestScroll),
        301 => Some(RareItem::BossKey),
        _ => None,
    }
}

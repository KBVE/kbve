use bevy::prelude::Resource;

use crate::sim::{Inventory, ItemStack};

pub const TRADE_RANGE: i32 = 1;
pub const TRADE_TIMEOUT_TICKS: u32 = crate::sim::SIM_TICK_HZ * 30;
pub const MAX_INVENTORY_SLOTS: usize = 28;

#[derive(Default, Clone)]
pub struct TradeSide {
    pub items: Vec<(String, u32)>,
    pub accepted: bool,
}

pub struct TradeSession {
    pub a: u16,
    pub b: u16,
    pub a_side: TradeSide,
    pub b_side: TradeSide,
    pub expires_tick: u32,
}

impl TradeSession {
    pub(crate) fn has(&self, slot: u16) -> bool {
        slot == self.a || slot == self.b
    }

    pub(crate) fn other(&self, slot: u16) -> u16 {
        if slot == self.a { self.b } else { self.a }
    }

    pub(crate) fn side(&self, slot: u16) -> &TradeSide {
        if slot == self.a {
            &self.a_side
        } else {
            &self.b_side
        }
    }

    pub(crate) fn side_mut(&mut self, slot: u16) -> &mut TradeSide {
        if slot == self.a {
            &mut self.a_side
        } else {
            &mut self.b_side
        }
    }
}

pub enum TradeInput {
    Offer {
        target: crate::proto::EntityId,
        items: Vec<(String, u32)>,
    },
    Accept,
    Cancel,
}

#[derive(Resource, Default)]
pub struct PendingTrades(pub Vec<(crate::proto::PlayerSlot, TradeInput)>);

#[derive(Resource, Default)]
pub struct ActiveTrades {
    pub sessions: Vec<TradeSession>,
}

impl ActiveTrades {
    pub(crate) fn index_of(&self, slot: u16) -> Option<usize> {
        self.sessions.iter().position(|s| s.has(slot))
    }
}

pub(crate) fn normalize_items(items: Vec<(String, u32)>) -> Vec<(String, u32)> {
    let mut out: Vec<(String, u32)> = Vec::new();
    for (r, n) in items {
        if n == 0 || r.is_empty() {
            continue;
        }
        if let Some(slot) = out.iter_mut().find(|(ir, _)| *ir == r) {
            slot.1 = slot.1.saturating_add(n);
        } else {
            out.push((r, n));
        }
    }
    out
}

pub(crate) fn inv_holds(inv: &Inventory, items: &[(String, u32)]) -> bool {
    items.iter().all(|(r, n)| {
        inv.slots
            .iter()
            .filter(|s| &s.item_ref == r)
            .map(|s| s.count)
            .sum::<u32>()
            >= *n
    })
}

/// Detach an `offer` (ref+qty) out of `inv` WITHOUT mutating it, returning the leftover
/// slots and the moved instance stacks (ids preserved on a whole-stack move; a partial
/// take splits a fresh id). None if the inventory can't fully cover the offer.
pub(crate) fn detach_offer(
    inv: &Inventory,
    offer: &[(String, u32)],
) -> Option<(Vec<ItemStack>, Vec<ItemStack>)> {
    let mut work = Inventory {
        slots: inv.slots.clone(),
    };
    let mut moved = Vec::new();
    for (r, n) in offer {
        let stack = work.detach(r, *n)?;
        if stack.count < *n {
            return None;
        }
        moved.push(stack);
    }
    Some((work.slots, moved))
}

/// Fold the moved-in stacks onto the leftover slots, preserving their ids. None if the
/// result would exceed `cap` distinct slots (no room).
pub(crate) fn merge_received(
    mut slots: Vec<ItemStack>,
    received: Vec<ItemStack>,
    cap: usize,
) -> Option<Vec<ItemStack>> {
    let mut inv = Inventory {
        slots: std::mem::take(&mut slots),
    };
    for stack in received {
        let known = inv.slots.iter().any(|s| s.item_ref == stack.item_ref);
        if !known && inv.slots.len() >= cap {
            return None;
        }
        inv.add_stack(stack);
    }
    Some(inv.slots)
}

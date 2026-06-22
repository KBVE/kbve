use bevy::prelude::Resource;

use crate::sim::Inventory;

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
    items
        .iter()
        .all(|(r, n)| inv.slots.iter().any(|(ir, ic)| ir == r && ic >= n))
}

pub(crate) fn settle(
    inv: &Inventory,
    give: &[(String, u32)],
    recv: &[(String, u32)],
    cap: usize,
) -> Option<Vec<(String, u32)>> {
    let mut slots = inv.slots.clone();
    for (r, n) in give {
        let idx = slots.iter().position(|(ir, _)| ir == r)?;
        if slots[idx].1 < *n {
            return None;
        }
        slots[idx].1 -= *n;
        if slots[idx].1 == 0 {
            slots.remove(idx);
        }
    }
    for (r, n) in recv {
        if let Some(slot) = slots.iter_mut().find(|(ir, _)| ir == r) {
            slot.1 = slot.1.saturating_add(*n);
        } else {
            if slots.len() >= cap {
                return None;
            }
            slots.push((r.clone(), *n));
        }
    }
    Some(slots)
}

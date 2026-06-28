use std::collections::HashMap;

use bevy::ecs::entity::Entity;
use bevy::prelude::{Query, Res, ResMut};

use crate::grid::GridPos;
use crate::proto::{self, Tile};
use crate::sim::{Inventory, Outbound, PlayerSlotTag, SimClock, SpawnedSlots, send_inventory};
use crate::trade::net::{send_trade, send_trade_closed};
use crate::trade::session::{
    ActiveTrades, MAX_INVENTORY_SLOTS, PendingTrades, TRADE_RANGE, TRADE_TIMEOUT_TICKS, TradeInput,
    TradeSession, TradeSide, detach_offer, inv_holds, merge_received, normalize_items,
};

pub fn expire_trades(
    mut trades: ResMut<ActiveTrades>,
    clock: Res<SimClock>,
    spawned: Res<SpawnedSlots>,
    bcast: Res<Outbound>,
) {
    if trades.sessions.is_empty() {
        return;
    }
    let now = clock.tick;
    let mut closed: Vec<(u16, u16)> = Vec::new();
    trades.sessions.retain(|s| {
        let present = spawned.by_slot.contains_key(&s.a) && spawned.by_slot.contains_key(&s.b);
        if present && now < s.expires_tick {
            true
        } else {
            closed.push((s.a, s.b));
            false
        }
    });
    for (a, b) in closed {
        send_trade_closed(&bcast, a, "cancelled");
        send_trade_closed(&bcast, b, "cancelled");
    }
}

#[allow(clippy::type_complexity)]
pub fn apply_trades(
    mut pending: ResMut<PendingTrades>,
    mut trades: ResMut<ActiveTrades>,
    clock: Res<SimClock>,
    bcast: Res<Outbound>,
    mut q: Query<(Entity, &PlayerSlotTag, &GridPos, &mut Inventory)>,
) {
    if pending.0.is_empty() {
        return;
    }

    let mut slot_of_entity: HashMap<u32, u16> = HashMap::new();
    let mut entity_of_slot: HashMap<u16, Entity> = HashMap::new();
    let mut tile_of_slot: HashMap<u16, Tile> = HashMap::new();
    for (entity, slot, pos, _) in q.iter() {
        slot_of_entity.insert(entity.index_u32(), slot.0.0);
        entity_of_slot.insert(slot.0.0, entity);
        tile_of_slot.insert(slot.0.0, pos.tile);
    }

    let adjacent = |a: u16, b: u16| -> bool {
        match (tile_of_slot.get(&a), tile_of_slot.get(&b)) {
            (Some(ta), Some(tb)) => ta.chebyshev(*tb) <= TRADE_RANGE,
            _ => false,
        }
    };

    let drained: Vec<_> = pending.0.drain(..).collect();
    for (slot, input) in drained {
        let me = slot.0;
        if !entity_of_slot.contains_key(&me) {
            continue;
        }
        match input {
            TradeInput::Offer { target, items } => {
                let Some(&partner) = slot_of_entity.get(&target.0).filter(|p| **p != me) else {
                    send_trade_closed(&bcast, me, "cancelled");
                    continue;
                };
                let items = normalize_items(items);
                let me_holds = entity_of_slot
                    .get(&me)
                    .and_then(|e| q.get(*e).ok())
                    .map(|(_, _, _, inv)| inv_holds(inv, &items))
                    .unwrap_or(false);
                if !adjacent(me, partner) || !me_holds {
                    send_trade_closed(&bcast, me, "cancelled");
                    continue;
                }
                if let Some(idx) = trades.index_of(me) {
                    if trades.sessions[idx].other(me) != partner {
                        send_trade_closed(&bcast, me, "cancelled");
                        continue;
                    }
                } else if trades.index_of(partner).is_some() {
                    send_trade_closed(&bcast, me, "cancelled");
                    continue;
                }
                let idx = match trades.index_of(me) {
                    Some(idx) => idx,
                    None => {
                        trades.sessions.push(TradeSession {
                            a: me,
                            b: partner,
                            a_side: TradeSide::default(),
                            b_side: TradeSide::default(),
                            expires_tick: clock.tick.saturating_add(TRADE_TIMEOUT_TICKS),
                        });
                        trades.sessions.len() - 1
                    }
                };
                let session = &mut trades.sessions[idx];
                session.a_side.accepted = false;
                session.b_side.accepted = false;
                session.side_mut(me).items = items;
                session.expires_tick = clock.tick.saturating_add(TRADE_TIMEOUT_TICKS);
                send_trade(&bcast, session, "update");
            }
            TradeInput::Accept => {
                let Some(idx) = trades.index_of(me) else {
                    continue;
                };
                let (a, b, a_items, b_items) = {
                    let s = &trades.sessions[idx];
                    (s.a, s.b, s.a_side.items.clone(), s.b_side.items.clone())
                };
                let a_holds = q
                    .get(entity_of_slot[&a])
                    .map(|(_, _, _, inv)| inv_holds(inv, &a_items))
                    .unwrap_or(false);
                let b_holds = q
                    .get(entity_of_slot[&b])
                    .map(|(_, _, _, inv)| inv_holds(inv, &b_items))
                    .unwrap_or(false);
                if !adjacent(a, b) || !a_holds || !b_holds {
                    let session = trades.sessions.remove(idx);
                    send_trade(&bcast, &session, "cancelled");
                    continue;
                }
                trades.sessions[idx].side_mut(me).accepted = true;
                if !(trades.sessions[idx].a_side.accepted && trades.sessions[idx].b_side.accepted) {
                    let session = &trades.sessions[idx];
                    send_trade(&bcast, session, "update");
                    continue;
                }
                let (ea, eb) = (entity_of_slot[&a], entity_of_slot[&b]);
                let inv_a = q.get(ea).map(|(.., inv)| inv.clone()).ok();
                let inv_b = q.get(eb).map(|(.., inv)| inv.clone()).ok();
                let (Some(inv_a), Some(inv_b)) = (inv_a, inv_b) else {
                    continue;
                };
                // Detach each side's offered stacks (ids preserved), then cross them so a
                // traded item carries its instance identity to the recipient instead of
                // being destroyed + re-minted.
                let detached_a = detach_offer(&inv_a, &a_items);
                let detached_b = detach_offer(&inv_b, &b_items);
                let (Some((rem_a, moved_a)), Some((rem_b, moved_b))) = (detached_a, detached_b)
                else {
                    let session = trades.sessions.remove(idx);
                    send_trade(&bcast, &session, "cancelled");
                    continue;
                };
                let new_a = merge_received(rem_a, moved_b, MAX_INVENTORY_SLOTS);
                let new_b = merge_received(rem_b, moved_a, MAX_INVENTORY_SLOTS);
                let (Some(new_a), Some(new_b)) = (new_a, new_b) else {
                    let session = trades.sessions.remove(idx);
                    send_trade(&bcast, &session, "cancelled");
                    continue;
                };
                if let Ok((.., mut inv)) = q.get_mut(ea) {
                    inv.slots = new_a;
                }
                if let Ok((.., mut inv)) = q.get_mut(eb) {
                    inv.slots = new_b;
                }
                let session = trades.sessions.remove(idx);
                send_trade(&bcast, &session, "completed");
                if let Ok((.., inv)) = q.get(ea) {
                    send_inventory(&bcast, proto::PlayerSlot(a), inv);
                }
                if let Ok((.., inv)) = q.get(eb) {
                    send_inventory(&bcast, proto::PlayerSlot(b), inv);
                }
            }
            TradeInput::Cancel => {
                if let Some(idx) = trades.index_of(me) {
                    let session = trades.sessions.remove(idx);
                    send_trade(&bcast, &session, "cancelled");
                }
            }
        }
    }
}

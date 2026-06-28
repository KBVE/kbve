use std::collections::HashMap;

use bevy::ecs::entity::Entity;
use bevy::prelude::{Query, Res, ResMut};

use crate::grid::GridPos;
use crate::proto::{self, Tile};
use crate::sim::{
    Inventory, ItemBank, Outbound, PlayerSlotTag, SimClock, SpawnedSlots, send_inventory,
};
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
    mut bank: ItemBank,
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
                    .map(|(_, _, _, inv)| inv_holds(&bank.snapshot(inv), &items))
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
                let (ea, eb) = (entity_of_slot[&a], entity_of_slot[&b]);
                // Snapshot both inventories to stack DTOs, then validate holds + the
                // post-trade slot cap with a pure dry-run before touching any entities.
                let snap_a = q.get(ea).ok().map(|(.., inv)| bank.snapshot(inv));
                let snap_b = q.get(eb).ok().map(|(.., inv)| bank.snapshot(inv));
                let (Some(snap_a), Some(snap_b)) = (snap_a, snap_b) else {
                    continue;
                };
                let a_holds = inv_holds(&snap_a, &a_items);
                let b_holds = inv_holds(&snap_b, &b_items);
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
                // Dry-run the cap: each side ends with its leftovers + the goods received.
                let dry = detach_offer(&snap_a, &a_items).zip(detach_offer(&snap_b, &b_items));
                let Some(((rem_a, moved_a_dto), (rem_b, moved_b_dto))) = dry else {
                    let session = trades.sessions.remove(idx);
                    send_trade(&bcast, &session, "cancelled");
                    continue;
                };
                if merge_received(rem_a, moved_b_dto, MAX_INVENTORY_SLOTS).is_none()
                    || merge_received(rem_b, moved_a_dto, MAX_INVENTORY_SLOTS).is_none()
                {
                    let session = trades.sessions.remove(idx);
                    send_trade(&bcast, &session, "cancelled");
                    continue;
                }
                // Execute on the real item entities: detach each side's offered stacks
                // (the entities keep their ids), then absorb them into the other side.
                // get_mut one player at a time to avoid two &mut Inventory borrows at once.
                let mut moved_a: Vec<Entity> = Vec::new();
                if let Ok((.., mut inv)) = q.get_mut(ea) {
                    for (r, n) in &a_items {
                        if let Some(e) = bank.detach(&mut inv, r, *n) {
                            moved_a.push(e);
                        }
                    }
                }
                let mut moved_b: Vec<Entity> = Vec::new();
                if let Ok((.., mut inv)) = q.get_mut(eb) {
                    for (r, n) in &b_items {
                        if let Some(e) = bank.detach(&mut inv, r, *n) {
                            moved_b.push(e);
                        }
                    }
                }
                if let Ok((.., mut inv)) = q.get_mut(ea) {
                    for e in moved_b {
                        bank.absorb(&mut inv, e);
                    }
                }
                if let Ok((.., mut inv)) = q.get_mut(eb) {
                    for e in moved_a {
                        bank.absorb(&mut inv, e);
                    }
                }
                let session = trades.sessions.remove(idx);
                send_trade(&bcast, &session, "completed");
                if let Ok((.., inv)) = q.get(ea) {
                    let items = bank.snapshot(inv);
                    send_inventory(&bcast, proto::PlayerSlot(a), &items);
                }
                if let Ok((.., inv)) = q.get(eb) {
                    let items = bank.snapshot(inv);
                    send_inventory(&bcast, proto::PlayerSlot(b), &items);
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

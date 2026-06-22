use std::collections::HashMap;

use bevy::ecs::entity::Entity;
use bevy::prelude::{Query, Res, ResMut, Without};

use crate::data::KindRegistry;
use crate::grid::GridPos;
use crate::shop::net::send_shop_result;
use crate::shop::{PendingShop, ShopInput};
use crate::sim::{
    COIN_REF, EidIndex, EntityKind, Inventory, ItemPrices, Outbound, PlayerSlotTag, ShopStock,
    coin_balance, count_ref, remove_ref, send_inventory, spend_coins,
};
use crate::trade::TRADE_RANGE;

#[allow(clippy::type_complexity, clippy::too_many_arguments)]
pub fn apply_shop(
    mut pending: ResMut<PendingShop>,
    index: Res<EidIndex>,
    registry: Res<KindRegistry>,
    stock: Res<ShopStock>,
    prices: Res<ItemPrices>,
    bcast: Res<Outbound>,
    mut q_players: Query<(Entity, &PlayerSlotTag, &GridPos, &mut Inventory)>,
    q_npcs: Query<(&GridPos, &EntityKind), Without<PlayerSlotTag>>,
) {
    if pending.0.is_empty() {
        return;
    }

    let mut by_slot: HashMap<u16, Entity> = HashMap::new();
    for (entity, slot, ..) in q_players.iter() {
        by_slot.insert(slot.0.0, entity);
    }

    for (slot, input) in pending.0.drain(..) {
        let (is_buy, npc, item_ref, qty) = match input {
            ShopInput::Buy { npc, item_ref, qty } => (true, npc, item_ref, qty),
            ShopInput::Sell { npc, item_ref, qty } => (false, npc, item_ref, qty),
        };
        let action = if is_buy { "buy" } else { "sell" };
        let reject = |bcast: &Outbound, reason: &str, balance: u32| {
            send_shop_result(bcast, slot, action, &item_ref, qty, false, reason, balance);
        };

        if qty == 0 {
            reject(&bcast, "bad_qty", 0);
            continue;
        }
        let Some(&player_entity) = by_slot.get(&slot.0) else {
            continue;
        };
        let Some(npc_entity) = index.by_eid.get(&npc.0).copied() else {
            reject(&bcast, "no_merchant", 0);
            continue;
        };
        let Ok((npc_pos, npc_kind)) = q_npcs.get(npc_entity) else {
            reject(&bcast, "no_merchant", 0);
            continue;
        };
        let npc_tile = npc_pos.tile;
        let Some(npc_ref) = registry.ref_of(npc_kind.0).map(str::to_string) else {
            reject(&bcast, "no_merchant", 0);
            continue;
        };
        let Some(stocked) = stock.0.get(&npc_ref) else {
            reject(&bcast, "not_a_merchant", 0);
            continue;
        };
        let Some(&(buy_price, sell_price)) = prices.0.get(&item_ref) else {
            reject(&bcast, "no_price", 0);
            continue;
        };

        let Ok((_, _, pos, mut inv)) = q_players.get_mut(player_entity) else {
            continue;
        };
        if pos.tile.chebyshev(npc_tile) > TRADE_RANGE {
            reject(&bcast, "too_far", coin_balance(&inv));
            continue;
        }

        if is_buy {
            if !stocked.iter().any(|r| r == &item_ref) {
                reject(&bcast, "out_of_stock", coin_balance(&inv));
                continue;
            }
            if buy_price == 0 {
                reject(&bcast, "not_for_sale", coin_balance(&inv));
                continue;
            }
            let total = buy_price.saturating_mul(qty);
            if coin_balance(&inv) < total {
                reject(&bcast, "insufficient", coin_balance(&inv));
                continue;
            }
            spend_coins(&mut inv, total);
            inv.add(&item_ref, qty);
        } else {
            if sell_price == 0 {
                reject(&bcast, "not_sellable", coin_balance(&inv));
                continue;
            }
            if count_ref(&inv, &item_ref) < qty {
                reject(&bcast, "no_item", coin_balance(&inv));
                continue;
            }
            remove_ref(&mut inv, &item_ref, qty);
            inv.add(COIN_REF, sell_price.saturating_mul(qty));
        }

        let balance = coin_balance(&inv);
        send_shop_result(&bcast, slot, action, &item_ref, qty, true, "", balance);
        send_inventory(&bcast, slot, &inv);
    }
}

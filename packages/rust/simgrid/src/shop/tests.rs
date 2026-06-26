use bevy::app::App;

use crate::data::KindRegistry;
use crate::grid::{GridPos, MoveSpeed, MoveTarget};
use crate::proto::{self, Input, ServerEvent, Tile};
use crate::sim::test_support::*;
use crate::sim::{EntityKind, ItemPrices, ShopStock};

/// Spawn a merchant entity adjacent to spawn and stock it; returns its eid.
fn spawn_merchant(app: &mut App, tile: Tile, stock: &[&str]) -> proto::EntityId {
    let kind = app
        .world()
        .resource::<KindRegistry>()
        .kind_of("training-dummy")
        .expect("training-dummy kind");
    let entity = app
        .world_mut()
        .spawn((
            EntityKind(kind),
            GridPos::at(tile),
            MoveTarget::default(),
            MoveSpeed { ticks_per_tile: 2 },
        ))
        .id();
    app.world_mut().resource_mut::<ShopStock>().0.insert(
        "training-dummy".to_string(),
        stock.iter().map(|s| s.to_string()).collect(),
    );
    app.update();
    proto::EntityId(entity.index_u32())
}

fn set_prices(app: &mut App, prices: &[(&str, u32, u32)]) {
    let mut p = app.world_mut().resource_mut::<ItemPrices>();
    for (r, buy, sell) in prices {
        p.0.insert(r.to_string(), (*buy, *sell));
    }
}

#[test]
fn shop_buy_deducts_coin_and_grants_item() {
    let (mut app, _rx, input_tx, roster) = harness(201);
    let slot = join(&roster, "buyer");
    app.update();
    let player = player_for_slot(&mut app, slot);
    set_inventory(&mut app, player, &[("coin", 10)]);
    set_prices(&mut app, &[("potion", 5, 2)]);
    let npc = spawn_merchant(&mut app, Tile::new(8, 8), &["potion"]);

    input_tx
        .send((
            slot,
            Input::BuyItem {
                npc,
                item_ref: "potion".into(),
                qty: 1,
            },
        ))
        .unwrap();
    for _ in 0..3 {
        app.update();
    }
    assert_eq!(inv_count(&app, player, "coin"), 5, "coin not deducted");
    assert_eq!(inv_count(&app, player, "potion"), 1, "item not granted");
}

#[test]
fn shop_buy_insufficient_coin_rejected() {
    let (mut app, mut rx, input_tx, roster) = harness(202);
    let slot = join(&roster, "broke");
    app.update();
    let player = player_for_slot(&mut app, slot);
    set_inventory(&mut app, player, &[("coin", 3)]);
    set_prices(&mut app, &[("potion", 5, 2)]);
    let npc = spawn_merchant(&mut app, Tile::new(8, 8), &["potion"]);

    input_tx
        .send((
            slot,
            Input::BuyItem {
                npc,
                item_ref: "potion".into(),
                qty: 1,
            },
        ))
        .unwrap();
    for _ in 0..3 {
        app.update();
    }
    assert_eq!(
        inv_count(&app, player, "coin"),
        3,
        "coin spent on failed buy"
    );
    assert_eq!(
        inv_count(&app, player, "potion"),
        0,
        "item granted for free"
    );
    let mut saw_fail = false;
    while let Ok(evt) = rx.try_recv() {
        if let ServerEvent::Ephemeral { kind, payload, .. } = evt
            && kind == proto::EPHEMERAL_SHOP
        {
            let ev: proto::ShopResult = proto::decode_inner(&payload).unwrap();
            if !ev.ok && ev.reason.contains("insufficient") {
                saw_fail = true;
            }
        }
    }
    assert!(saw_fail, "no shop rejection ephemeral");
}

#[test]
fn shop_buy_breaks_gold_bar_for_change() {
    let (mut app, _rx, input_tx, roster) = harness(203);
    let slot = join(&roster, "rich");
    app.update();
    let player = player_for_slot(&mut app, slot);
    set_inventory(&mut app, player, &[("gold-bar", 1)]);
    set_prices(&mut app, &[("potion", 5, 2)]);
    let npc = spawn_merchant(&mut app, Tile::new(8, 8), &["potion"]);

    input_tx
        .send((
            slot,
            Input::BuyItem {
                npc,
                item_ref: "potion".into(),
                qty: 1,
            },
        ))
        .unwrap();
    for _ in 0..3 {
        app.update();
    }
    assert_eq!(
        inv_count(&app, player, "gold-bar"),
        0,
        "gold-bar not broken"
    );
    assert_eq!(inv_count(&app, player, "coin"), 95, "change not returned");
    assert_eq!(inv_count(&app, player, "potion"), 1, "item not granted");
}

#[test]
fn shop_sell_grants_coin_removes_item() {
    let (mut app, _rx, input_tx, roster) = harness(204);
    let slot = join(&roster, "seller");
    app.update();
    let player = player_for_slot(&mut app, slot);
    set_inventory(&mut app, player, &[("potion", 2)]);
    set_prices(&mut app, &[("potion", 5, 2)]);
    let npc = spawn_merchant(&mut app, Tile::new(8, 8), &["potion"]);

    input_tx
        .send((
            slot,
            Input::SellItem {
                npc,
                item_ref: "potion".into(),
                qty: 1,
            },
        ))
        .unwrap();
    for _ in 0..3 {
        app.update();
    }
    assert_eq!(inv_count(&app, player, "potion"), 1, "item not removed");
    assert_eq!(inv_count(&app, player, "coin"), 2, "coin not granted");
}

#[test]
fn shop_buy_out_of_stock_rejected() {
    let (mut app, _rx, input_tx, roster) = harness(205);
    let slot = join(&roster, "picky");
    app.update();
    let player = player_for_slot(&mut app, slot);
    set_inventory(&mut app, player, &[("coin", 100)]);
    set_prices(&mut app, &[("iron-sword", 50, 20)]);
    let npc = spawn_merchant(&mut app, Tile::new(8, 8), &["potion"]);

    input_tx
        .send((
            slot,
            Input::BuyItem {
                npc,
                item_ref: "iron-sword".into(),
                qty: 1,
            },
        ))
        .unwrap();
    for _ in 0..3 {
        app.update();
    }
    assert_eq!(inv_count(&app, player, "coin"), 100, "coin spent off-menu");
    assert_eq!(
        inv_count(&app, player, "iron-sword"),
        0,
        "got unstocked item"
    );
}

#[test]
fn shop_buy_too_far_rejected() {
    let (mut app, _rx, input_tx, roster) = harness(206);
    let slot = join(&roster, "distant");
    app.update();
    let player = player_for_slot(&mut app, slot);
    set_inventory(&mut app, player, &[("coin", 100)]);
    set_prices(&mut app, &[("potion", 5, 2)]);
    let npc = spawn_merchant(&mut app, Tile::new(20, 20), &["potion"]);

    input_tx
        .send((
            slot,
            Input::BuyItem {
                npc,
                item_ref: "potion".into(),
                qty: 1,
            },
        ))
        .unwrap();
    for _ in 0..3 {
        app.update();
    }
    assert_eq!(inv_count(&app, player, "coin"), 100, "coin spent from afar");
    assert_eq!(
        inv_count(&app, player, "potion"),
        0,
        "item bought from afar"
    );
}

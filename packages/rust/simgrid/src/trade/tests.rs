use bevy::app::App;

use crate::proto::{self, Input};
use crate::sim::Inventory;
use crate::sim::test_support::*;
use crate::trade::session::{ActiveTrades, MAX_INVENTORY_SLOTS};

fn eid_of(app: &mut App, slot: proto::PlayerSlot) -> proto::EntityId {
    proto::EntityId(player_for_slot(app, slot).index_u32())
}

/// Both players offer, both accept, and the offered items swap atomically.
#[test]
fn trade_offer_accept_swaps_items() {
    let (mut app, _rx, input_tx, roster) = harness(101);
    let a = join(&roster, "alice");
    let b = join(&roster, "bob");
    app.update();

    let ea = player_for_slot(&mut app, a);
    let eb = player_for_slot(&mut app, b);
    set_inventory(&mut app, ea, &[("coin", 5)]);
    set_inventory(&mut app, eb, &[("gold-bar", 3)]);
    let a_eid = eid_of(&mut app, a);
    let b_eid = eid_of(&mut app, b);

    input_tx
        .send((
            a,
            Input::TradeOffer {
                target: b_eid,
                items: vec![("coin".into(), 2)],
            },
        ))
        .unwrap();
    input_tx
        .send((
            b,
            Input::TradeOffer {
                target: a_eid,
                items: vec![("gold-bar".into(), 1)],
            },
        ))
        .unwrap();
    input_tx.send((a, Input::TradeAccept)).unwrap();
    input_tx.send((b, Input::TradeAccept)).unwrap();
    for _ in 0..3 {
        app.update();
    }

    assert_eq!(inv_count(&app, ea, "coin"), 3, "alice coin not debited");
    assert_eq!(
        inv_count(&app, ea, "gold-bar"),
        1,
        "alice gold not credited"
    );
    assert_eq!(inv_count(&app, eb, "coin"), 2, "bob coin not credited");
    assert_eq!(inv_count(&app, eb, "gold-bar"), 2, "bob gold not debited");
    assert!(
        app.world().resource::<ActiveTrades>().sessions.is_empty(),
        "session lingered after completion"
    );
}

/// A cancel from either party tears the session down with no transfer.
#[test]
fn trade_cancel_aborts_without_transfer() {
    let (mut app, _rx, input_tx, roster) = harness(102);
    let a = join(&roster, "alice");
    let b = join(&roster, "bob");
    app.update();

    let ea = player_for_slot(&mut app, a);
    let eb = player_for_slot(&mut app, b);
    set_inventory(&mut app, ea, &[("coin", 5)]);
    set_inventory(&mut app, eb, &[("gold-bar", 3)]);
    let a_eid = eid_of(&mut app, a);
    let b_eid = eid_of(&mut app, b);

    input_tx
        .send((
            a,
            Input::TradeOffer {
                target: b_eid,
                items: vec![("coin".into(), 2)],
            },
        ))
        .unwrap();
    input_tx
        .send((
            b,
            Input::TradeOffer {
                target: a_eid,
                items: vec![("gold-bar".into(), 1)],
            },
        ))
        .unwrap();
    input_tx.send((a, Input::TradeAccept)).unwrap();
    input_tx.send((b, Input::TradeCancel)).unwrap();
    for _ in 0..3 {
        app.update();
    }

    assert_eq!(inv_count(&app, ea, "coin"), 5, "alice coin changed");
    assert_eq!(inv_count(&app, eb, "gold-bar"), 3, "bob gold changed");
    assert_eq!(inv_count(&app, ea, "gold-bar"), 0, "alice got gold");
    assert!(
        app.world().resource::<ActiveTrades>().sessions.is_empty(),
        "session survived cancel"
    );
}

/// A disconnect mid-trade cancels the session; no items are lost or duped.
#[test]
fn trade_disconnect_mid_trade_cancels() {
    let (mut app, _rx, input_tx, roster) = harness(103);
    let a = join(&roster, "alice");
    let b = join(&roster, "bob");
    app.update();

    let ea = player_for_slot(&mut app, a);
    let eb = player_for_slot(&mut app, b);
    set_inventory(&mut app, ea, &[("coin", 5)]);
    set_inventory(&mut app, eb, &[("gold-bar", 3)]);
    let a_eid = eid_of(&mut app, a);
    let b_eid = eid_of(&mut app, b);

    input_tx
        .send((
            a,
            Input::TradeOffer {
                target: b_eid,
                items: vec![("coin".into(), 2)],
            },
        ))
        .unwrap();
    input_tx
        .send((
            b,
            Input::TradeOffer {
                target: a_eid,
                items: vec![("gold-bar".into(), 1)],
            },
        ))
        .unwrap();
    app.update();
    assert_eq!(
        app.world().resource::<ActiveTrades>().sessions.len(),
        1,
        "session not opened"
    );

    roster.write().unwrap().release(b);
    for _ in 0..3 {
        app.update();
    }

    assert!(
        app.world().resource::<ActiveTrades>().sessions.is_empty(),
        "session not cancelled on disconnect"
    );
    assert_eq!(
        inv_count(&app, ea, "coin"),
        5,
        "alice lost coin on disconnect"
    );
    assert_eq!(inv_count(&app, ea, "gold-bar"), 0, "alice duped gold");
}

/// A trade that would overflow the recipient's inventory is rejected whole.
#[test]
fn trade_full_inventory_rejected() {
    let (mut app, _rx, input_tx, roster) = harness(104);
    let a = join(&roster, "alice");
    let b = join(&roster, "bob");
    app.update();

    let ea = player_for_slot(&mut app, a);
    let eb = player_for_slot(&mut app, b);
    set_inventory(&mut app, ea, &[("coin", 5)]);
    let names: Vec<String> = (0..MAX_INVENTORY_SLOTS)
        .map(|i| format!("item{i}"))
        .collect();
    let full: Vec<(&str, u32)> = names.iter().map(|s| (s.as_str(), 1)).collect();
    set_inventory(&mut app, eb, &full);
    let b_eid = eid_of(&mut app, b);

    input_tx
        .send((
            a,
            Input::TradeOffer {
                target: b_eid,
                items: vec![("coin".into(), 2)],
            },
        ))
        .unwrap();
    input_tx.send((a, Input::TradeAccept)).unwrap();
    input_tx.send((b, Input::TradeAccept)).unwrap();
    for _ in 0..3 {
        app.update();
    }

    assert_eq!(
        inv_count(&app, ea, "coin"),
        5,
        "alice debited on rejected trade"
    );
    assert_eq!(
        inv_count(&app, eb, "coin"),
        0,
        "coin forced into full inventory"
    );
    assert_eq!(
        app.world().get::<Inventory>(eb).unwrap().slots.len(),
        MAX_INVENTORY_SLOTS,
        "bob inventory mutated by rejected trade"
    );
    assert!(
        app.world().resource::<ActiveTrades>().sessions.is_empty(),
        "rejected trade left a session"
    );
}

use bevy::ecs::entity::Entity;
use bevy::prelude::App;
use tokio::sync::mpsc;

use crate::blackjack::engine as blackjack;
use crate::blackjack::table::{
    BJ_BET_TICKS, BJ_HOLD_TICKS, BJ_INSURANCE_TICKS, BJ_SETTLE_TICKS, BJ_TURN_TICKS, BjPhase, Hand,
    TableDef, TableRegistry, TableSession, Tables,
};
use crate::proto::{self, Input, ServerEvent, Tile};
use crate::sim::test_support::{Harness, harness, inv_count, join, player_for_slot, set_inventory};

fn bj_harness(seed: u64, table: Tile) -> Harness {
    let (mut app, rx, tx, roster) = harness(seed);
    app.world_mut().insert_resource(Tables(vec![TableDef {
        table_ref: "table".into(),
        tile: table,
        seats: 5,
    }]));
    (app, rx, tx, roster)
}

#[test]
fn join_requires_proximity() {
    let (mut app, _rx, tx, roster) = bj_harness(201, Tile::new(0, 0));
    let slot = join(&roster, "p1");
    app.update();
    tx.send((
        slot,
        Input::JoinTable {
            table_ref: "table".into(),
        },
    ))
    .unwrap();
    app.update();
    assert!(
        app.world().resource::<TableRegistry>().sessions.is_empty(),
        "seated from out of range"
    );
}

#[test]
fn bet_caps_and_debits_held_coin() {
    let (mut app, _rx, tx, roster) = bj_harness(202, Tile::new(8, 8));
    let slot = join(&roster, "p1");
    app.update();
    let e = player_for_slot(&mut app, slot);
    set_inventory(&mut app, e, &[("coin", 10)]);
    tx.send((
        slot,
        Input::JoinTable {
            table_ref: "table".into(),
        },
    ))
    .unwrap();
    app.update();
    assert_eq!(
        app.world().resource::<TableRegistry>().sessions.len(),
        1,
        "did not seat adjacent player"
    );
    tx.send((slot, Input::PlaceBet { amount: 1000 })).unwrap();
    app.update();
    assert_eq!(
        inv_count(&app, e, "coin"),
        0,
        "bet not capped to held coin + debited"
    );
}

#[test]
fn leave_during_betting_refunds_and_tears_down() {
    let (mut app, _rx, tx, roster) = bj_harness(203, Tile::new(8, 8));
    let slot = join(&roster, "p1");
    app.update();
    let e = player_for_slot(&mut app, slot);
    set_inventory(&mut app, e, &[("coin", 10)]);
    tx.send((
        slot,
        Input::JoinTable {
            table_ref: "table".into(),
        },
    ))
    .unwrap();
    app.update();
    tx.send((slot, Input::PlaceBet { amount: 4 })).unwrap();
    app.update();
    assert_eq!(inv_count(&app, e, "coin"), 6, "bet not debited");
    tx.send((slot, Input::LeaveTable)).unwrap();
    app.update();
    assert_eq!(inv_count(&app, e, "coin"), 10, "bet not refunded on leave");
    assert!(
        app.world().resource::<TableRegistry>().sessions.is_empty(),
        "empty table not torn down"
    );
}

#[test]
fn full_round_settles_to_valid_total() {
    let (mut app, _rx, tx, roster) = bj_harness(204, Tile::new(8, 8));
    let slot = join(&roster, "p1");
    app.update();
    let e = player_for_slot(&mut app, slot);
    set_inventory(&mut app, e, &[("coin", 100)]);
    tx.send((
        slot,
        Input::JoinTable {
            table_ref: "table".into(),
        },
    ))
    .unwrap();
    app.update();
    tx.send((slot, Input::PlaceBet { amount: 10 })).unwrap();
    app.update();
    // No action -> turn timer auto-stands the seat, dealer plays, round settles.
    for _ in 0..(BJ_BET_TICKS + BJ_TURN_TICKS + BJ_SETTLE_TICKS + 30) {
        app.update();
    }
    let coin = inv_count(&app, e, "coin");
    assert!(
        [90, 100, 110, 115].contains(&coin),
        "unexpected settled coin total: {coin}"
    );
    assert_eq!(
        app.world().resource::<TableRegistry>().sessions.len(),
        1,
        "session torn down while player still seated"
    );
}

fn occupied_seats(app: &App) -> usize {
    app.world()
        .resource::<TableRegistry>()
        .sessions
        .values()
        .map(|s| s.occupied())
        .sum()
}

#[test]
fn disconnect_holds_seat_then_releases_after_grace() {
    let (mut app, _rx, tx, roster) = bj_harness(205, Tile::new(8, 8));
    let slot = join(&roster, "p1");
    app.update();
    let e = player_for_slot(&mut app, slot);
    set_inventory(&mut app, e, &[("coin", 50)]);
    tx.send((
        slot,
        Input::JoinTable {
            table_ref: "table".into(),
        },
    ))
    .unwrap();
    app.update();
    tx.send((slot, Input::PlaceBet { amount: 10 })).unwrap();
    app.update();
    for _ in 0..(BJ_BET_TICKS + 2) {
        app.update();
    }
    roster.write().unwrap().release(slot);
    app.update();
    app.update();
    // Seat is held open through the grace window, not dropped immediately.
    assert_eq!(occupied_seats(&app), 1, "seat dropped before grace elapsed");
    for _ in 0..(BJ_HOLD_TICKS + 2) {
        app.update();
    }
    assert!(
        app.world().resource::<TableRegistry>().sessions.is_empty(),
        "held seat not released + table not torn down after grace"
    );
}

#[test]
fn reconnect_reclaims_held_seat() {
    let (mut app, _rx, tx, roster) = bj_harness(207, Tile::new(8, 8));
    let slot = join(&roster, "p1");
    app.update();
    let e = player_for_slot(&mut app, slot);
    set_inventory(&mut app, e, &[("coin", 50)]);
    tx.send((
        slot,
        Input::JoinTable {
            table_ref: "table".into(),
        },
    ))
    .unwrap();
    app.update();
    // Disconnect, then let the seat park for a few ticks (still within grace).
    roster.write().unwrap().release(slot);
    for _ in 0..5 {
        app.update();
    }
    assert_eq!(occupied_seats(&app), 1, "seat not held after disconnect");
    // Reconnect under the same name (new slot) and re-join from the table tile.
    let slot2 = join(&roster, "p1");
    app.update();
    tx.send((
        slot2,
        Input::JoinTable {
            table_ref: "table".into(),
        },
    ))
    .unwrap();
    app.update();
    assert_eq!(
        occupied_seats(&app),
        1,
        "reconnect took a second seat instead of reclaiming the held one"
    );
    let session = app
        .world()
        .resource::<TableRegistry>()
        .sessions
        .values()
        .next()
        .unwrap();
    let seat = session.seats.iter().flatten().next().unwrap();
    assert_eq!(seat.slot, slot2.0, "reclaimed seat not rebound to new slot");
    assert!(
        seat.disconnected_since.is_none(),
        "reclaimed seat still flagged offline"
    );
}

fn bj_card(suit: u8, rank: u8) -> u8 {
    (suit << 4) | rank
}

/// Mutate the (single) live table session for a deterministic rule scenario.
fn with_session(app: &mut App, f: impl FnOnce(&mut TableSession)) {
    let mut reg = app.world_mut().resource_mut::<TableRegistry>();
    let session = reg.sessions.values_mut().next().expect("a live session");
    f(session);
}

/// Seat a funded player, lock in a bet, and run the table through the deal.
fn bj_seated_and_dealt(
    app: &mut App,
    tx: &mpsc::UnboundedSender<(proto::PlayerSlot, Input)>,
    slot: proto::PlayerSlot,
    coins: u32,
    bet: u32,
) -> Entity {
    app.update();
    let e = player_for_slot(app, slot);
    set_inventory(app, e, &[("coin", coins)]);
    tx.send((
        slot,
        Input::JoinTable {
            table_ref: "table".into(),
        },
    ))
    .unwrap();
    app.update();
    tx.send((slot, Input::PlaceBet { amount: bet })).unwrap();
    app.update();
    for _ in 0..(BJ_BET_TICKS + 2) {
        app.update();
    }
    e
}

#[test]
fn surrender_refunds_half_the_bet() {
    let (mut app, _rx, tx, roster) = bj_harness(210, Tile::new(8, 8));
    let slot = join(&roster, "p1");
    let e = bj_seated_and_dealt(&mut app, &tx, slot, 100, 10);
    // Force a 16 vs a non-ace dealer, mid player-turn.
    with_session(&mut app, |s| {
        s.phase = BjPhase::PlayerTurn;
        s.deadline_tick = u32::MAX;
        s.dealer = vec![bj_card(0, 9), bj_card(0, 8)];
        let bet = s.seats.iter().flatten().next().unwrap().bet;
        let seat = s.seats.iter_mut().flatten().next().unwrap();
        let mut h = Hand::new(bet);
        h.cards = vec![bj_card(0, 9), bj_card(0, 5)];
        seat.hands = vec![h];
        s.active_seat = usize::MAX;
        s.active_hand = 0;
    });
    tx.send((
        slot,
        Input::BjAction {
            kind: proto::BjActionKind::Surrender,
        },
    ))
    .unwrap();
    app.update();
    assert_eq!(
        inv_count(&app, e, "coin"),
        95,
        "surrender did not refund half the 10 bet"
    );
    let session = app
        .world()
        .resource::<TableRegistry>()
        .sessions
        .values()
        .next()
        .unwrap();
    let seat = session.seats.iter().flatten().next().unwrap();
    assert!(seat.hands[0].surrendered, "hand not flagged surrendered");
}

#[test]
fn split_creates_two_hands_and_debits_a_second_bet() {
    let (mut app, _rx, tx, roster) = bj_harness(211, Tile::new(8, 8));
    let slot = join(&roster, "p1");
    let e = bj_seated_and_dealt(&mut app, &tx, slot, 100, 10);
    with_session(&mut app, |s| {
        s.phase = BjPhase::PlayerTurn;
        s.deadline_tick = u32::MAX;
        s.dealer = vec![bj_card(0, 9), bj_card(0, 8)];
        let bet = s.seats.iter().flatten().next().unwrap().bet;
        let seat = s.seats.iter_mut().flatten().next().unwrap();
        let mut h = Hand::new(bet);
        h.cards = vec![bj_card(0, 7), bj_card(1, 7)]; // pair of eights
        seat.hands = vec![h];
        s.active_seat = usize::MAX;
        s.active_hand = 0;
    });
    tx.send((
        slot,
        Input::BjAction {
            kind: proto::BjActionKind::Split,
        },
    ))
    .unwrap();
    app.update();
    assert_eq!(
        inv_count(&app, e, "coin"),
        80,
        "split did not debit a second 10 bet"
    );
    let session = app
        .world()
        .resource::<TableRegistry>()
        .sessions
        .values()
        .next()
        .unwrap();
    let seat = session.seats.iter().flatten().next().unwrap();
    assert_eq!(seat.hands.len(), 2, "split did not produce two hands");
    assert!(
        seat.hands.iter().all(|h| h.cards.len() == 2),
        "split hands not topped up to two cards"
    );
}

#[test]
fn insurance_debits_and_caps_at_half_the_bet() {
    let (mut app, _rx, tx, roster) = bj_harness(212, Tile::new(8, 8));
    let slot = join(&roster, "p1");
    let e = bj_seated_and_dealt(&mut app, &tx, slot, 100, 10);
    with_session(&mut app, |s| {
        s.phase = BjPhase::Insurance;
        s.deadline_tick = u32::MAX; // keep the window open
        s.dealer = vec![bj_card(0, 0), bj_card(0, 8)]; // ace up
    });
    // Ask for far more than allowed; it caps at bet/2 = 5.
    tx.send((slot, Input::Insure { amount: 999 })).unwrap();
    app.update();
    assert_eq!(
        inv_count(&app, e, "coin"),
        85,
        "insurance stake not capped to half the bet"
    );
    let session = app
        .world()
        .resource::<TableRegistry>()
        .sessions
        .values()
        .next()
        .unwrap();
    let seat = session.seats.iter().flatten().next().unwrap();
    assert_eq!(seat.insurance, 5, "insurance not recorded at the cap");
}

#[test]
fn settled_round_reveals_a_seed_matching_its_commitment() {
    let (mut app, mut rx, tx, roster) = bj_harness(220, Tile::new(8, 8));
    let slot = join(&roster, "p1");
    let _e = bj_seated_and_dealt(&mut app, &tx, slot, 100, 10);
    // No action: the turn timer auto-stands, the dealer plays, the round settles.
    for _ in 0..(BJ_INSURANCE_TICKS + BJ_TURN_TICKS + BJ_SETTLE_TICKS + 20) {
        app.update();
    }
    let mut commitment_seen = false;
    let mut verified = false;
    while let Ok(evt) = rx.try_recv() {
        if let ServerEvent::Ephemeral { kind, payload, .. } = evt
            && kind == proto::EPHEMERAL_BLACKJACK
        {
            let v: proto::BlackjackStateView = proto::decode_inner(&payload).unwrap();
            if !v.commitment.is_empty() {
                commitment_seen = true;
            }
            if let Some(seed_str) = v.seed.as_deref() {
                let seed: u64 = seed_str.parse().unwrap();
                assert_eq!(
                    blackjack::commit_seed(seed),
                    v.commitment,
                    "revealed seed does not match the published commitment"
                );
                verified = true;
            }
        }
    }
    assert!(commitment_seen, "no commitment broadcast during the round");
    assert!(verified, "round never revealed a verifiable seed at settle");
}

#[test]
fn nearby_spectator_receives_scoped_state() {
    let (mut app, mut rx, tx, roster) = bj_harness(206, Tile::new(8, 8));
    let player = join(&roster, "player");
    let watcher = join(&roster, "watcher");
    app.update();
    let ep = player_for_slot(&mut app, player);
    set_inventory(&mut app, ep, &[("coin", 20)]);
    tx.send((
        player,
        Input::JoinTable {
            table_ref: "table".into(),
        },
    ))
    .unwrap();
    app.update();
    tx.send((player, Input::PlaceBet { amount: 5 })).unwrap();
    app.update();
    for _ in 0..(BJ_BET_TICKS + 5) {
        app.update();
    }
    let mut to_watcher = 0usize;
    let mut saw_hidden = false;
    while let Ok(evt) = rx.try_recv() {
        if let ServerEvent::Ephemeral { kind, to, payload } = evt
            && kind == proto::EPHEMERAL_BLACKJACK
            && to == watcher
        {
            to_watcher += 1;
            let view: proto::BlackjackStateView = proto::decode_inner(&payload).unwrap();
            if view.dealer_hidden {
                saw_hidden = true;
            }
        }
    }
    assert!(to_watcher > 0, "spectator never received scoped state");
    assert!(saw_hidden, "dealer hole card was not hidden pre-reveal");
}

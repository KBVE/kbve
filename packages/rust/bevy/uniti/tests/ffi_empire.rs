//! End-to-end round-trip + drift verification for the empire FFI.
//! Phase 2.5 — confirms prost-decoded mood drift converges to the
//! Neutral mid-band (50) while sticky end-states (Vassal / Annexed /
//! Razed) stay put across many ticks.
//!
//! Every test takes the shared `STATE_LOCK` because the FFI cache is
//! a process-global `Mutex<Option<Vec<u8>>>` — Cargo runs tests in
//! parallel by default and racing publish/tick/take across tests
//! corrupts each other's input.

use std::sync::{Mutex, MutexGuard};

use prost::Message;
use uniti::ffi_empire::*;
use uniti::proto::empire::{CityStateRecord, CityStateStatusValue, EmpireSnapshot, Tribute};
use uniti::proto::kbve::common::{Ulid, Vec2i};

static STATE_LOCK: Mutex<()> = Mutex::new(());

fn lock() -> MutexGuard<'static, ()> {
    let guard = STATE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    unsafe { uniti_empire_reset() };
    guard
}

fn build_snapshot(cities: Vec<CityStateRecord>) -> Vec<u8> {
    let snap = EmpireSnapshot {
        generation: 1,
        turn_index: 0,
        cities,
    };
    let mut buf = Vec::with_capacity(snap.encoded_len());
    snap.encode(&mut buf).unwrap();
    buf
}

fn city(name: &str, mood: u32, status: CityStateStatusValue) -> CityStateRecord {
    CityStateRecord {
        id: Some(Ulid {
            value: name.to_string(),
        }),
        root_hex: Some(Vec2i { x: 0, y: 0 }),
        status: status as i32,
        mood,
        drift_per_cadence: 0,
        tribute: None,
        owner_faction: 0,
        display_name: name.to_string(),
    }
}

fn take_snapshot() -> Option<EmpireSnapshot> {
    let len = unsafe { uniti_empire_snapshot_len() };
    if len == 0 {
        return None;
    }
    let mut buf = vec![0u8; len];
    let copied = unsafe { uniti_empire_take(buf.as_mut_ptr(), buf.len()) };
    if copied == 0 {
        return None;
    }
    EmpireSnapshot::decode(&buf[..copied]).ok()
}

#[test]
fn publish_take_round_trip_preserves_payload() {
    let _g = lock();
    let bytes = build_snapshot(vec![city(
        "alpha",
        80,
        CityStateStatusValue::CityStateStatusAllied,
    )]);
    let ok = unsafe { uniti_empire_publish(bytes.as_ptr(), bytes.len()) };
    assert_eq!(ok, 1);

    let echoed = take_snapshot().expect("snapshot should be retrievable");
    assert_eq!(echoed.cities.len(), 1);
    assert_eq!(echoed.cities[0].mood, 80);
    assert_eq!(
        echoed.cities[0].status,
        CityStateStatusValue::CityStateStatusAllied as i32
    );
}

#[test]
fn tick_drifts_mood_toward_neutral() {
    let _g = lock();
    let bytes = build_snapshot(vec![
        city("hot", 90, CityStateStatusValue::CityStateStatusAllied),
        city("cold", 10, CityStateStatusValue::CityStateStatusHostile),
    ]);
    unsafe { uniti_empire_publish(bytes.as_ptr(), bytes.len()) };

    for _ in 0..200 {
        unsafe { uniti_empire_tick() };
    }

    let snap = take_snapshot().unwrap();
    let hot = &snap.cities[0];
    let cold = &snap.cities[1];
    assert_eq!(hot.mood, 50, "hot city should converge to 50");
    assert_eq!(cold.mood, 50, "cold city should converge to 50");
    assert_eq!(
        hot.status,
        CityStateStatusValue::CityStateStatusNeutral as i32,
        "status should follow into Neutral band"
    );
}

#[test]
fn tick_skips_sticky_end_states() {
    let _g = lock();
    let bytes = build_snapshot(vec![
        city("vassal", 60, CityStateStatusValue::CityStateStatusVassal),
        city("annexed", 90, CityStateStatusValue::CityStateStatusAnnexed),
        city("razed", 5, CityStateStatusValue::CityStateStatusRazed),
    ]);
    unsafe { uniti_empire_publish(bytes.as_ptr(), bytes.len()) };

    for _ in 0..50 {
        unsafe { uniti_empire_tick() };
    }

    let snap = take_snapshot().unwrap();
    assert_eq!(snap.cities[0].mood, 60);
    assert_eq!(
        snap.cities[0].status,
        CityStateStatusValue::CityStateStatusVassal as i32
    );
    assert_eq!(snap.cities[1].mood, 90);
    assert_eq!(snap.cities[2].mood, 5);
}

#[test]
fn tick_increments_generation() {
    let _g = lock();
    let bytes = build_snapshot(vec![city(
        "g",
        50,
        CityStateStatusValue::CityStateStatusNeutral,
    )]);
    unsafe { uniti_empire_publish(bytes.as_ptr(), bytes.len()) };

    let before = take_snapshot().unwrap().generation;
    unsafe { uniti_empire_tick() };
    let after = take_snapshot().unwrap().generation;
    assert_eq!(after, before + 1);
}

#[test]
fn async_ticker_drifts_mood_in_background() {
    let _g = lock();
    let bytes = build_snapshot(vec![city(
        "bg",
        90,
        CityStateStatusValue::CityStateStatusAllied,
    )]);
    unsafe { uniti_empire_publish(bytes.as_ptr(), bytes.len()) };

    let started = unsafe { uniti_empire_async_start() };
    assert_eq!(started, 1, "tokio runtime should start on non-wasm targets");

    // Ticker fires every 1s; wait long enough for several drift steps.
    std::thread::sleep(std::time::Duration::from_millis(3500));
    unsafe { uniti_empire_async_stop() };
    std::thread::sleep(std::time::Duration::from_millis(200));

    let snap = take_snapshot().unwrap();
    let mood = snap.cities[0].mood;
    assert!(
        mood < 90,
        "background ticker should have drifted mood below the start value, got {mood}"
    );
}

#[test]
fn async_ticker_idempotent_start() {
    let _g = lock();
    let bytes = build_snapshot(vec![city(
        "idem",
        50,
        CityStateStatusValue::CityStateStatusNeutral,
    )]);
    unsafe { uniti_empire_publish(bytes.as_ptr(), bytes.len()) };

    assert_eq!(unsafe { uniti_empire_async_start() }, 1);
    assert_eq!(
        unsafe { uniti_empire_async_start() },
        1,
        "second start is a no-op"
    );
    unsafe { uniti_empire_async_stop() };
}

#[test]
fn tribute_field_round_trips_unchanged() {
    let _g = lock();
    let mut rec = city("tributary", 50, CityStateStatusValue::CityStateStatusVassal);
    rec.tribute = Some(Tribute {
        coin_per_turn: 5,
        food_per_turn: 3,
        cadence_turns: 4,
        next_turn: 100,
    });
    let bytes = build_snapshot(vec![rec]);
    unsafe { uniti_empire_publish(bytes.as_ptr(), bytes.len()) };

    for _ in 0..10 {
        unsafe { uniti_empire_tick() };
    }
    let snap = take_snapshot().unwrap();
    let trib = snap.cities[0]
        .tribute
        .as_ref()
        .expect("tribute should persist");
    assert_eq!(trib.coin_per_turn, 5);
    assert_eq!(trib.food_per_turn, 3);
    assert_eq!(trib.cadence_turns, 4);
    assert_eq!(trib.next_turn, 100);
}

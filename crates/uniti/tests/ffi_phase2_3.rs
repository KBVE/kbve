mod common;
use common::WorldGuard;
use std::ffi::CStr;
use uniti::ffi_world::*;

#[test]
fn last_error_is_null_after_clear() {
    unsafe { uniti_world_clear_error() };
    let p = unsafe { uniti_world_last_error() };
    assert!(p.is_null());
}

#[test]
fn last_error_set_on_null_handle() {
    unsafe {
        uniti_world_clear_error();
        let _ = uniti_world_chunk_touch(std::ptr::null_mut(), 0, 0, 0, 0, 0);
    };
    let p = unsafe { uniti_world_last_error() };
    assert!(!p.is_null());
    let msg = unsafe { CStr::from_ptr(p) }.to_str().unwrap();
    assert!(msg.contains("null"), "expected 'null' in error: {}", msg);
}

#[test]
fn chunk_touch_batch_round_trip() {
    let world = WorldGuard::new();
    let items = [
        FfiChunkTouch {
            cx: 1,
            cy: 1,
            last_seen_ms: 100,
            flags: 1,
            threat_level: 10,
        },
        FfiChunkTouch {
            cx: 2,
            cy: 2,
            last_seen_ms: 200,
            flags: 2,
            threat_level: 20,
        },
        FfiChunkTouch {
            cx: 3,
            cy: 3,
            last_seen_ms: 300,
            flags: 3,
            threat_level: 30,
        },
    ];
    let n =
        unsafe { uniti_world_chunk_touch_batch(world.handle, items.as_ptr(), items.len() as u32) };
    assert_eq!(n, 3);

    let s2 = unsafe { uniti_world_chunk_summary(world.handle, 2, 2) };
    assert_eq!(s2.last_seen_ms, 200);
    assert_eq!(s2.threat_level, 20);
}

#[test]
fn save_aggregate_batch_round_trip() {
    let world = WorldGuard::new();
    unsafe { uniti_world_chunk_touch(world.handle, 0, 0, 100, 0, 0) };

    let items = [
        FfiUnitAggregate {
            cx: 0,
            cy: 0,
            unit_type: 1,
            count: 5,
            avg_health: 1.0,
            hunger_pool: 0.0,
            last_tick_secs: 0.0,
        },
        FfiUnitAggregate {
            cx: 0,
            cy: 0,
            unit_type: 2,
            count: 7,
            avg_health: 0.5,
            hunger_pool: 0.0,
            last_tick_secs: 0.0,
        },
        FfiUnitAggregate {
            cx: 0,
            cy: 0,
            unit_type: 3,
            count: 3,
            avg_health: 0.9,
            hunger_pool: 0.0,
            last_tick_secs: 0.0,
        },
    ];
    let n = unsafe {
        uniti_world_save_unit_aggregate_batch(world.handle, items.as_ptr(), items.len() as u32)
    };
    assert_eq!(n, 3);

    let s = unsafe { uniti_world_chunk_summary(world.handle, 0, 0) };
    assert_eq!(s.aggregate_count, 3);
}

#[test]
fn telemetry_counters_track_calls() {
    let world = WorldGuard::new();
    let before = unsafe { uniti_world_call_counts() };

    unsafe {
        uniti_world_chunk_touch(world.handle, 1, 1, 1, 0, 0);
        uniti_world_chunk_touch(world.handle, 2, 2, 1, 0, 0);
        uniti_world_chunk_summary(world.handle, 1, 1);
    };

    let after = unsafe { uniti_world_call_counts() };
    assert!(after.chunk_touch - before.chunk_touch >= 2);
    assert!(after.chunk_summary - before.chunk_summary >= 1);
}

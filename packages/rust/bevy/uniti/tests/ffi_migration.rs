mod common;
use common::WorldGuard;
use uniti::ffi_world::*;

#[test]
fn schema_v3_init_creates_chunks_table() {
    let world = WorldGuard::new();
    let s = unsafe { uniti_world_chunk_summary(world.handle, 0, 0) };
    assert_eq!(s.valid, 0);
    let touched = unsafe { uniti_world_chunk_touch(world.handle, 0, 0, 1, 0, 0) };
    assert_eq!(touched, 1);
}

#[test]
fn schema_v3_init_creates_unit_aggregates_table() {
    let world = WorldGuard::new();
    unsafe { uniti_world_chunk_touch(world.handle, 0, 0, 1, 0, 0) };
    let agg = FfiUnitAggregate {
        cx: 0,
        cy: 0,
        unit_type: 1,
        count: 1,
        avg_health: 1.0,
        hunger_pool: 0.0,
        last_tick_secs: 0.0,
    };
    let ok = unsafe { uniti_world_save_unit_aggregate(world.handle, agg) };
    assert_eq!(ok, 1);
}

#[test]
fn schema_version_meta_persisted() {
    let v = unsafe { uniti_world_schema_version() };
    assert!(v >= 3);
}

#[test]
fn invalid_world_handle_returns_safe_defaults() {
    let null = std::ptr::null_mut();
    let s = unsafe { uniti_world_chunk_summary(null, 0, 0) };
    assert_eq!(s.valid, 0);

    let ok = unsafe { uniti_world_chunk_touch(null, 0, 0, 0, 0, 0) };
    assert_eq!(ok, 0);

    let count = unsafe { uniti_world_due_count(null, 1_000_000_000_u64) };
    assert_eq!(count, 0);
}

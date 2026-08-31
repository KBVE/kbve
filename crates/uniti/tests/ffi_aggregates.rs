mod common;
use common::WorldGuard;
use uniti::ffi_world::*;

#[test]
fn save_aggregate_then_take_round_trip() {
    let world = WorldGuard::new();
    unsafe { uniti_world_chunk_touch(world.handle, 4, 7, 100, 0, 0) };

    let agg = FfiUnitAggregate {
        cx: 4,
        cy: 7,
        unit_type: 12,
        count: 5,
        avg_health: 0.85,
        hunger_pool: 0.3,
        last_tick_secs: 42.0,
    };
    let ok = unsafe { uniti_world_save_unit_aggregate(world.handle, agg) };
    assert_eq!(ok, 1);

    let s = unsafe { uniti_world_chunk_summary(world.handle, 4, 7) };
    assert_eq!(s.aggregate_count, 1);

    let mut buf = [FfiUnitAggregate::default(); 4];
    let n = unsafe {
        uniti_world_take_unit_aggregates_in_chunk(world.handle, 4, 7, buf.as_mut_ptr(), 4)
    };
    assert_eq!(n, 1);
    assert_eq!(buf[0].cx, 4);
    assert_eq!(buf[0].cy, 7);
    assert_eq!(buf[0].unit_type, 12);
    assert_eq!(buf[0].count, 5);
    assert!((buf[0].avg_health - 0.85).abs() < 1e-6);

    let s2 = unsafe { uniti_world_chunk_summary(world.handle, 4, 7) };
    assert_eq!(s2.aggregate_count, 0);
}

#[test]
fn save_aggregate_upsert_by_unit_type() {
    let world = WorldGuard::new();
    unsafe { uniti_world_chunk_touch(world.handle, 0, 0, 100, 0, 0) };

    unsafe {
        uniti_world_save_unit_aggregate(
            world.handle,
            FfiUnitAggregate {
                cx: 0,
                cy: 0,
                unit_type: 1,
                count: 3,
                avg_health: 1.0,
                hunger_pool: 0.0,
                last_tick_secs: 0.0,
            },
        );
        uniti_world_save_unit_aggregate(
            world.handle,
            FfiUnitAggregate {
                cx: 0,
                cy: 0,
                unit_type: 1,
                count: 7,
                avg_health: 0.5,
                hunger_pool: 0.0,
                last_tick_secs: 0.0,
            },
        );
    };

    let s = unsafe { uniti_world_chunk_summary(world.handle, 0, 0) };
    assert_eq!(s.aggregate_count, 1);

    let mut buf = [FfiUnitAggregate::default(); 4];
    let n = unsafe {
        uniti_world_take_unit_aggregates_in_chunk(world.handle, 0, 0, buf.as_mut_ptr(), 4)
    };
    assert_eq!(n, 1);
    assert_eq!(buf[0].count, 7);
}

#[test]
fn aggregates_distinct_per_unit_type() {
    let world = WorldGuard::new();
    unsafe { uniti_world_chunk_touch(world.handle, 9, 9, 100, 0, 0) };
    for unit_type in 1..=4u8 {
        unsafe {
            uniti_world_save_unit_aggregate(
                world.handle,
                FfiUnitAggregate {
                    cx: 9,
                    cy: 9,
                    unit_type,
                    count: unit_type as u32,
                    avg_health: 1.0,
                    hunger_pool: 0.0,
                    last_tick_secs: 0.0,
                },
            )
        };
    }
    let s = unsafe { uniti_world_chunk_summary(world.handle, 9, 9) };
    assert_eq!(s.aggregate_count, 4);
}

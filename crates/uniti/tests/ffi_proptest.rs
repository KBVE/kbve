mod common;
use common::WorldGuard;
use proptest::prelude::*;
use uniti::ffi_world::*;

proptest! {
    #![proptest_config(ProptestConfig { cases: 64, ..ProptestConfig::default() })]

    #[test]
    fn chunk_touch_round_trip(
        cx in -1000i32..1000,
        cy in -1000i32..1000,
        last_seen in 0u64..u64::from(u32::MAX),
        flags in 0u32..0xFFFF,
        threat in 0u32..0xFFFF,
    ) {
        let world = WorldGuard::new();
        let ok = unsafe { uniti_world_chunk_touch(world.handle, cx, cy, last_seen, flags, threat) };
        prop_assert_eq!(ok, 1);
        let s = unsafe { uniti_world_chunk_summary(world.handle, cx, cy) };
        prop_assert_eq!(s.valid, 1);
        prop_assert_eq!(s.cx, cx);
        prop_assert_eq!(s.cy, cy);
        prop_assert_eq!(s.last_seen_ms, last_seen);
        prop_assert_eq!(s.flags, flags);
        prop_assert_eq!(s.threat_level, threat);
    }

    #[test]
    fn unit_aggregate_round_trip(
        cx in -100i32..100,
        cy in -100i32..100,
        unit_type in 1u8..200,
        count in 1u32..1000,
        avg_health in 0.0f32..2.0,
    ) {
        let world = WorldGuard::new();
        unsafe { uniti_world_chunk_touch(world.handle, cx, cy, 1, 0, 0) };
        let agg = FfiUnitAggregate {
            cx, cy, unit_type, count, avg_health,
            hunger_pool: 0.0, last_tick_secs: 0.0,
        };
        let ok = unsafe { uniti_world_save_unit_aggregate(world.handle, agg) };
        prop_assert_eq!(ok, 1);
        let mut buf = [FfiUnitAggregate::default(); 8];
        let n = unsafe {
            uniti_world_take_unit_aggregates_in_chunk(world.handle, cx, cy, buf.as_mut_ptr(), 8)
        };
        prop_assert_eq!(n, 1);
        prop_assert_eq!(buf[0].cx, cx);
        prop_assert_eq!(buf[0].cy, cy);
        prop_assert_eq!(buf[0].unit_type, unit_type);
        prop_assert_eq!(buf[0].count, count);
    }

    #[test]
    fn purge_stale_only_drops_empty(
        cx in -50i32..50,
        cy in -50i32..50,
        seen_ms in 0u64..1_000_000,
    ) {
        let world = WorldGuard::new();
        unsafe { uniti_world_chunk_touch(world.handle, cx, cy, seen_ms, 0, 0) };
        let unit = FfiGhostUnit {
            unit_type: 1, q: cx * 32, r: cy * 32,
            health: 1.0, max_health: 1.0,
            ..Default::default()
        };
        unsafe { uniti_world_save_unit(world.handle, unit) };
        unsafe { uniti_world_flush(world.handle) };
        unsafe { uniti_world_chunk_touch(world.handle, cx, cy, seen_ms, 0, 0) };
        let purged = unsafe { uniti_world_chunks_purge_stale(world.handle, seen_ms + 1) };
        prop_assert_eq!(purged, 0);
    }
}

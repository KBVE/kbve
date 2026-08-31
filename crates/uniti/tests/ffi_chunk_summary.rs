mod common;
use common::WorldGuard;
use uniti::ffi_world::*;

#[test]
fn chunk_summary_after_touch() {
    let world = WorldGuard::new();
    let ok = unsafe { uniti_world_chunk_touch(world.handle, 5, -3, 1_000_000, 0b0010, 128) };
    assert_eq!(ok, 1);

    let s = unsafe { uniti_world_chunk_summary(world.handle, 5, -3) };
    assert_eq!(s.valid, 1);
    assert_eq!(s.cx, 5);
    assert_eq!(s.cy, -3);
    assert_eq!(s.last_seen_ms, 1_000_000);
    assert_eq!(s.flags, 0b0010);
    assert_eq!(s.threat_level, 128);
}

#[test]
fn chunk_summary_unknown_chunk_invalid() {
    let world = WorldGuard::new();
    let s = unsafe { uniti_world_chunk_summary(world.handle, 999, 999) };
    assert_eq!(s.valid, 0);
}

#[test]
fn prefetch_neighbors_returns_six() {
    let world = WorldGuard::new();
    unsafe {
        uniti_world_chunk_touch(world.handle, 1, 0, 100, 1, 50);
        uniti_world_chunk_touch(world.handle, 0, 1, 200, 2, 75);
    };

    let mut buf = [FfiChunkSummary::default(); 6];
    let n = unsafe { uniti_world_prefetch_neighbors(world.handle, 0, 0, buf.as_mut_ptr(), 6) };
    assert_eq!(n, 6);

    let valid_count = buf.iter().filter(|s| s.valid == 1).count();
    assert_eq!(valid_count, 2);
}

#[test]
fn take_chunks_in_range_filters_by_box() {
    let world = WorldGuard::new();
    unsafe {
        uniti_world_chunk_touch(world.handle, 0, 0, 1, 0, 0);
        uniti_world_chunk_touch(world.handle, 1, 1, 1, 0, 0);
        uniti_world_chunk_touch(world.handle, 5, 5, 1, 0, 0);
        uniti_world_chunk_touch(world.handle, -10, -10, 1, 0, 0);
    };

    let mut buf = [FfiChunkSummary::default(); 16];
    let n =
        unsafe { uniti_world_take_chunks_in_range(world.handle, 0, 0, 2, 2, buf.as_mut_ptr(), 16) };
    assert_eq!(n, 2);
}

#[test]
fn due_count_filters_by_tick_threshold() {
    let world = WorldGuard::new();
    unsafe {
        uniti_world_chunk_touch(world.handle, 1, 1, 100, 0, 0);
        uniti_world_chunk_touch(world.handle, 2, 2, 100, 0, 0);
    };

    let due = unsafe { uniti_world_due_count(world.handle, 1_000_000_000_u64) };
    assert_eq!(due, 2);

    let due_zero = unsafe { uniti_world_due_count(world.handle, 0) };
    assert_eq!(due_zero, 0);
}

#[test]
fn purge_stale_drops_empty_chunks_only() {
    let world = WorldGuard::new();
    unsafe {
        uniti_world_chunk_touch(world.handle, 1, 1, 100, 0, 0);
        uniti_world_chunk_touch(world.handle, 2, 2, 5_000_000, 0, 0);
    };

    let purged = unsafe { uniti_world_chunks_purge_stale(world.handle, 1_000_000) };
    assert_eq!(purged, 1);

    let s = unsafe { uniti_world_chunk_summary(world.handle, 1, 1) };
    assert_eq!(s.valid, 0);
    let s2 = unsafe { uniti_world_chunk_summary(world.handle, 2, 2) };
    assert_eq!(s2.valid, 1);
}

mod common;
use common::WorldGuard;
use uniti::ffi_world::*;

#[test]
fn pause_and_resume_ticker() {
    let world = WorldGuard::new();
    let paused0 = unsafe { uniti_world_is_ticker_paused(world.handle) };
    assert_eq!(paused0, 0);
    let ok = unsafe { uniti_world_pause_ticker(world.handle) };
    assert_eq!(ok, 1);
    let paused1 = unsafe { uniti_world_is_ticker_paused(world.handle) };
    assert_eq!(paused1, 1);
    let ok2 = unsafe { uniti_world_resume_ticker(world.handle) };
    assert_eq!(ok2, 1);
    let paused2 = unsafe { uniti_world_is_ticker_paused(world.handle) };
    assert_eq!(paused2, 0);
}

#[test]
fn compact_returns_ok() {
    let world = WorldGuard::new();
    unsafe { uniti_world_chunk_touch(world.handle, 1, 2, 100, 0, 0) };
    let ok = unsafe { uniti_world_compact(world.handle) };
    assert_eq!(ok, 1);
    let s = unsafe { uniti_world_chunk_summary(world.handle, 1, 2) };
    assert_eq!(s.valid, 1);
}

#[test]
fn disk_stats_populated_after_writes() {
    let world = WorldGuard::new();
    for i in 0..32 {
        unsafe { uniti_world_chunk_touch(world.handle, i, 0, i as u64, 0, 0) };
    }
    let stats = unsafe { uniti_world_disk_stats(world.handle) };
    assert_eq!(stats.valid, 1);
    assert!(stats.page_size_bytes > 0);
    assert!(stats.page_count > 0);
    assert!(stats.disk_size_bytes > 0);
}

#[test]
fn chunks_iter_walks_all_rows() {
    let world = WorldGuard::new();
    for i in 0..10 {
        unsafe { uniti_world_chunk_touch(world.handle, i, i, i as u64 * 10, 0, 0) };
    }
    let it = unsafe { uniti_world_chunks_iter_open(world.handle) };
    assert!(!it.is_null());
    let total = unsafe { uniti_world_chunks_iter_remaining(it) };
    assert_eq!(total, 10);

    let mut count = 0u32;
    let mut row = FfiChunkSummary::default();
    while unsafe { uniti_world_chunks_iter_next(it, &mut row) } == 1 {
        assert_eq!(row.valid, 1);
        count += 1;
    }
    assert_eq!(count, 10);
    let remaining_after = unsafe { uniti_world_chunks_iter_remaining(it) };
    assert_eq!(remaining_after, 0);
    unsafe { uniti_world_chunks_iter_close(it) };
}

#[test]
fn chunks_iter_close_null_safe() {
    unsafe { uniti_world_chunks_iter_close(std::ptr::null_mut()) };
    let r = unsafe { uniti_world_chunks_iter_remaining(std::ptr::null()) };
    assert_eq!(r, 0);
}

#[test]
fn ffi_guard_panic_caught_returns_default() {
    let null = std::ptr::null_mut();
    let ok = unsafe { uniti_world_compact(null) };
    assert_eq!(ok, 0);
}

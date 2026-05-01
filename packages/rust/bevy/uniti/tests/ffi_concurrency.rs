mod common;
use common::WorldGuard;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;
use uniti::ffi_world::*;

#[test]
fn concurrent_chunk_touch_no_corruption() {
    let world = WorldGuard::new();
    let world_addr = world.handle as usize;

    let success = Arc::new(AtomicUsize::new(0));
    let mut handles = vec![];
    for t in 0..8 {
        let s = success.clone();
        handles.push(thread::spawn(move || {
            let h = world_addr as *mut std::ffi::c_void;
            for i in 0..50 {
                let cx = t * 100 + i;
                let ok = unsafe { uniti_world_chunk_touch(h, cx, t, 1, 0, 0) };
                if ok == 1 {
                    s.fetch_add(1, Ordering::Relaxed);
                }
            }
        }));
    }
    for h in handles {
        h.join().expect("thread panicked");
    }

    assert_eq!(success.load(Ordering::Relaxed), 8 * 50);
}

#[test]
fn concurrent_save_aggregate_no_corruption() {
    let world = WorldGuard::new();
    let world_addr = world.handle as usize;
    unsafe { uniti_world_chunk_touch(world.handle, 0, 0, 1, 0, 0) };

    let mut handles = vec![];
    for t in 0..4 {
        handles.push(thread::spawn(move || {
            let h = world_addr as *mut std::ffi::c_void;
            for i in 0..25 {
                let agg = FfiUnitAggregate {
                    cx: 0,
                    cy: 0,
                    unit_type: ((t * 25 + i) % 200) as u8,
                    count: i as u32,
                    avg_health: 1.0,
                    hunger_pool: 0.0,
                    last_tick_secs: 0.0,
                };
                unsafe { uniti_world_save_unit_aggregate(h, agg) };
            }
        }));
    }
    for h in handles {
        h.join().expect("thread panicked");
    }

    let s = unsafe { uniti_world_chunk_summary(world.handle, 0, 0) };
    assert!(s.aggregate_count >= 1, "expected non-zero aggregate count");
}

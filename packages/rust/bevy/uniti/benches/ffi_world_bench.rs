use criterion::{Criterion, criterion_group, criterion_main};
use std::ffi::{CString, c_char, c_void};
use std::hint::black_box;
use tempfile::NamedTempFile;
use uniti::ffi_world::*;

fn open_world() -> (*mut c_void, NamedTempFile) {
    let temp = NamedTempFile::new().unwrap();
    let path = temp.path().to_str().unwrap();
    let cpath = CString::new(path).unwrap();
    let h = unsafe { uniti_world_open(cpath.as_ptr() as *const c_char, path.len() as u32) };
    assert!(!h.is_null());
    (h, temp)
}

fn bench_chunk_touch(c: &mut Criterion) {
    let (world, _t) = open_world();
    let mut i = 0i32;
    c.bench_function("chunk_touch", |b| {
        b.iter(|| {
            unsafe { uniti_world_chunk_touch(world, black_box(i), 0, 1, 0, 0) };
            i = i.wrapping_add(1);
        });
    });
    unsafe { uniti_world_free(world) };
}

fn bench_chunk_summary_hit(c: &mut Criterion) {
    let (world, _t) = open_world();
    for i in 0..1000 {
        unsafe { uniti_world_chunk_touch(world, i, 0, 1, 0, 0) };
    }
    c.bench_function("chunk_summary_hit", |b| {
        b.iter(|| {
            let s = unsafe { uniti_world_chunk_summary(world, black_box(500), 0) };
            black_box(s);
        });
    });
    unsafe { uniti_world_free(world) };
}

fn bench_prefetch_neighbors(c: &mut Criterion) {
    let (world, _t) = open_world();
    for q in -5..=5 {
        for r in -5..=5 {
            unsafe { uniti_world_chunk_touch(world, q, r, 1, 0, 0) };
        }
    }
    c.bench_function("prefetch_neighbors", |b| {
        let mut buf = [FfiChunkSummary::default(); 6];
        b.iter(|| {
            let n = unsafe {
                uniti_world_prefetch_neighbors(world, black_box(0), 0, buf.as_mut_ptr(), 6)
            };
            black_box(n);
        });
    });
    unsafe { uniti_world_free(world) };
}

fn bench_chunk_touch_batch(c: &mut Criterion) {
    let (world, _t) = open_world();
    let items: Vec<FfiChunkTouch> = (0..32)
        .map(|i| FfiChunkTouch {
            cx: i,
            cy: 0,
            last_seen_ms: 1,
            flags: 0,
            threat_level: 0,
        })
        .collect();
    c.bench_function("chunk_touch_batch_32", |b| {
        b.iter(|| {
            let n =
                unsafe { uniti_world_chunk_touch_batch(world, items.as_ptr(), items.len() as u32) };
            black_box(n);
        });
    });
    unsafe { uniti_world_free(world) };
}

criterion_group!(
    benches,
    bench_chunk_touch,
    bench_chunk_summary_hit,
    bench_prefetch_neighbors,
    bench_chunk_touch_batch
);
criterion_main!(benches);

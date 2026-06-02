//! Criterion benches for the hot-path math used by `camera_follow_target`
//! and `apply_subpixel_offset`. Tracks per-call cost so future refactors
//! (axis maths, quantization step, etc.) can be compared against a
//! recorded baseline instead of guessed at.
//!
//! Run with: `cargo bench -p bevy_cam`.

use std::f32::consts::FRAC_1_SQRT_2;

use bevy::math::Vec3;
use bevy_cam::{pixel_snap_along_axis, quantize};
use criterion::{Criterion, black_box, criterion_group, criterion_main};

fn bench_quantize(c: &mut Criterion) {
    let mut group = c.benchmark_group("quantize");
    let inputs: Vec<f32> = (0..1024).map(|i| (i as f32) * 0.0123 - 6.0).collect();

    group.bench_function("scalar_loop", |b| {
        b.iter(|| {
            let mut sum = 0.0_f32;
            for v in &inputs {
                sum += quantize(black_box(*v));
            }
            black_box(sum)
        });
    });
    group.finish();
}

fn bench_pixel_snap(c: &mut Criterion) {
    let mut group = c.benchmark_group("pixel_snap_along_axis");
    let axis = Vec3::new(FRAC_1_SQRT_2, 0.0, FRAC_1_SQRT_2).normalize();
    let pixel_step = 1.0_f32 / 32.0;
    let positions: Vec<Vec3> = (0..1024)
        .map(|i| {
            let t = i as f32 * 0.017;
            Vec3::new(t.cos() * 30.0, t.sin() * 5.0, t * 0.5)
        })
        .collect();

    group.bench_function("scalar_loop", |b| {
        b.iter(|| {
            let mut snapped = 0.0_f32;
            let mut remainder = 0.0_f32;
            for p in &positions {
                let (s, r) =
                    pixel_snap_along_axis(black_box(*p), black_box(axis), black_box(pixel_step));
                snapped += s;
                remainder += r;
            }
            (black_box(snapped), black_box(remainder))
        });
    });
    group.finish();
}

criterion_group!(benches, bench_quantize, bench_pixel_snap);
criterion_main!(benches);

#import bevy_pbr::forward_io::VertexOutput
#import bevy_pbr::mesh_view_bindings::globals

struct WaterUniforms {
    base_color: vec4<f32>,
    deep_color: vec4<f32>,
    ripple_speed: f32,
    ripple_scale: f32,
    highlight_strength: f32,
    foam_intensity: f32,
}

@group(3) @binding(0) var<uniform> water: WaterUniforms;

// ── Procedural noise ─────────────────────────────────────────────────────

fn hash21(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

fn value_noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);

    let a = hash21(i);
    let b = hash21(i + vec2(1.0, 0.0));
    let c = hash21(i + vec2(0.0, 1.0));
    let d = hash21(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Two-octave layered noise
fn fbm2(p: vec2<f32>) -> f32 {
    return value_noise(p) * 0.65 + value_noise(p * 2.1) * 0.35;
}

// ── Overlay blend (from Godot shader) ────────────────────────────────────

fn blend_overlay(base: f32, blend: f32) -> f32 {
    let r1 = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
    let r2 = 2.0 * base * blend;
    return select(r1, r2, base <= 0.5);
}

// ── Fragment ─────────────────────────────────────────────────────────────

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let time = globals.time;

    // World-space UVs for tiling (1 tile = 1.0 world unit)
    let world_uv = in.world_position.xz;

    // Pixelate to match the game's low-res aesthetic (32 px per world unit)
    let pixel_density = 32.0;
    let pix_uv = floor(world_uv * pixel_density) / pixel_density;

    // ── Animated ripple distortion ───────────────────────────────────────
    let ripple_uv = pix_uv * water.ripple_scale;
    let noise_a = value_noise(ripple_uv + vec2(time * water.ripple_speed, 0.0));
    let noise_b = value_noise(ripple_uv + vec2(0.0, time * water.ripple_speed * 0.7));
    let distortion = (noise_a + noise_b) * 0.5;

    // ── Water pattern (two drifting noise layers, overlay-blended) ───────
    let pattern_uv = pix_uv * water.ripple_scale * 0.5;
    let wave_a = value_noise(pattern_uv + vec2(time * 0.15, time * 0.08));
    let wave_b = value_noise(pattern_uv * 1.3 - vec2(time * 0.12, time * 0.1));
    let wave_pattern = blend_overlay(wave_a, wave_b);

    // ── Color mixing ─────────────────────────────────────────────────────
    // Mix between deep and base color using the wave pattern
    let wave_mask = smoothstep(0.35, 0.65, wave_pattern);
    var color = mix(water.deep_color, water.base_color, wave_mask);

    // ── Highlight sparkles ───────────────────────────────────────────────
    // Two noise layers at different speeds create moving sparkle pattern
    let spark_uv = pix_uv * water.ripple_scale * 2.0;
    let spark_a = value_noise(spark_uv + vec2(time * 0.3, -time * 0.15));
    let spark_b = value_noise(spark_uv * 0.8 - vec2(time * 0.2, time * 0.25));
    let spark_blend = blend_overlay(spark_a, spark_b);
    let spark_subtract = value_noise(pix_uv * water.ripple_scale);
    let spark_final = clamp(spark_subtract - spark_blend, 0.0, 1.0);
    let spark_mask = step(0.55, spark_final) * water.highlight_strength;

    color = mix(color, vec4(1.0, 1.0, 1.0, color.a), spark_mask);

    // ── Foam at tile edges ───────────────────────────────────────────────
    // Use vertex color alpha to mark foam edges (set by CPU during mesh build)
    let foam_mask = 1.0 - in.color.a;
    let foam_noise = fbm2(pix_uv * 8.0 + vec2(time * 0.1));
    let foam_edge = smoothstep(0.3, 0.7, foam_mask * foam_noise) * water.foam_intensity;
    color = mix(color, vec4(0.85, 0.92, 0.98, color.a), foam_edge);

    // ── Subtle depth variation from distortion ───────────────────────────
    let alpha = color.a * (0.85 + distortion * 0.15);

    return vec4(color.rgb, alpha);
}

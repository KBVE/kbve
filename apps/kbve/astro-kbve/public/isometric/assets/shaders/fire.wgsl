#import bevy_pbr::forward_io::VertexOutput

struct FireUniforms {
    time: f32,
    intensity: f32,
    pixel_size: f32,
    quality: f32,  // 0.0 = low (mobile), 0.5 = medium, 1.0 = high
    color_core: vec4<f32>,
    color_mid: vec4<f32>,
    color_outer: vec4<f32>,
}

@group(3) @binding(0) var<uniform> fire: FireUniforms;

// ── Noise ────────────────────────────────────────────────────────────────

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

fn fbm2(p: vec2<f32>) -> f32 {
    return value_noise(p) * 0.65
         + value_noise(p * 2.13) * 0.35;
}

fn fbm3(p: vec2<f32>) -> f32 {
    return value_noise(p) * 0.55
         + value_noise(p * 2.13) * 0.30
         + value_noise(p * 4.37) * 0.15;
}

fn fbm4(p: vec2<f32>) -> f32 {
    return value_noise(p) * 0.45
         + value_noise(p * 1.97) * 0.28
         + value_noise(p * 3.89) * 0.17
         + value_noise(p * 7.41) * 0.10;
}

// ── Pixel-art helpers ────────────────────────────────────────────────────

fn quantize_uv(uv: vec2<f32>, steps: f32) -> vec2<f32> {
    return floor(uv * steps) / steps;
}

// ── Fragment ─────────────────────────────────────────────────────────────

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let raw_uv = in.uv;
    let grid = fire.pixel_size;
    let uv = quantize_uv(raw_uv, grid);

    // Centered coordinates: x in -1..1, y 0 at bottom 1 at top
    let cx = (uv.x - 0.5) * 2.0;
    let cy = 1.0 - uv.y;

    let t = fire.time;

    // ── Deep breathing ──────────────────────────────────────────────
    let breath_slow  = sin(t * 1.1) * 0.12;
    let breath_med   = sin(t * 2.7 + 0.8) * 0.07;
    let breath_fast  = sin(t * 5.3 + 2.1) * 0.03;
    let breath_catch = max(0.0, sin(t * 0.6)) * sin(t * 7.0) * 0.04;
    let breath = 1.0 + breath_slow + breath_med + breath_fast + breath_catch;
    let breath_profile = mix(1.0, breath, smoothstep(0.0, 0.3, cy));

    // ── Organic sway ────────────────────────────────────────────────
    let sway_base = sin(t * 1.5) * 0.06;
    let sway_mid  = sin(t * 3.1 + 1.0) * 0.10 * cy;
    let sway_tip  = sin(t * 5.7 + 2.5) * 0.18 * cy * cy;
    let sway = sway_base + sway_mid + sway_tip;
    let wobble_x = cx - sway;

    // ── Noise layers — fewer on low quality ────────────────────────
    let q = fire.quality;

    let scroll1 = vec2(sin(t * 0.7) * 0.3, -t * 2.5);
    let scroll2 = vec2(cos(t * 0.5) * 0.2, -t * 1.8 + 3.0);

    // Low quality: 2 layers with fbm2 (4 noise calls total)
    // High quality: 4 layers with fbm3/fbm4 (38 noise calls total)
    var n1: f32; var n2: f32; var n3: f32; var n4: f32;
    if q > 0.3 {
        n1 = fbm4(vec2(uv.x * 4.0, cy * 3.5) + scroll1);
        n2 = fbm3(vec2(uv.x * 2.5 + 7.0, cy * 2.8) + scroll2);
        let scroll3 = vec2(sin(t * 1.3) * 0.5, -t * 4.5 + 11.0);
        n3 = fbm3(vec2(uv.x * 6.0, cy * 5.0) + scroll3);
        let scroll4 = vec2(t * 0.15, -t * 0.8 + 20.0);
        n4 = fbm3(vec2(uv.x * 1.5 + 15.0, cy * 2.0) + scroll4);
    } else {
        n1 = fbm2(vec2(uv.x * 4.0, cy * 3.5) + scroll1);
        n2 = fbm2(vec2(uv.x * 2.5 + 7.0, cy * 2.8) + scroll2);
        n3 = 0.5;
        n4 = 0.5;
    }

    // ── Ember bed (bottom 25%) ──────────────────────────────────────
    // Wide glowing disc at the base — the coals the flame sits on.
    // Uses a flat radial distance (ignores Y stretching) so the
    // ember bed reads as a wide circle on the ground.
    let ember_breath = 1.0 + sin(t * 0.8) * 0.06 + sin(t * 2.3 + 1.5) * 0.04;
    let ember_radius = 0.60 * ember_breath;
    // Flat XZ disc: Y contribution is very small so it spreads wide
    let ember_dist = length(vec2(wobble_x * 0.85, max(0.0, cy - 0.03) * 2.5));
    let ember_mask = smoothstep(ember_radius, ember_radius * 0.15, ember_dist);
    let ember_height = smoothstep(0.28, 0.0, cy); // visible in bottom ~25%
    // Pulsing glow noise for individual coal hotspots
    let ember_glow_noise = fbm3(vec2(uv.x * 6.0 + 30.0, cy * 10.0) + vec2(t * 0.4, -t * 0.6));
    let ember_pulse = sin(t * 3.0 + ember_glow_noise * 6.28) * 0.15 + 0.85;
    let ember_density = ember_mask * ember_height * (0.5 + ember_glow_noise * 0.5) * ember_pulse;

    // ── Flame body silhouette ───────────────────────────────────────
    // Wide mushroom base that narrows into a dancing tip.
    // The base is WIDER than mid-height to look like fire spreading
    // from a broad coal bed.
    let base_width = 0.48 * breath_profile;
    let flame_h = 0.75;

    // Width profile: very wide at bottom, belly bulge at ~25%, narrow tip.
    // The smoothstep pair creates a fat mushroom silhouette.
    let base_spread = smoothstep(0.0, 0.08, cy) * smoothstep(0.18, 0.08, cy) * 0.20;
    let belly = 1.0 + smoothstep(0.08, 0.25, cy) * smoothstep(0.45, 0.25, cy) * 0.15;
    let tip_narrow = cy * cy * cy;
    let width_at_y = base_width * (1.0 + base_spread) * belly * (1.0 - tip_narrow);

    let rx = wobble_x / max(width_at_y, 0.01);
    let ry = cy / flame_h;

    // Flame emerges from the ember bed — very gentle dome, NO hard cutoff.
    // The base_dome only slightly reduces the vertical contribution to the
    // ellipse, so the flame blends smoothly into the ember bed below.
    let base_dome = smoothstep(0.0, 0.25, cy);
    let ellipse_dist = rx * rx + ry * ry * (1.0 - base_dome * 0.55);

    // Noise blending: stable+broad at bottom, chaotic at top
    let noise_bottom = n1 * 0.22 + n2 * 0.20 + n4 * 0.12;
    let noise_top    = n1 * 0.12 + n3 * 0.32 + n4 * 0.08;
    let noise = mix(noise_bottom, noise_top, cy);

    let edge = (1.0 - ellipse_dist) * 0.9 + noise * 0.40;

    // NO bottom_merge cutoff — let the flame reach all the way to cy=0.
    // The ember bed and flame overlap naturally at the base.
    // Height fade — start fading later and end further from quad edge
    // so the flame never clips against the billboard boundary.
    let height_mask = 1.0 - smoothstep(0.50, 0.85, cy);

    var flame_density = edge * height_mask * fire.intensity;

    // ── Wispy tendrils (skip on low quality) ──────────────────────
    if q > 0.3 {
        let wisp_noise = fbm3(vec2(uv.x * 8.0, cy * 6.0) + vec2(t * 0.9, -t * 3.5));
        let wisp_mask = smoothstep(0.30, 0.65, cy) * (1.0 - smoothstep(0.80, 0.95, cy));
        let wisp = (wisp_noise - 0.40) * wisp_mask * 2.0;
        flame_density = max(flame_density, wisp * step(abs(wobble_x), 0.40) * fire.intensity);
    }

    // ── Smoke wisps (skip entirely on low quality) ──────────────
    var smoke_density: f32 = 0.0;
    var smoke_noise: f32 = 0.5;
    if q > 0.3 {
        let smoke_scroll = vec2(sin(t * 0.4) * 0.6, -t * 1.2 + 50.0);
        smoke_noise = fbm4(vec2(uv.x * 3.0 + 40.0, cy * 2.5) + smoke_scroll);

        let smoke_scroll2 = vec2(cos(t * 0.7) * 0.4, -t * 0.9 + 60.0);
        let smoke_noise2 = fbm3(vec2(uv.x * 2.0 + 55.0, cy * 1.8) + smoke_scroll2);

        let smoke_height = smoothstep(0.45, 0.65, cy) * (1.0 - smoothstep(0.82, 0.94, cy));
        let smoke_width = 0.40 + smoke_noise2 * 0.25;
        let smoke_lateral = smoothstep(smoke_width, smoke_width * 0.25, abs(wobble_x * 0.65));
        smoke_density = smoke_noise * smoke_lateral * smoke_height * 0.55;
    }

    // ── Combine: ember bed + flame + smoke ──────────────────────────
    // Determine which layer this pixel belongs to for coloring
    let total_ember = clamp(ember_density * fire.intensity, 0.0, 1.0);
    let total_flame = clamp(flame_density, 0.0, 1.0);
    let total_smoke = clamp(smoke_density, 0.0, 1.0);

    // Any visible pixel?
    let any_density = max(max(total_ember, total_flame), total_smoke);
    if any_density <= 0.02 {
        discard;
    }

    // ── 3D depth ─────────────────────────────────────────────────────
    let geo_depth = 1.0 - clamp(sqrt(ellipse_dist), 0.0, 1.0);

    var depth: f32;
    if q > 0.3 {
        // High quality: noise-driven hotspots break up flat bands
        let hotspot_scroll = vec2(sin(t * 0.9) * 0.4, -t * 2.0 + 77.0);
        let hotspot_noise = fbm3(vec2(uv.x * 5.0 + 90.0, cy * 4.0) + hotspot_scroll);
        let hotspot2_scroll = vec2(cos(t * 1.4) * 0.3, -t * 3.0 + 33.0);
        let hotspot2_noise = fbm3(vec2(uv.x * 3.5 + 120.0, cy * 3.0) + hotspot2_scroll);
        let noise_depth = hotspot_noise * 0.35 + hotspot2_noise * 0.20;
        depth = clamp(geo_depth * 0.50 + noise_depth + total_flame * 0.15, 0.0, 1.0);
    } else {
        // Low quality: geometric depth only (no extra noise calls)
        depth = clamp(geo_depth * 0.65 + total_flame * 0.20, 0.0, 1.0);
    }
    let depth_sq = depth * depth;

    let vert_depth = 1.0 - cy * 0.55;
    let volume = depth_sq * vert_depth;

    // ── Color: flame palette ────────────────────────────────────────
    let ember_col = vec3(0.45, 0.03, 0.0);
    let deep_or = fire.color_outer.rgb;
    let bright  = fire.color_mid.rgb;
    let gold    = mix(fire.color_mid.rgb, fire.color_core.rgb, 0.4);
    let yellow  = fire.color_core.rgb;
    let hot     = vec3(1.0, 0.97, 0.85);

    // Color selection
    var color_t: f32;
    if q > 0.3 {
        let color_noise = fbm3(vec2(uv.x * 4.5 + 200.0, cy * 3.5) + vec2(t * 0.2, -t * 1.5));
        color_t = clamp(total_flame * 0.35 + volume * 0.40 + color_noise * 0.25, 0.0, 1.0);
    } else {
        color_t = clamp(total_flame * 0.45 + volume * 0.55, 0.0, 1.0);
    }
    let bands = 7.0;
    let banded = floor(color_t * bands) / (bands - 1.0);

    var flame_color: vec3<f32>;
    if banded < 0.17 {
        flame_color = mix(ember_col, deep_or, banded / 0.17);
    } else if banded < 0.33 {
        flame_color = mix(deep_or, bright, (banded - 0.17) / 0.16);
    } else if banded < 0.50 {
        flame_color = mix(bright, gold, (banded - 0.33) / 0.17);
    } else if banded < 0.67 {
        flame_color = mix(gold, yellow, (banded - 0.50) / 0.17);
    } else if banded < 0.83 {
        flame_color = mix(yellow, hot, (banded - 0.67) / 0.16);
    } else {
        flame_color = hot;
    }

    // Rim darkening
    var rim: f32;
    if q > 0.3 {
        let rim_noise = fbm3(vec2(uv.x * 7.0 + 150.0, cy * 5.0) + vec2(-t * 0.8, t * 0.3));
        rim = smoothstep(0.55, 0.0, geo_depth) * (0.7 + rim_noise * 0.3);
    } else {
        rim = smoothstep(0.55, 0.0, geo_depth);
    }
    flame_color = mix(flame_color, deep_or * 0.6, rim * 0.40);

    // Core glow — wanders with the hotspot, not fixed to center
    let core_boost = depth_sq * smoothstep(0.25, 0.65, total_flame) * 0.45;
    flame_color = flame_color + hot * core_boost;

    // ── Color: ember bed ────────────────────────────────────────────
    // Pulsing coals: dark red base with orange-gold hot spots
    let coal_dark = vec3(0.25, 0.02, 0.0);
    let coal_hot  = vec3(0.85, 0.25, 0.02);
    let coal_glow = vec3(1.0, 0.55, 0.08);
    let ember_t = clamp(ember_glow_noise * 1.3 + 0.1, 0.0, 1.0);
    let ember_bands = floor(ember_t * 4.0) / 3.0;
    var ember_color: vec3<f32>;
    if ember_bands < 0.33 {
        ember_color = mix(coal_dark, coal_hot, ember_bands / 0.33);
    } else if ember_bands < 0.67 {
        ember_color = mix(coal_hot, coal_glow, (ember_bands - 0.33) / 0.34);
    } else {
        ember_color = mix(coal_glow, hot, (ember_bands - 0.67) / 0.33);
    }

    // ── Color: smoke ────────────────────────────────────────────────
    // Cool gray with slight warm tint from the fire below
    let smoke_base = vec3(0.35, 0.32, 0.30);
    let smoke_warm = vec3(0.50, 0.38, 0.28);
    let smoke_t = clamp(smoke_noise * 1.2, 0.0, 1.0);
    let smoke_bands = floor(smoke_t * 3.0) / 2.0;
    let smoke_color = mix(smoke_base, smoke_warm, smoke_bands);

    // ── Composite layers ────────────────────────────────────────────
    // Priority: flame on top, then ember bed, then smoke behind
    var final_color: vec3<f32>;
    var final_alpha: f32;

    if total_flame > 0.04 {
        // Flame layer
        final_color = flame_color;
        let tip_fade = 1.0 - smoothstep(0.7, 1.0, cy);
        let edge_soften = smoothstep(0.02, 0.10, total_flame);
        final_alpha = tip_fade * edge_soften * fire.intensity;
    } else if total_ember > 0.04 {
        // Ember bed layer
        final_color = ember_color;
        final_alpha = total_ember * 0.9 * fire.intensity;
    } else {
        // Smoke layer
        final_color = smoke_color;
        final_alpha = total_smoke * 0.35 * fire.intensity;
    }

    // Ember sparks (across flame + ember zones)
    let spark_seed = floor(uv * grid);
    let spark_hash = hash21(spark_seed + floor(vec2(t * 7.0)));
    let in_spark_zone = step(0.1, max(total_flame, total_ember));
    let spark = step(0.95, spark_hash) * in_spark_zone * step(total_flame, 0.7);
    final_color = mix(final_color, hot * 1.3, spark * 0.7);

    if final_alpha <= 0.01 {
        discard;
    }

    return vec4(final_color, final_alpha);
}

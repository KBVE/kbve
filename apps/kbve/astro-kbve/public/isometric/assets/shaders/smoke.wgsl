#import bevy_pbr::forward_io::VertexOutput

struct SmokeUniforms {
    color: vec4<f32>,
    progress: f32,
    softness: f32,
    _pad0: f32,
    _pad1: f32,
}

@group(2) @binding(0) var<uniform> smoke: SmokeUniforms;

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

fn fbm(p: vec2<f32>) -> f32 {
    return value_noise(p) * 0.65
         + value_noise(p * 2.0) * 0.25
         + value_noise(p * 4.0) * 0.10;
}

// ── Pixel-art helpers ────────────────────────────────────────────────────

fn quantize_uv(uv: vec2<f32>, steps: f32) -> vec2<f32> {
    return floor(uv * steps) / steps;
}

fn quantize_value(v: f32, bands: f32) -> f32 {
    return floor(v * bands) / max(1.0, bands - 1.0);
}

// Warm/cool painterly palette: shadow → mid → highlight
fn smoke_palette(t: f32) -> vec3<f32> {
    let shadow = vec3(0.58, 0.60, 0.68);   // cool gray-blue
    let mid    = vec3(0.78, 0.76, 0.72);   // dusty warm gray
    let light  = vec3(0.96, 0.92, 0.84);   // warm cream highlight

    if t < 0.5 {
        return mix(shadow, mid, t * 2.0);
    }
    return mix(mid, light, (t - 0.5) * 2.0);
}

// ── Fragment ─────────────────────────────────────────────────────────────

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let raw_uv = in.uv;

    // Pixel-lock the smoke pattern onto a coarse grid
    let uv = quantize_uv(raw_uv, 24.0);

    let center = vec2(0.5, 0.52);

    // Stepped drift — motion in pixel increments, not continuous
    let drift = floor(smoke.progress * 12.0) / 12.0;
    let flow = vec2(drift * 0.18, -drift * 0.10);

    // Lobe-based silhouette — multiple puff centers for organic shape
    let d0 = length(uv - (center + vec2( 0.00,  0.00)));
    let d1 = length(uv - (center + vec2(-0.16,  0.03)));
    let d2 = length(uv - (center + vec2( 0.14, -0.02)));
    let d3 = length(uv - (center + vec2( 0.04, -0.16)));

    let base_shape = min(min(d0, d1), min(d2, d3)) * 1.65;

    // Chunky border breakup — broad, not speckled
    let border_noise = fbm((uv + flow) * 5.0) * 0.18;
    let radius = 0.62 + border_noise;

    // Semi-opaque mass edge — not airy, reads as painted shape
    let cloud_mask = 1.0 - smoothstep(radius - 0.10, radius + 0.02, base_shape);

    // Interior tone zones from noise + center gradient
    let inner_noise = fbm((uv - flow * 0.5) * 6.0);
    let center_grad = 1.0 - smoothstep(0.0, 0.75, base_shape);

    var tone = center_grad * 0.7 + inner_noise * 0.3;

    // Banded cel-shading — 4 distinct value steps
    tone = clamp(tone, 0.0, 1.0);
    tone = quantize_value(tone, 4.0);

    let palette_color = smoke_palette(tone);
    let color = palette_color * smoke.color.rgb;

    // Lifetime: quick appear, slow linger, stepped dissolve
    let fade_in = smoothstep(0.0, 0.12, smoke.progress);
    let fade_out = 1.0 - smoothstep(0.55, 1.0, smoke.progress);

    // Dissolve noise near the end — chunks break away
    let dissolve = smoothstep(smoke.progress - 0.15, smoke.progress + 0.1, inner_noise);

    let alpha = cloud_mask * fade_in * fade_out * dissolve * smoke.color.a;

    if alpha < 0.02 {
        discard;
    }

    return vec4(color, alpha);
}

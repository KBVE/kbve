#import bevy_pbr::forward_io::VertexOutput

struct SmokeUniforms {
    color: vec4<f32>,
    progress: f32,
    softness: f32,
    _pad0: f32,
    _pad1: f32,
}

@group(2) @binding(0) var<uniform> smoke: SmokeUniforms;

// ── Procedural noise for cloud shape ────────────────────────────────────

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
    return value_noise(p) * 0.6
         + value_noise(p * 2.1) * 0.25
         + value_noise(p * 4.3) * 0.15;
}

// ── Fragment ─────────────────────────────────────────────────────────────

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let uv = in.uv;
    let center = vec2(0.5);
    let dist = length(uv - center) * 2.0; // 0 at center, 1 at edge

    // Irregular cloud border using noise
    let noise_uv = uv * 4.0 + vec2(smoke.progress * 0.5);
    let border_noise = fbm(noise_uv) * 0.5;
    let cloud_radius = 0.75 + border_noise * 0.35;

    // Soft circular mask with noisy edges
    let cloud_mask = 1.0 - smoothstep(cloud_radius - smoke.softness, cloud_radius, dist);

    // Two-tone: brighter center, slightly darker gray at edges
    let center_bright = smoothstep(0.6, 0.0, dist);
    let base_gray = mix(0.65, 1.0, center_bright);

    // Inner detail noise (subtle darker patches)
    let detail = fbm(uv * 6.0 - vec2(smoke.progress * 0.3, 0.0));
    let shade = base_gray * mix(0.85, 1.0, detail);

    let color = smoke.color.rgb * shade;

    // Lifetime fade: appear fast, linger, then fade out
    let fade_in = smoothstep(0.0, 0.1, smoke.progress);
    let fade_out = 1.0 - smoothstep(0.5, 1.0, smoke.progress);
    let alpha = cloud_mask * fade_in * fade_out * smoke.color.a;

    if alpha < 0.01 {
        discard;
    }

    return vec4(color, alpha);
}

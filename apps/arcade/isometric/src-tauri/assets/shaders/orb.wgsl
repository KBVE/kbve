#import bevy_ui::ui_vertex_output::UiVertexOutput
#import bevy_render::globals::Globals

@group(0) @binding(1)
var<uniform> globals: Globals;

struct OrbUniforms {
    fill: f32,
    wobble: f32,
    glow: f32,
    _pad0: f32,
    liquid_color: vec4<f32>,
    glass_color: vec4<f32>,
    bg_color: vec4<f32>,
    rim_color: vec4<f32>,
};

@group(1) @binding(0)
var<uniform> orb: OrbUniforms;

fn saturate_f(x: f32) -> f32 {
    return clamp(x, 0.0, 1.0);
}

fn circle_mask(p: vec2<f32>, r: f32, blur: f32) -> f32 {
    let d = length(p);
    return 1.0 - smoothstep(r, r + blur, d);
}

fn hash21(p: vec2<f32>) -> f32 {
    let h = dot(p, vec2<f32>(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

fn noise2(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let a = hash21(i);
    let b = hash21(i + vec2<f32>(1.0, 0.0));
    let c = hash21(i + vec2<f32>(0.0, 1.0));
    let d = hash21(i + vec2<f32>(1.0, 1.0));
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2<f32>) -> f32 {
    var v = 0.0;
    var a = 0.5;
    var q = p;
    for (var i = 0; i < 4; i = i + 1) {
        v += noise2(q) * a;
        q = q * 2.0 + vec2<f32>(17.3, 11.7);
        a *= 0.5;
    }
    return v;
}

@fragment
fn fragment(in: UiVertexOutput) -> @location(0) vec4<f32> {
    let uv = in.uv;
    let time = globals.time;

    // Center UV to [-1, 1]
    let p = uv * 2.0 - vec2<f32>(1.0, 1.0);
    let dist = length(p);

    // Orb shape
    let orb_radius = 0.95;
    let edge_softness = 0.02;
    let orb_mask = circle_mask(p, orb_radius, edge_softness);

    if (orb_mask <= 0.001) {
        discard;
    }

    // Inner cavity
    let inner_radius = 0.80;
    let inner_mask = circle_mask(p, inner_radius, 0.01);

    // Fake spherical lighting
    let fake_normal = normalize(vec3<f32>(p.x, -p.y, sqrt(max(0.0, 1.0 - dot(p * 0.9, p * 0.9)))));
    let light_dir = normalize(vec3<f32>(-0.5, 0.7, 1.0));
    let ndl = saturate_f(dot(fake_normal, light_dir));

    // Glass base
    var color = orb.bg_color.rgb * 0.4;
    color += orb.glass_color.rgb * (0.15 + 0.25 * ndl);

    // Liquid wave line
    let wobble_val =
        sin(p.x * 7.0 + time * 1.8) * orb.wobble +
        sin(p.x * 13.0 - time * 2.4) * orb.wobble * 0.45 +
        (fbm(vec2<f32>(p.x * 3.0, time * 0.35)) - 0.5) * orb.wobble * 0.7;

    // Convert fill from 0..1 to orb local space (p.y: -1 bottom, +1 top)
    let liquid_height = mix(-0.78, 0.78, orb.fill);
    let liquid_surface = liquid_height + wobble_val;

    let inside_liquid = select(0.0, 1.0, p.y <= liquid_surface);

    // Meniscus / surface band
    let surface_band = 1.0 - smoothstep(0.0, 0.035, abs(p.y - liquid_surface));

    // Liquid interior shading
    let depth_factor = saturate_f((liquid_surface - p.y) / 1.6);
    let liquid_noise = fbm(p * 4.0 + vec2<f32>(0.0, time * 0.35));
    let liquid_highlight = saturate_f(0.35 + 0.65 * ndl);

    var liquid_col = orb.liquid_color.rgb;
    liquid_col *= 0.65 + 0.55 * depth_factor;
    liquid_col *= 0.9 + 0.15 * liquid_noise;
    liquid_col += orb.liquid_color.rgb * surface_band * 0.28;
    liquid_col += vec3<f32>(1.0, 1.0, 1.0) * surface_band * 0.10 * liquid_highlight;

    // Mix liquid into inner orb only
    color = mix(color, liquid_col, inside_liquid * inner_mask);

    // Empty top region tint
    let empty_top = (1.0 - inside_liquid) * inner_mask;
    color += orb.bg_color.rgb * empty_top * (0.18 + 0.12 * ndl);

    // Rim
    let rim = smoothstep(0.68, 0.95, dist) - smoothstep(0.90, 0.98, dist);
    color += orb.rim_color.rgb * rim * (0.7 + orb.glow);

    // Strong specular glass highlights
    let highlight1 = pow(saturate_f(dot(fake_normal, normalize(vec3<f32>(-0.7, 0.9, 1.0)))), 48.0);
    let highlight2 = pow(saturate_f(dot(fake_normal, normalize(vec3<f32>(0.45, -0.2, 1.0)))), 22.0) * 0.35;
    color += vec3<f32>(1.0, 1.0, 1.0) * (highlight1 * 0.85 + highlight2 * 0.25);

    // Top crescent shine
    let top_crescent = smoothstep(0.25, -0.45, p.y) * smoothstep(0.95, 0.55, dist);
    color += vec3<f32>(1.0, 1.0, 1.0) * top_crescent * 0.08;

    // Inner shadow near bottom for orb depth
    let bottom_shadow = smoothstep(-0.15, -0.85, p.y) * inner_mask;
    color *= 1.0 - bottom_shadow * 0.18;

    // Outer alpha
    let alpha = orb_mask;

    return vec4<f32>(color, alpha);
}

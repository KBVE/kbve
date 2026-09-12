#import bevy_pbr::{
    forward_io::{VertexOutput, FragmentOutput},
    pbr_fragment::pbr_input_from_standard_material,
    pbr_functions::{apply_pbr_lighting, main_pass_post_lighting_processing},
    mesh_view_bindings::globals,
}

struct WaterParams {
    shallow_color: vec4<f32>,
    deep_color: vec4<f32>,
    shore_fade: f32,
    deep_at: f32,
    max_alpha: f32,
    ripple_strength: f32,
}

@group(#{MATERIAL_BIND_GROUP}) @binding(100) var<uniform> water: WaterParams;

const WAVE_A = vec2<f32>(0.83, 0.55);
const WAVE_B = vec2<f32>(-0.42, 0.91);

fn ripple_normal(position: vec2<f32>, time: f32) -> vec3<f32> {
    let phase_a = dot(position, WAVE_A) * 0.55 + time * 1.1;
    let phase_b = dot(position, WAVE_B) * 0.90 - time * 0.8;
    let slope = WAVE_A * cos(phase_a) * 0.55 + WAVE_B * cos(phase_b) * 0.90;
    return normalize(vec3(
        -slope.x * water.ripple_strength,
        1.0,
        -slope.y * water.ripple_strength,
    ));
}

@fragment
fn fragment(in: VertexOutput, @builtin(front_facing) is_front: bool) -> FragmentOutput {
    var pbr_input = pbr_input_from_standard_material(in, is_front);

    let depth = in.uv.x;
    let shore = clamp(depth / water.shore_fade, 0.0, 1.0);
    let body = clamp(depth / water.deep_at, 0.0, 1.0);

    let tint = mix(water.shallow_color, water.deep_color, body * body);
    pbr_input.material.base_color = vec4(tint.rgb, water.max_alpha * shore * shore);

    let normal = ripple_normal(in.world_position.xz, globals.time);
    pbr_input.N = normal;
    pbr_input.world_normal = normal;

    var out: FragmentOutput;
    out.color = apply_pbr_lighting(pbr_input);
    out.color = main_pass_post_lighting_processing(pbr_input, out.color);
    return out;
}

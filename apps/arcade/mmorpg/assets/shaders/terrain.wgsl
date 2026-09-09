#import bevy_pbr::{
    forward_io::{VertexOutput, FragmentOutput},
    pbr_fragment::pbr_input_from_standard_material,
    pbr_functions::{alpha_discard, apply_pbr_lighting, main_pass_post_lighting_processing},
    pbr_types::STANDARD_MATERIAL_FLAGS_UNLIT_BIT,
}

struct TerrainParams {
    tile_scale: f32,
    macro_scale: f32,
    rock_slope: f32,
    sand_level: f32,
    snow_level: f32,
    blend_range: f32,
    macro_strength: f32,
    _pad: f32,
}

@group(#{MATERIAL_BIND_GROUP}) @binding(100) var<uniform> terrain: TerrainParams;
@group(#{MATERIAL_BIND_GROUP}) @binding(101) var layers: texture_2d_array<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(102) var layers_sampler: sampler;

fn splat_weights(world_normal: vec3<f32>, height: f32) -> vec4<f32> {
    let range = terrain.blend_range;
    let snow = smoothstep(terrain.snow_level - range, terrain.snow_level + range, height);
    let sand = 1.0 - smoothstep(terrain.sand_level - range, terrain.sand_level + range, height);
    let grass = max(1.0 - snow - sand, 0.0);
    let slope = 1.0 - clamp(world_normal.y, 0.0, 1.0);
    let rock = smoothstep(terrain.rock_slope - 0.08, terrain.rock_slope + 0.08, slope);
    let ground = 1.0 - rock;
    return vec4(grass * ground, rock, sand * ground, snow * ground);
}

fn blend_layers(uv: vec2<f32>, ddx: vec2<f32>, ddy: vec2<f32>, weights: vec4<f32>) -> vec3<f32> {
    var color = textureSampleGrad(layers, layers_sampler, uv, 0u, ddx, ddy).rgb * weights.x;
    color += textureSampleGrad(layers, layers_sampler, uv, 1u, ddx, ddy).rgb * weights.y;
    color += textureSampleGrad(layers, layers_sampler, uv, 2u, ddx, ddy).rgb * weights.z;
    color += textureSampleGrad(layers, layers_sampler, uv, 3u, ddx, ddy).rgb * weights.w;
    return color;
}

@fragment
fn fragment(in: VertexOutput, @builtin(front_facing) is_front: bool) -> FragmentOutput {
    var pbr_input = pbr_input_from_standard_material(in, is_front);

    let uv = in.world_position.xz * terrain.tile_scale;
    let ddx = dpdx(uv);
    let ddy = dpdy(uv);

    let weights = splat_weights(in.world_normal, in.world_position.y);
    let detail = blend_layers(uv, ddx, ddy, weights);

    let macro_uv = uv * terrain.macro_scale;
    let macro_tint = textureSampleGrad(
        layers,
        layers_sampler,
        macro_uv,
        0u,
        ddx * terrain.macro_scale,
        ddy * terrain.macro_scale,
    ).rgb;

    let tinted = detail * mix(vec3(1.0), macro_tint * 2.0, terrain.macro_strength);
    pbr_input.material.base_color *= vec4(tinted, 1.0);
    pbr_input.material.base_color = alpha_discard(pbr_input.material, pbr_input.material.base_color);

    var out: FragmentOutput;
    if (pbr_input.material.flags & STANDARD_MATERIAL_FLAGS_UNLIT_BIT) == 0u {
        out.color = apply_pbr_lighting(pbr_input);
    } else {
        out.color = pbr_input.material.base_color;
    }
    out.color = main_pass_post_lighting_processing(pbr_input, out.color);
    return out;
}

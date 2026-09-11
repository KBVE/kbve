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
    wet_darkening: f32,
    wet_roughness: f32,
    normal_strength: f32,
    variant_scale: f32,
    variant_frequency: f32,
}

@group(#{MATERIAL_BIND_GROUP}) @binding(100) var<uniform> terrain: TerrainParams;
@group(#{MATERIAL_BIND_GROUP}) @binding(101) var layers: texture_2d_array<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(102) var layers_sampler: sampler;
@group(#{MATERIAL_BIND_GROUP}) @binding(103) var normals: texture_2d_array<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(104) var normals_sampler: sampler;

fn hash21(p: vec2<f32>) -> f32 {
    var h = fract(p * vec2(0.1031, 0.1030));
    h += dot(h, h.yx + 33.33);
    return fract((h.x + h.y) * h.x);
}

fn value_noise(p: vec2<f32>) -> f32 {
    let cell = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    let a = hash21(cell);
    let b = hash21(cell + vec2(1.0, 0.0));
    let c = hash21(cell + vec2(0.0, 1.0));
    let d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/// Rotation for the second sampling, chosen so it shares no axis with the first.
const VARIANT_ROTATION = mat2x2<f32>(0.8, -0.6, 0.6, 0.8);

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

fn blend_normals(uv: vec2<f32>, ddx: vec2<f32>, ddy: vec2<f32>, weights: vec4<f32>) -> vec3<f32> {
    var packed = textureSampleGrad(normals, normals_sampler, uv, 0u, ddx, ddy).xyz * weights.x;
    packed += textureSampleGrad(normals, normals_sampler, uv, 1u, ddx, ddy).xyz * weights.y;
    packed += textureSampleGrad(normals, normals_sampler, uv, 2u, ddx, ddy).xyz * weights.z;
    packed += textureSampleGrad(normals, normals_sampler, uv, 3u, ddx, ddy).xyz * weights.w;
    return packed * 2.0 - 1.0;
}

/// Tangent frame straight from the mapping: the uv is world xz, so u runs along world x.
fn ground_frame(world_normal: vec3<f32>) -> mat3x3<f32> {
    let up = normalize(world_normal);
    var tangent = vec3(1.0, 0.0, 0.0) - up * up.x;
    if dot(tangent, tangent) < 1e-6 {
        tangent = vec3(0.0, 0.0, 1.0) - up * up.z;
    }
    tangent = normalize(tangent);
    return mat3x3(tangent, normalize(cross(tangent, up)), up);
}

@fragment
fn fragment(in: VertexOutput, @builtin(front_facing) is_front: bool) -> FragmentOutput {
    var pbr_input = pbr_input_from_standard_material(in, is_front);

    let base_uv = in.world_position.xz * terrain.tile_scale;
    let ddx = dpdx(base_uv);
    let ddy = dpdy(base_uv);
    let uv = base_uv;
    let variant_uv = (VARIANT_ROTATION * base_uv) * terrain.variant_scale;

    let wetness = in.uv.x;
    let dry = splat_weights(in.world_normal, in.world_position.y);
    let bank = vec4(0.0, dry.y, 1.0 - dry.y, 0.0);
    let weights = mix(dry, bank, wetness);
    let variant_mix = smoothstep(
        0.35,
        0.65,
        value_noise(in.world_position.xz * terrain.variant_frequency),
    );
    let detail = mix(
        blend_layers(uv, ddx, ddy, weights),
        blend_layers(
            variant_uv,
            VARIANT_ROTATION * ddx * terrain.variant_scale,
            VARIANT_ROTATION * ddy * terrain.variant_scale,
            weights,
        ),
        variant_mix,
    );

    let macro_uv = base_uv * terrain.macro_scale;
    let macro_tint = textureSampleGrad(
        layers,
        layers_sampler,
        macro_uv,
        0u,
        ddx * terrain.macro_scale,
        ddy * terrain.macro_scale,
    ).rgb;

    let macro_luma = dot(macro_tint, vec3(0.2126, 0.7152, 0.0722));
    let variation = clamp(1.0 + (macro_luma - 0.5) * terrain.macro_strength * 2.0, 0.6, 1.4);
    let soaked = detail * variation * mix(1.0, terrain.wet_darkening, wetness);
    pbr_input.material.base_color *= vec4(soaked, 1.0);
    pbr_input.material.perceptual_roughness = mix(
        pbr_input.material.perceptual_roughness,
        terrain.wet_roughness,
        wetness,
    );
    pbr_input.material.base_color = alpha_discard(pbr_input.material, pbr_input.material.base_color);

    let frame = ground_frame(in.world_normal);
    let tangent_normal = blend_normals(uv, ddx, ddy, weights);
    let strength = terrain.normal_strength * mix(1.0, 0.45, wetness);
    pbr_input.N = normalize(frame * vec3(tangent_normal.xy * strength, tangent_normal.z));
    pbr_input.world_normal = frame[2];

    var out: FragmentOutput;
    if (pbr_input.material.flags & STANDARD_MATERIAL_FLAGS_UNLIT_BIT) == 0u {
        out.color = apply_pbr_lighting(pbr_input);
    } else {
        out.color = pbr_input.material.base_color;
    }
    out.color = main_pass_post_lighting_processing(pbr_input, out.color);
    return out;
}

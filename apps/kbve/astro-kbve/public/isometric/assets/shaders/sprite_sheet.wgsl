#import bevy_pbr::mesh_functions
#import bevy_pbr::view_transformations::position_world_to_clip

@group(#{MATERIAL_BIND_GROUP}) @binding(0)
var atlas_tex: texture_2d<f32>;

@group(#{MATERIAL_BIND_GROUP}) @binding(1)
var atlas_sampler: sampler;

struct SpriteAnimData {
    frame: u32,
    flip: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(#{MATERIAL_BIND_GROUP}) @binding(2)
var<storage, read> anim_data: array<SpriteAnimData>;

struct AtlasGrid {
    cols: u32,
    rows: u32,
};

@group(#{MATERIAL_BIND_GROUP}) @binding(3)
var<uniform> atlas_grid: AtlasGrid;

@group(#{MATERIAL_BIND_GROUP}) @binding(4)
var<uniform> tint: vec4<f32>;

struct Vertex {
    @builtin(instance_index) instance_index: u32,
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vertex(in: Vertex) -> VertexOutput {
    var out: VertexOutput;

    let tag = mesh_functions::get_tag(in.instance_index);
    let frame = anim_data[tag].frame;
    let flip = anim_data[tag].flip;

    let world_from_local = mesh_functions::get_world_from_local(in.instance_index);
    let world_pos = mesh_functions::mesh_position_local_to_world(
        world_from_local,
        vec4<f32>(in.position, 1.0)
    );

    out.clip_position = position_world_to_clip(world_pos.xyz);

    let cols = atlas_grid.cols;
    let rows = atlas_grid.rows;

    let frame_x = frame % cols;
    let frame_y = frame / cols;

    let cell = vec2<f32>(1.0 / f32(cols), 1.0 / f32(rows));
    let base = vec2<f32>(f32(frame_x), f32(frame_y)) * cell;

    var u = in.uv.x;
    if (flip > 0u) {
        u = 1.0 - u;
    }
    out.uv = base + vec2(u, in.uv.y) * cell;
    return out;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(atlas_tex, atlas_sampler, in.uv);

    if (color.a < 0.01) {
        discard;
    }

    return vec4<f32>(color.rgb * tint.rgb, color.a * tint.a);
}

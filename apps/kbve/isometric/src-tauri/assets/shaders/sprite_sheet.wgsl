//! Sprite sheet shader using automatic instancing + storage buffer.
//!
//! Combines Bevy 0.18's automatic_instancing and storage_buffer examples:
//! - Atlas texture via Material bind group (#{MATERIAL_BIND_GROUP})
//! - Per-instance sprite data via storage buffer, indexed by MeshTag
//! - One draw call per creature type (all frogs, all wraiths, etc.)
//!
//! SpriteData layout per instance:
//!   [0] = vec4(frame_col, frame_row, sheet_cols, sheet_rows)
//!   [1] = vec4(flip, alpha_cutoff, 0, 0)
//!   [2] = vec4(tint_r, tint_g, tint_b, tint_a)

#import bevy_pbr::{
    mesh_functions,
    view_transformations::position_world_to_clip
}

// Per-instance sprite data: 3 vec4s per sprite, packed into flat array
// Index = MeshTag * 3
@group(#{MATERIAL_BIND_GROUP}) @binding(0) var<storage, read> sprite_data: array<vec4<f32>>;
@group(#{MATERIAL_BIND_GROUP}) @binding(1) var sprite_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(2) var sprite_sampler: sampler;

struct Vertex {
    @builtin(instance_index) instance_index: u32,
    @location(0) position: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) tint: vec4<f32>,
    @location(2) alpha_cutoff: f32,
};

@vertex
fn vertex(vertex: Vertex) -> VertexOutput {
    var out: VertexOutput;

    let tag = mesh_functions::get_tag(vertex.instance_index);
    var world_from_local = mesh_functions::get_world_from_local(vertex.instance_index);
    let world_position = mesh_functions::mesh_position_local_to_world(
        world_from_local,
        vec4(vertex.position, 1.0),
    );
    out.clip_position = position_world_to_clip(world_position.xyz);

    // Read per-instance data from storage buffer
    let base = tag * 3u;
    let frame_data = sprite_data[base];      // frame_col, frame_row, sheet_cols, sheet_rows
    let extra_data = sprite_data[base + 1u]; // flip, alpha_cutoff, 0, 0
    let tint_data = sprite_data[base + 2u];  // tint RGBA

    // Compute atlas UVs
    let frame_w = 1.0 / frame_data.z;
    let frame_h = 1.0 / frame_data.w;

    var u = vertex.uv.x;
    if (extra_data.x > 0.5) {
        u = 1.0 - u;
    }

    out.uv = vec2(
        frame_data.x * frame_w + u * frame_w,
        frame_data.y * frame_h + vertex.uv.y * frame_h,
    );
    out.tint = tint_data;
    out.alpha_cutoff = extra_data.y;

    return out;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex = textureSample(sprite_texture, sprite_sampler, in.uv);
    let color = tex * in.tint;

    if (color.a < in.alpha_cutoff) {
        discard;
    }

    return color;
}

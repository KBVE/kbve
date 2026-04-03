//! Uniform-driven sprite sheet shader.
//!
//! Computes atlas UVs in the vertex shader from frame/sheet uniforms,
//! eliminating per-frame mesh UV buffer uploads. Supports horizontal
//! flip and RGBA tint for day/night coloring.

#import bevy_pbr::mesh_functions::mesh_position_local_to_clip
#import bevy_pbr::forward_io::Vertex

struct SpriteUniforms {
    tint: vec4<f32>,
    frame_col: f32,
    frame_row: f32,
    sheet_cols: f32,
    sheet_rows: f32,
    flip: f32,
    alpha_cutoff: f32,
    _pad0: f32,
    _pad1: f32,
}

@group(2) @binding(0) var<uniform> sprite: SpriteUniforms;
@group(2) @binding(1) var sprite_texture: texture_2d<f32>;
@group(2) @binding(2) var sprite_sampler: sampler;

struct SpriteVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vertex(in: Vertex) -> SpriteVertexOutput {
    var out: SpriteVertexOutput;

    out.position = mesh_position_local_to_clip(
        in.instance_index,
        vec4(in.position, 1.0),
    );

    // in.uv is [0,1] normalized across the quad.
    // Map to the correct atlas frame using uniforms.
    let frame_w = 1.0 / sprite.sheet_cols;
    let frame_h = 1.0 / sprite.sheet_rows;

    var u = in.uv.x;
    if (sprite.flip > 0.5) {
        u = 1.0 - u;
    }

    let atlas_u = sprite.frame_col * frame_w + u * frame_w;
    let atlas_v = sprite.frame_row * frame_h + in.uv.y * frame_h;

    out.uv = vec2(atlas_u, atlas_v);
    return out;
}

@fragment
fn fragment(in: SpriteVertexOutput) -> @location(0) vec4<f32> {
    let tex = textureSample(sprite_texture, sprite_sampler, in.uv);
    let color = tex * sprite.tint;

    if (color.a < sprite.alpha_cutoff) {
        discard;
    }

    return color;
}

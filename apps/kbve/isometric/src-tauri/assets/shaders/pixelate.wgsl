#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput

struct PixelateSettings {
    pixel_size: f32,
}

@group(0) @binding(0) var screen_texture: texture_2d<f32>;
@group(0) @binding(1) var texture_sampler: sampler;
@group(0) @binding(2) var<uniform> settings: PixelateSettings;

@fragment
fn fragment(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let resolution = vec2<f32>(textureDimensions(screen_texture));
    let pixel_size = max(settings.pixel_size, 1.0);
    let cell = pixel_size / resolution;
    let snapped_uv = (floor(in.uv / cell) + 0.5) * cell;
    return textureSample(screen_texture, texture_sampler, snapped_uv);
}

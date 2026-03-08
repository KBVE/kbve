#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput

struct PixelateSettings {
    pixel_size: f32,
    edge_strength: f32,
    depth_edge_strength: f32,
    scale_factor: f32,
}

@group(0) @binding(0) var screen_texture: texture_2d<f32>;
@group(0) @binding(1) var texture_sampler: sampler;
@group(0) @binding(2) var<uniform> settings: PixelateSettings;

// Sample the screen texture at a UV coordinate (clamped, no filtering).
fn sample_block(uv: vec2<f32>, resolution: vec2<f32>) -> vec4<f32> {
    let coord = vec2<i32>(clamp(uv * resolution, vec2(0.0), resolution - 1.0));
    return textureLoad(screen_texture, coord, 0);
}

@fragment
fn fragment(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let resolution = vec2<f32>(textureDimensions(screen_texture));

    let logical_res = resolution / max(settings.scale_factor, 1.0);
    let block_count = floor(logical_res / max(settings.pixel_size, 1.0));

    // Current block in the grid
    let block = floor(in.uv * block_count);
    let block_uv = (block + 0.5) / block_count;

    // Sample center of current block
    let color = sample_block(block_uv, resolution);

    // Sample 4 neighbor blocks
    let color_left = sample_block(((block - vec2(1.0, 0.0)) + 0.5) / block_count, resolution);
    let color_top = sample_block(((block - vec2(0.0, 1.0)) + 0.5) / block_count, resolution);
    let color_right = sample_block(((block + vec2(1.0, 0.0)) + 0.5) / block_count, resolution);
    let color_bottom = sample_block(((block + vec2(0.0, 1.0)) + 0.5) / block_count, resolution);

    // --- Normal-like edge detection (color direction shift) ---
    let norm_c = normalize(color.rgb + vec3(0.001));
    let norm_l = normalize(color_left.rgb + vec3(0.001));
    let norm_t = normalize(color_top.rgb + vec3(0.001));
    let norm_r = normalize(color_right.rgb + vec3(0.001));
    let norm_b = normalize(color_bottom.rgb + vec3(0.001));

    let hue_diff = max(
        max(length(norm_c - norm_l), length(norm_c - norm_r)),
        max(length(norm_c - norm_t), length(norm_c - norm_b))
    );
    let normal_edge = smoothstep(0.15, 0.45, hue_diff) * settings.edge_strength;

    // --- Depth-like edge detection (large absolute color jumps) ---
    let diff_max = max(
        max(length(color.rgb - color_left.rgb), length(color.rgb - color_right.rgb)),
        max(length(color.rgb - color_top.rgb), length(color.rgb - color_bottom.rgb))
    );
    let depth_edge = smoothstep(0.30, 0.70, diff_max) * settings.depth_edge_strength;

    let edge_factor = min(max(normal_edge, depth_edge), 1.0);

    // Darken at block boundaries where edges are detected
    var final_edge: f32;
    if settings.pixel_size < 1.5 {
        final_edge = edge_factor;
    } else {
        let block_pos = fract(in.uv * block_count);
        let edge_width = 1.0 / settings.pixel_size;
        let at_edge = select(0.0, 1.0,
            block_pos.x < edge_width || block_pos.y < edge_width);
        final_edge = edge_factor * at_edge;
    }

    let result = mix(color.rgb, color.rgb * 0.35, final_edge);
    return vec4(result, color.a);
}

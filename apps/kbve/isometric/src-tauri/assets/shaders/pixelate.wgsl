#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput

struct PixelateSettings {
    pixel_size: f32,
    highlight_strength: f32,
    shadow_strength: f32,
    scale_factor: f32,
    shadow_darkness: f32,
    highlight_brightness: f32,
    normal_threshold_low: f32,
    normal_threshold_high: f32,
    depth_threshold_low: f32,
    depth_threshold_high: f32,
    artifact_suppression: f32,
    _padding: f32,
}

@group(0) @binding(0) var screen_texture: texture_2d<f32>;
@group(0) @binding(1) var texture_sampler: sampler;
@group(0) @binding(2) var<uniform> settings: PixelateSettings;

// Sample the screen texture at a UV coordinate (clamped, no filtering).
fn sample_block(uv: vec2<f32>, resolution: vec2<f32>) -> vec4<f32> {
    let coord = vec2<i32>(clamp(uv * resolution, vec2(0.0), resolution - 1.0));
    return textureLoad(screen_texture, coord, 0);
}

// Perceived luminance (Rec. 709). Works on linear RGB (Tonemapping::None).
fn luminance(c: vec3<f32>) -> f32 {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
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
    let color_left   = sample_block(((block + vec2(-1.0,  0.0)) + 0.5) / block_count, resolution);
    let color_right  = sample_block(((block + vec2( 1.0,  0.0)) + 0.5) / block_count, resolution);
    let color_top    = sample_block(((block + vec2( 0.0, -1.0)) + 0.5) / block_count, resolution);
    let color_bottom = sample_block(((block + vec2( 0.0,  1.0)) + 0.5) / block_count, resolution);

    // ── HIGHLIGHT EDGES (color direction shift) ──────────────────────────
    // Normalized color vectors detect hue changes independent of brightness.
    let eps = vec3(0.001);
    let norm_c = normalize(color.rgb + eps);
    let norm_l = normalize(color_left.rgb + eps);
    let norm_r = normalize(color_right.rgb + eps);
    let norm_t = normalize(color_top.rgb + eps);
    let norm_b = normalize(color_bottom.rgb + eps);

    let normal_diff = max(
        max(length(norm_c - norm_l), length(norm_c - norm_r)),
        max(length(norm_c - norm_t), length(norm_c - norm_b))
    );
    let normal_edge = smoothstep(
        settings.normal_threshold_low,
        settings.normal_threshold_high,
        normal_diff
    ) * settings.highlight_strength;

    // ── SHADOW EDGES (luminance-based depth proxy, two-sided) ────────────
    // Luminance better approximates depth discontinuities than raw RGB
    // distance because brightness correlates with light-facing vs occluded.
    let lum_c = luminance(color.rgb);
    let lum_l = luminance(color_left.rgb);
    let lum_r = luminance(color_right.rgb);
    let lum_t = luminance(color_top.rgb);
    let lum_b = luminance(color_bottom.rgb);

    // Positive: neighbor brighter (outer silhouette, center in shadow)
    let pos_depth = max(
        max(lum_l - lum_c, lum_r - lum_c),
        max(lum_t - lum_c, lum_b - lum_c)
    );

    // Negative: center brighter (inner edge, center lit)
    let neg_depth = max(
        max(lum_c - lum_l, lum_c - lum_r),
        max(lum_c - lum_t, lum_c - lum_b)
    );

    // Either direction means a depth-like boundary
    let depth_raw = max(pos_depth, neg_depth);
    let depth_edge = smoothstep(
        settings.depth_threshold_low,
        settings.depth_threshold_high,
        depth_raw
    ) * settings.shadow_strength;

    // ── ARTIFACT SUPPRESSION ─────────────────────────────────────────────
    // Where depth and normal edges coincide, suppress highlights to avoid
    // double-lining (dark shadow + bright highlight side by side).
    let neg_depth_edge = smoothstep(
        settings.depth_threshold_low,
        settings.depth_threshold_high,
        neg_depth
    );
    let suppressed_highlight = clamp(
        normal_edge - neg_depth_edge * settings.artifact_suppression,
        0.0,
        1.0
    );

    // ── BLOCK-BOUNDARY GATING ────────────────────────────────────────────
    // For pixel_size >= 1.5, edges only render at block borders for a
    // classic pixel-art grid-aligned outline look.
    var at_edge: f32;
    if settings.pixel_size < 1.5 {
        at_edge = 1.0;
    } else {
        let block_pos = fract(in.uv * block_count);
        let edge_width = 1.0 / settings.pixel_size;
        at_edge = select(0.0, 1.0,
            block_pos.x < edge_width || block_pos.y < edge_width);
    }

    let final_shadow = depth_edge * at_edge;
    let final_highlight = suppressed_highlight * at_edge;

    // ── DUAL-TONE COMPOSITING ────────────────────────────────────────────
    // Shadow first: depth edges darken toward (color * shadow_darkness).
    let shadow_color = color.rgb * settings.shadow_darkness;
    var result = mix(color.rgb, shadow_color, final_shadow);

    // Highlight on top: normal edges brighten toward white.
    let highlight_color = mix(result, vec3(1.0), settings.highlight_brightness);
    result = mix(result, highlight_color, final_highlight);

    return vec4(result, color.a);
}

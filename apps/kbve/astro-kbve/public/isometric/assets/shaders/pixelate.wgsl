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
    toon_bands: f32,
    color_levels: f32,
    color_noise: f32,
    _pad1: f32,
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

// Toon/cel-shade: quantize brightness into discrete bands while preserving hue.
fn toon_quantize(c: vec3<f32>, bands: f32) -> vec3<f32> {
    if bands <= 1.0 { return c; }
    let lum = luminance(c);
    if lum < 0.001 { return c; }
    let quantized = floor(lum * bands + 0.5) / bands;
    return c * (quantized / lum);
}

// Palette quantization: snap each channel to N discrete levels.
fn palette_quantize(c: vec3<f32>, levels: f32) -> vec3<f32> {
    if levels <= 1.0 { return c; }
    return floor(c * levels + 0.5) / levels;
}

// Deterministic per-pixel noise from screen coordinates.
fn screen_hash(p: vec2<f32>) -> f32 {
    let h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453);
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
    let color_raw = sample_block(block_uv, resolution);

    // Sample 4 neighbor blocks
    let left_raw   = sample_block(((block + vec2(-1.0,  0.0)) + 0.5) / block_count, resolution);
    let right_raw  = sample_block(((block + vec2( 1.0,  0.0)) + 0.5) / block_count, resolution);
    let top_raw    = sample_block(((block + vec2( 0.0, -1.0)) + 0.5) / block_count, resolution);
    let bottom_raw = sample_block(((block + vec2( 0.0,  1.0)) + 0.5) / block_count, resolution);

    // ── TOON PASS (cel-shade: quantize brightness bands) ─────────────────
    let color  = vec4(toon_quantize(color_raw.rgb,  settings.toon_bands), color_raw.a);
    let color_left   = vec4(toon_quantize(left_raw.rgb,   settings.toon_bands), left_raw.a);
    let color_right  = vec4(toon_quantize(right_raw.rgb,  settings.toon_bands), right_raw.a);
    let color_top    = vec4(toon_quantize(top_raw.rgb,    settings.toon_bands), top_raw.a);
    let color_bottom = vec4(toon_quantize(bottom_raw.rgb, settings.toon_bands), bottom_raw.a);

    // ── HIGHLIGHT EDGES (color direction shift) ──────────────────────────
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
    let lum_c = luminance(color.rgb);
    let lum_l = luminance(color_left.rgb);
    let lum_r = luminance(color_right.rgb);
    let lum_t = luminance(color_top.rgb);
    let lum_b = luminance(color_bottom.rgb);

    let pos_depth = max(
        max(lum_l - lum_c, lum_r - lum_c),
        max(lum_t - lum_c, lum_b - lum_c)
    );

    let neg_depth = max(
        max(lum_c - lum_l, lum_c - lum_r),
        max(lum_c - lum_t, lum_c - lum_b)
    );

    let depth_raw = max(pos_depth, neg_depth);
    let depth_edge = smoothstep(
        settings.depth_threshold_low,
        settings.depth_threshold_high,
        depth_raw
    ) * settings.shadow_strength;

    // ── ARTIFACT SUPPRESSION ─────────────────────────────────────────────
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
    let shadow_color = color.rgb * settings.shadow_darkness;
    var result = mix(color.rgb, shadow_color, final_shadow);

    let highlight_color = mix(result, vec3(1.0), settings.highlight_brightness);
    result = mix(result, highlight_color, final_highlight);

    // ── PALETTE QUANTIZATION (reduce color variation → painted look) ─────
    result = palette_quantize(result, settings.color_levels);

    // ── SCENE COLOR GRADE (warm highlights, cool shadows, lifted darks) ──
    let lum_final = luminance(result);
    // Warm/cool color grade — punchier split for painted look
    let warm = vec3(1.06, 1.02, 0.90);   // highlights: warmer golden
    let cool = vec3(0.88, 0.94, 1.10);   // shadows: cooler blue
    let grade_t = smoothstep(0.12, 0.50, lum_final);
    result *= mix(cool, warm, grade_t);
    // Lift darks: prevent pure black, atmospheric base
    result = max(result, vec3(0.022, 0.025, 0.035));
    // Slight saturation boost in midtones
    let mid_t = smoothstep(0.0, 0.3, lum_final) * smoothstep(0.8, 0.4, lum_final);
    let sat_gray = vec3(luminance(result));
    result = mix(result, result * 1.12, mid_t * 0.3); // +12% saturation in mids
    // Desaturation in deep shadows
    let desat_t = smoothstep(0.10, 0.0, lum_final) * 0.40;
    result = mix(result, sat_gray, desat_t);

    // ── COLOR NOISE (break banding, add texture) ─────────────────────────
    if settings.color_noise > 0.0 {
        let noise = (screen_hash(block) - 0.5) * settings.color_noise;
        result += vec3(noise);
    }

    return vec4(result, color.a);
}

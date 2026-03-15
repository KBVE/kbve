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

// 2D hash for leaf noise (two outputs for directional patterns).
fn hash2(p: vec2<f32>) -> vec2<f32> {
    let q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(q) * 43758.5453);
}

// Value noise with directional stretch for leaf-streak patterns.
// Stretched ~2× along a diagonal to create elongated leaf shapes.
fn leaf_noise(p: vec2<f32>) -> f32 {
    // Skew coordinates to create diagonal streak direction
    let sp = vec2(p.x * 0.7 + p.y * 0.4, p.x * -0.3 + p.y * 0.8);
    let i = floor(sp);
    let f = fract(sp);
    // Smooth interpolation (cubic hermite)
    let u = f * f * (3.0 - 2.0 * f);
    let a = screen_hash(i);
    let b = screen_hash(i + vec2(1.0, 0.0));
    let c = screen_hash(i + vec2(0.0, 1.0));
    let d = screen_hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Multi-octave leaf cluster noise. Returns 0..1 range.
// High frequency for 2-3 pixel leaf clumps with jagged edges.
fn foliage_breakup(block: vec2<f32>) -> f32 {
    // Leaf clumps: ~2-3 pixels across (main structure)
    let n1 = leaf_noise(block * 0.8);
    // Leaf detail: ~1-2 pixels, irregular edges
    let n2 = leaf_noise(block * 1.6 + vec2(50.0, 80.0));
    // Per-pixel hash: jagged leaf tips
    let n3 = screen_hash(block * 0.93 + vec2(37.0, 91.0));
    // Combine: weighted sum, heavier on the clump scale
    return n1 * 0.50 + n2 * 0.30 + n3 * 0.20;
}

// Detect foliage pixels: green-dominant hue. Wider detection than before.
fn is_foliage(c: vec3<f32>) -> f32 {
    // Green must exceed both red and blue
    let dominance = min(c.g - c.r, c.g - c.b);
    // Very low threshold so even dark canopy shadow gets detected
    return smoothstep(0.005, 0.04, dominance) * smoothstep(0.02, 0.06, c.g);
}

// Apply leaf breakup to a single foliage pixel.
// Binary: every pixel is either a shadow pocket or a lit leaf cluster.
// No dead zone — hard step at 0.48 threshold. This forces maximum
// contrast between adjacent pixels for crisp leaf-cluster boundaries.
fn apply_leaf_breakup(c: vec3<f32>, block_pos: vec2<f32>) -> vec3<f32> {
    let fg = is_foliage(c);
    if fg < 0.01 { return c; }

    let n = foliage_breakup(block_pos);
    let lum = luminance(c);

    // Hard binary split: dark pocket vs bright leaf
    var adjusted: vec3<f32>;
    if n < 0.48 {
        // Shadow pocket: deep interior darkness
        // Darker pixels get pushed even darker (deeper canopy = deeper shadow)
        let dark_strength = 0.45 + lum * 0.20; // 0.45 for dark base, up to 0.65 for brighter
        adjusted = c * dark_strength;
    } else {
        // Lit leaf cluster: catching light
        // Brighter base pixels get an even bigger boost (sunlit leaf surface)
        let bright_strength = 1.35 + (1.0 - lum) * 0.30; // 1.35 for bright, up to 1.65 for dark
        adjusted = c * bright_strength;
    }

    return mix(c, adjusted, fg);
}

// ── BARK BREAKUP ───────────────────────────────────────────────────────
// Vertical furrow noise: bark grain runs up the trunk.
// In isometric view, screen-Y roughly maps to world-vertical, so we
// stretch noise along screen-Y for elongated vertical furrows.
fn bark_noise(p: vec2<f32>) -> f32 {
    // Stretch ~2.5× vertically for tall, narrow furrow lines
    let sp = vec2(p.x * 1.0, p.y * 0.4);
    let i = floor(sp);
    let f = fract(sp);
    let u = f * f * (3.0 - 2.0 * f);
    let a = screen_hash(i + vec2(73.0, 19.0));
    let b = screen_hash(i + vec2(74.0, 19.0));
    let c = screen_hash(i + vec2(73.0, 20.0));
    let d = screen_hash(i + vec2(74.0, 20.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Multi-octave bark furrow pattern. Returns 0..1.
// Higher frequencies so furrows are visible on 3-5 pixel wide trunks.
fn bark_breakup(block: vec2<f32>) -> f32 {
    // Primary furrows: ~1-2 pixels wide
    let n1 = bark_noise(block * 1.4);
    // Fine cracks: sub-pixel detail
    let n2 = bark_noise(block * 2.8 + vec2(31.0, 67.0));
    // Per-pixel roughness: random knot/pitting
    let n3 = screen_hash(block * 1.3 + vec2(43.0, 71.0));
    return n1 * 0.45 + n2 * 0.30 + n3 * 0.25;
}

// Detect bark/trunk pixels: NOT green-dominant, NOT sky/water.
// Catches brown, grey, and tan bark across all tree species.
fn is_bark(c: vec3<f32>) -> f32 {
    // Exclude foliage: green must NOT dominate
    let green_dom = min(c.g - c.r, c.g - c.b);
    let not_foliage = smoothstep(0.005, -0.02, green_dom);
    // Must not be blue-dominant (sky/water)
    let blue_dom = c.b - max(c.r, c.g);
    let not_blue = smoothstep(0.01, -0.02, blue_dom);
    // Bark has some color (not pure grey) OR is warm-leaning
    // Very permissive: catches brown (R>B), grey (R≈G≈B), tan bark
    let warmth = (c.r - c.b) + (c.r - c.g) * 0.5;
    let is_bark_hue = smoothstep(-0.04, 0.02, warmth);
    // Luminance range: exclude only very bright (sky) and pitch black
    // Bark in linear space is quite dark (sRGB 0.30 ≈ linear 0.07)
    let lum = luminance(c);
    let in_range = smoothstep(0.003, 0.01, lum) * smoothstep(0.70, 0.50, lum);
    return not_foliage * not_blue * is_bark_hue * in_range;
}

// Apply bark furrow texture to a single bark pixel.
// Binary split (like foliage): dark furrow vs bright ridge.
// No mid-zone — maximum contrast on narrow trunks.
fn apply_bark_breakup(c: vec3<f32>, block_pos: vec2<f32>) -> vec3<f32> {
    let bk = is_bark(c);
    if bk < 0.01 { return c; }

    let n = bark_breakup(block_pos);
    let lum = luminance(c);

    var adjusted: vec3<f32>;
    if n < 0.48 {
        // Dark furrow: deep crack in bark
        // Aggressive darken — bark is very dark in linear space
        let dark_str = 0.35 + lum * 0.20;
        adjusted = c * dark_str;
    } else {
        // Raised ridge: catches light
        // Strong brighten to create visible contrast
        let bright_str = 1.50 + (1.0 - lum) * 0.40;
        adjusted = c * bright_str;
    }

    return mix(c, adjusted, bk);
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
    var color  = vec4(toon_quantize(color_raw.rgb,  settings.toon_bands), color_raw.a);
    var color_left   = vec4(toon_quantize(left_raw.rgb,   settings.toon_bands), left_raw.a);
    var color_right  = vec4(toon_quantize(right_raw.rgb,  settings.toon_bands), right_raw.a);
    var color_top    = vec4(toon_quantize(top_raw.rgb,    settings.toon_bands), top_raw.a);
    var color_bottom = vec4(toon_quantize(bottom_raw.rgb, settings.toon_bands), bottom_raw.a);

    // ── FOLIAGE LEAF BREAKUP (disabled) ─────────────────────────────────────
    // is_foliage() threshold is too low — matches grass tiles AND tree canopy,
    // causing the leaf noise pattern to bleed across grass/tree boundaries.
    // Disabled until detection can distinguish canopy from ground cover.
    // color        = vec4(toon_quantize(apply_leaf_breakup(color.rgb,        block),                        settings.toon_bands), color.a);
    // color_left   = vec4(toon_quantize(apply_leaf_breakup(color_left.rgb,   block + vec2(-1.0,  0.0)),     settings.toon_bands), color_left.a);
    // color_right  = vec4(toon_quantize(apply_leaf_breakup(color_right.rgb,  block + vec2( 1.0,  0.0)),     settings.toon_bands), color_right.a);
    // color_top    = vec4(toon_quantize(apply_leaf_breakup(color_top.rgb,    block + vec2( 0.0, -1.0)),     settings.toon_bands), color_top.a);
    // color_bottom = vec4(toon_quantize(apply_leaf_breakup(color_bottom.rgb, block + vec2( 0.0,  1.0)),     settings.toon_bands), color_bottom.a);

    // ── BARK FURROW BREAKUP (disabled) ──────────────────────────────────────
    // Bark detection false-positives on terrain tiles (both are warm/brown),
    // creating a cross-hatch pattern across the entire ground. Disabled until
    // detection can reliably distinguish tree trunks from terrain.
    // color        = vec4(apply_bark_breakup(color.rgb,        block),                    color.a);
    // color_left   = vec4(apply_bark_breakup(color_left.rgb,   block + vec2(-1.0,  0.0)), color_left.a);
    // color_right  = vec4(apply_bark_breakup(color_right.rgb,  block + vec2( 1.0,  0.0)), color_right.a);
    // color_top    = vec4(apply_bark_breakup(color_top.rgb,    block + vec2( 0.0, -1.0)), color_top.a);
    // color_bottom = vec4(apply_bark_breakup(color_bottom.rgb, block + vec2( 0.0,  1.0)), color_bottom.a);

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

    // Brighten while preserving hue (no mix toward white which causes grey washout)
    let highlight_color = result * (1.0 + settings.highlight_brightness);
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

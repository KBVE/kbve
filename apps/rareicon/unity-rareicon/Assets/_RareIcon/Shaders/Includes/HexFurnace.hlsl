#ifndef RAREICON_HEX_FURNACE_INCLUDED
#define RAREICON_HEX_FURNACE_INCLUDED

// Furnace — single-hex industrial building. Masonry block with a tapered
// stacked-stone chimney (flared base + shaft + flared cap), dark mouth on
// the front face with an ember halo, and a two-pixel ember core that
// flickers on a ~1.5 Hz integer-stepped timer. Stone blocks carry per-pixel
// tone variation via hash21 so the body doesn't read as one flat swatch.
//
// Pixel convention (48-grid quad, single hex centred at (24, 24)):
//   foundation: 9×2 darker course at y=-5/-4
//   body:       9×7 masonry block at y=[-3, +3] with grid seams
//   chimney:    5-wide base (y=+4) → 3-wide shaft (y=+5..+6) → 5-wide cap (y=+7)
//   mouth:      3×3 dark opening at x=[-1, +1], y=[-2, 0]
//   smoke:      3 drifting pixels above the chimney
//
// Every shape gates through InsideHexMask so stray trim never punches past
// the tile outline.
//
// Uniforms: _FurnaceStone, _FurnaceFoundation, _FurnaceChimney,
//           _FurnaceMouth, _FurnaceEmber, _FurnaceSmoke
// Globals : _Time (Unity built-in; x/20, y=sec, z=sec*2, w=sec*3)
// Helpers : rectMask, hash21 (HexShared.hlsl),
//           InsideHexMask (HexBuildingShared.hlsl)
void DrawFurnace(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    // ===== Foundation course =====
    // Face-shadow (near-black) beneath the plinth, then a lighter foundation
    // row — classic iso-depth stack that raises the body off the tile.
    float faceRow = rectMask(px, c + float2(-4, -5), float2(9, 1)) * inside;
    if (faceRow > 0.5) { color = _FurnaceMouth.rgb; alpha = 1.0; }
    float footing = rectMask(px, c + float2(-4, -4), float2(9, 1)) * inside;
    if (footing > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    // ===== Stone block body with tone variation =====
    // Per-pixel hash21 → ±5% multiplier on the base stone colour. Gives the
    // 9×7 block a stack-of-distinct-bricks read instead of a flat slab.
    // Variance range is small enough that the base palette still governs
    // the silhouette; wider would push the block toward noise.
    float body = rectMask(px, c + float2(-4, -3), float2(9, 7)) * inside;
    if (body > 0.5)
    {
        float variance = (hash21(px) - 0.5) * 0.10;
        color = saturate(_FurnaceStone.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    // ===== Masonry seams =====
    // Two horizontal seam rows at y=-1 and y=+2 break the block into three
    // visual courses. Staggered vertical seams (offset per course) give the
    // brickwork a proper alternating layout.
    float seamH1 = rectMask(px, c + float2(-4, -1), float2(9, 1));
    float seamH2 = rectMask(px, c + float2(-4,  2), float2(9, 1));
    float seamV1a = rectMask(px, c + float2(-2, -3), float2(1, 2));
    float seamV1b = rectMask(px, c + float2( 1, -3), float2(1, 2));
    float seamV2a = rectMask(px, c + float2(-1,  0), float2(1, 2));
    float seamV2b = rectMask(px, c + float2( 2,  0), float2(1, 2));
    float seams = max(max(seamH1, seamH2),
                      max(max(seamV1a, seamV1b), max(seamV2a, seamV2b))) * inside;
    if (seams > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    // ===== Right-side shadow column =====
    // Iso shade on the body's east edge.
    float bodyShade = rectMask(px, c + float2(4, -3), float2(1, 7)) * inside;
    if (bodyShade > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    // ===== Ash streaks =====
    // Soot stains bleeding down the body below the chimney flanks. Gated to
    // the top row of the body so they don't overdarken the whole face.
    float ashL = rectMask(px, c + float2(-1, 0), float2(1, 3));
    float ashR = rectMask(px, c + float2( 1, 0), float2(1, 3));
    float streakBand = rectMask(px, c + float2(-4, 3), float2(9, 1));
    float streaks = max(ashL, ashR) * streakBand * inside;
    if (streaks > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    // ===== Chimney — tapered masonry =====
    // Wide 5-pixel base course (y=+4) flares out from the body top, narrows
    // to a 3-pixel shaft (y=+5..+6), then flares again at the 5-wide cap
    // (y=+7). Reads as a proper brick chimney with plinth + stack + capstone
    // rather than a floating rectangle. Same hash21 variance as the body
    // but offset so chimney and body don't share a pattern.
    float stackBase = rectMask(px, c + float2(-2, 4), float2(5, 1)) * inside;
    float stackMid  = rectMask(px, c + float2(-1, 5), float2(3, 2)) * inside;
    float stackAll  = max(stackBase, stackMid);
    if (stackAll > 0.5)
    {
        float variance = (hash21(px + float2(13, 7)) - 0.5) * 0.08;
        color = saturate(_FurnaceChimney.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    // Capstone — 5-wide flared rim at y=+7 in foundation (darkest) tone so
    // the chimney top reads as weathered stone overhang.
    float cap = rectMask(px, c + float2(-2, 7), float2(5, 1)) * inside;
    if (cap > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    // ===== Mouth =====
    // 3×3 dark opening on the front face — firing chamber.
    float mouth = rectMask(px, c + float2(-1, -2), float2(3, 3)) * inside;
    if (mouth > 0.5) { color = _FurnaceMouth.rgb; alpha = 1.0; }

    // ===== Mouth halo =====
    // Ember-tinted ring around the mouth (top + sides, not bottom — the
    // coal pile sits there). Lerped with stone at 55% so it reads as
    // warmth leaking out, not a painted border.
    float haloTop   = rectMask(px, c + float2(-1,  1), float2(3, 1));
    float haloSideL = rectMask(px, c + float2(-2, -2), float2(1, 3));
    float haloSideR = rectMask(px, c + float2( 2, -2), float2(1, 3));
    float halo = max(haloTop, max(haloSideL, haloSideR)) * inside;
    if (halo > 0.5) { color = lerp(_FurnaceStone.rgb, _FurnaceEmber.rgb, 0.55); alpha = 1.0; }

    // ===== Ember flicker — 2-pixel pair, integer-stepped =====
    // floor(_Time.y * 1.5) ticks ~1.5 Hz; mod-2 gives a 0/1 phase that
    // swaps which ember is "hot". Integer stepping keeps the tone change
    // snapped to whole frames so the pixel art doesn't shimmer with
    // fractional values between phases.
    float tick      = floor(_Time.y * 1.5);
    float phaseMod2 = tick - floor(tick * 0.5) * 2.0;
    float coreHot   = lerp(1.00, 0.55, phaseMod2);
    float edgeHot   = lerp(0.55, 1.00, phaseMod2);

    float emberCore = rectMask(px, c + float2( 0, -1), float2(1, 1)) * inside;
    if (emberCore > 0.5)
    {
        color = lerp(_FurnaceMouth.rgb, _FurnaceEmber.rgb, coreHot);
        alpha = 1.0;
    }
    float emberEdge = rectMask(px, c + float2(-1, -1), float2(1, 1)) * inside;
    if (emberEdge > 0.5)
    {
        color = lerp(_FurnaceMouth.rgb, _FurnaceEmber.rgb, edgeHot);
        alpha = 1.0;
    }

    // ===== Coal pile =====
    // Two dark-warm pixels on the foundation row — fuel at the threshold.
    // Uses chimney tint × 0.65 so they read as coal / charcoal, not soot.
    float coalL = rectMask(px, c + float2(-1, -4), float2(1, 1));
    float coalR = rectMask(px, c + float2( 1, -4), float2(1, 1));
    float coal = max(coalL, coalR) * inside;
    if (coal > 0.5) { color = _FurnaceChimney.rgb * 0.65; alpha = 1.0; }

    // ===== Smoke wisps =====
    // 3 sparse pixels drifting above the capstone, staggered so the column
    // reads as wind-bent smoke rather than a solid bar.
    float smoke1 = rectMask(px, c + float2( 0,  8), float2(1, 1)) * inside;
    float smoke2 = rectMask(px, c + float2(-1,  9), float2(1, 1)) * inside;
    float smoke3 = rectMask(px, c + float2( 1, 10), float2(1, 1)) * inside;
    float smoke = max(smoke1, max(smoke2, smoke3));
    if (smoke > 0.5) { color = _FurnaceSmoke.rgb; alpha = 1.0; }
}

#endif // RAREICON_HEX_FURNACE_INCLUDED

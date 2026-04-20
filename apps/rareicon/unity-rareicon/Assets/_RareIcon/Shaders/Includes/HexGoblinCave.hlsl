#ifndef RAREICON_HEX_GOBLIN_CAVE_INCLUDED
#define RAREICON_HEX_GOBLIN_CAVE_INCLUDED

// Goblin Cave — a rough stone mound carved into the hex with a dark arched
// mouth, ember-glow halo leaking heat around the opening, a two-pixel
// interior fire that flickers on the same ~1.5 Hz timer as the Furnace,
// steady "wall brazier" torches flanking the mouth, scattered bones at
// the threshold, and moss creeping up the upper-left slope. Per-pixel
// hash21 variance on the stone keeps the mound from reading as flat
// rubble; explicit right-edge shading per row gives it iso depth.
//
// Pixel convention — 48-grid quad, single hex centred at (24, 24).
// Every shape gates through InsideHexMask so the mound stays inside the
// tile outline. Vertical span used: y ∈ [-7, +5] (13 rows).
//
// Uniforms: _CaveStone, _CaveStoneShade, _CaveMoss, _CaveMouth,
//           _CaveTorch, _CaveBone
// Globals : _Time (Unity built-in; y = seconds since startup)
// Helpers : rectMask, hash21 (HexShared.hlsl),
//           InsideHexMask (HexBuildingShared.hlsl)
void DrawGoblinCave(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    // ===== Stepped stone mound =====
    // Widths 17 / 15 / 13 / 11 / 9 / 7 / 5 / 3 from base to peak. The
    // mound mask is unioned once, so per-pixel hash21 variance paints in
    // a single pass rather than re-tinting seven times.
    float r0 = rectMask(px, c + float2(-8, -7), float2(17, 1));
    float r1 = rectMask(px, c + float2(-7, -6), float2(15, 1));
    float r2 = rectMask(px, c + float2(-6, -5), float2(13, 1));
    float r3 = rectMask(px, c + float2(-5, -4), float2(11, 4));
    float r4 = rectMask(px, c + float2(-4,  0), float2( 9, 2));
    float r5 = rectMask(px, c + float2(-3,  2), float2( 7, 2));
    float r6 = rectMask(px, c + float2(-2,  4), float2( 5, 1));
    float r7 = rectMask(px, c + float2(-1,  5), float2( 3, 1));
    float moundBody = max(max(max(r0, r1), max(r2, r3)),
                          max(max(r4, r5), max(r6, r7))) * inside;
    if (moundBody > 0.5)
    {
        // ±6% multiplier on the base stone colour. Cave stone is rougher
        // than furnace masonry, so the variance is slightly wider (0.12
        // vs 0.10) — reads as broken/natural rock rather than cut brick.
        float variance = (hash21(px + float2(41, 19)) - 0.5) * 0.12;
        color = saturate(_CaveStone.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    // ===== Iso depth shading — right edge of every row =====
    // Darkens the right 1–2 pixels of each mound row with _CaveStoneShade.
    // At pixel-art scale one per-row mask reads as a convincing 3D dome
    // without needing any SDF distance trick. Peak row (r7) is only 3 px
    // wide so it skips the shade pass; a single shaded pixel there would
    // dominate the silhouette.
    float sh0 = rectMask(px, c + float2( 7, -7), float2(2, 1));
    float sh1 = rectMask(px, c + float2( 6, -6), float2(2, 1));
    float sh2 = rectMask(px, c + float2( 5, -5), float2(2, 1));
    float sh3 = rectMask(px, c + float2( 4, -4), float2(2, 4));
    float sh4 = rectMask(px, c + float2( 3,  0), float2(2, 2));
    float sh5 = rectMask(px, c + float2( 3,  2), float2(1, 2));
    float sh6 = rectMask(px, c + float2( 2,  4), float2(1, 1));
    float shade = max(max(max(sh0, sh1), max(sh2, sh3)),
                      max(max(sh4, sh5), sh6)) * inside;
    if (shade > 0.5) { color = _CaveStoneShade.rgb; alpha = 1.0; }

    // ===== Moss cluster — upper-left slope =====
    // Six moss pixels creeping up the lit (left) side of the mound. Moss
    // grows on the cooler face in nature; putting it on the un-shaded
    // side (opposite the depth-shadow) doubles as a visual cue that the
    // mound is lit from the left. All positions land inside a mound row
    // so none float above the silhouette.
    float mA = rectMask(px, c + float2(-1,  5), float2(1, 1));
    float mB = rectMask(px, c + float2(-2,  4), float2(1, 1));
    float mC = rectMask(px, c + float2(-3,  3), float2(1, 1));
    float mD = rectMask(px, c + float2(-1,  3), float2(1, 1));
    float mE = rectMask(px, c + float2(-2,  2), float2(1, 1));
    float mF = rectMask(px, c + float2(-4,  1), float2(1, 1));
    float moss = max(max(max(mA, mB), max(mC, mD)), max(mE, mF)) * inside;
    if (moss > 0.5) { color = _CaveMoss.rgb; alpha = 1.0; }

    // ===== Arched mouth =====
    // 3×3 rectangle + 1-pixel apex = small Romanesque arch. Painted in
    // near-black so it reads as depth, not a door.
    float mouthRect = rectMask(px, c + float2(-1, -6), float2(3, 3));
    float mouthApex = rectMask(px, c + float2( 0, -3), float2(1, 1));
    float mouth     = max(mouthRect, mouthApex) * inside;
    if (mouth > 0.5) { color = _CaveMouth.rgb; alpha = 1.0; }

    // ===== Mouth halo =====
    // Ember-tint ring hugging the mouth's top + flanks. Blended with
    // stone at 35% — dimmer than the Furnace halo on purpose, since the
    // cave is a residence rather than an active kiln; the glow is hearth
    // warmth, not forge heat.
    float haloTop   = rectMask(px, c + float2(-1, -2), float2(3, 1));
    float haloSideL = rectMask(px, c + float2(-2, -6), float2(1, 3));
    float haloSideR = rectMask(px, c + float2( 2, -6), float2(1, 3));
    float halo = max(haloTop, max(haloSideL, haloSideR)) * inside;
    if (halo > 0.5) { color = lerp(_CaveStone.rgb, _CaveTorch.rgb, 0.35); alpha = 1.0; }

    // ===== Interior fire — flickering pair at the mouth floor =====
    // Two ember pixels inside the mouth at y=-6 that swap brightness on
    // a ~1.5 Hz integer-stepped timer. Pixel-snapped so the tone change
    // lands on whole frames, never blending between values — matches the
    // Furnace flicker so the world feels like it runs on one clock.
    float tick      = floor(_Time.y * 1.5);
    float phaseMod2 = tick - floor(tick * 0.5) * 2.0;
    float fireAHot  = lerp(1.00, 0.50, phaseMod2);
    float fireBHot  = lerp(0.50, 1.00, phaseMod2);

    float fireA = rectMask(px, c + float2( 0, -6), float2(1, 1)) * inside;
    if (fireA > 0.5)
    {
        color = lerp(_CaveMouth.rgb, _CaveTorch.rgb, fireAHot);
        alpha = 1.0;
    }
    float fireB = rectMask(px, c + float2(-1, -6), float2(1, 1)) * inside;
    if (fireB > 0.5)
    {
        color = lerp(_CaveMouth.rgb, _CaveTorch.rgb, fireBHot);
        alpha = 1.0;
    }

    // ===== Flanking wall torches =====
    // Two steady torch pixels on the mound face, left + right of the
    // mouth. Intentionally static — if everything flickered the tile
    // would feel nervous. Steady torches anchor the silhouette.
    float torchL = rectMask(px, c + float2(-3, -4), float2(1, 1)) * inside;
    float torchR = rectMask(px, c + float2( 2, -4), float2(1, 1)) * inside;
    float torches = max(torchL, torchR);
    if (torches > 0.5) { color = _CaveTorch.rgb; alpha = 1.0; }

    // ===== Bones on the threshold =====
    // Two 1-pixel bone chips on the mound's widest foundation row — the
    // cave's "whose home is this" cue, placed outside the depth-shadow
    // zone so they catch the eye from either direction.
    float bone1 = rectMask(px, c + float2(-5, -7), float2(1, 1)) * inside;
    float bone2 = rectMask(px, c + float2( 4, -7), float2(1, 1)) * inside;
    float bones = max(bone1, bone2);
    if (bones > 0.5) { color = _CaveBone.rgb; alpha = 1.0; }
}

#endif // RAREICON_HEX_GOBLIN_CAVE_INCLUDED

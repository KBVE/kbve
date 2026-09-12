#ifndef RAREICON_HEX_CACTUS_INCLUDED
#define RAREICON_HEX_CACTUS_INCLUDED

// Procedural pixel cactus for the sand biome. Two variants sharing one
// silhouette builder so both stay on the same pixel grid as the other
// floor decorations (stone, berries, mushrooms, herbs).
//
//   isDragonfruit == 0 → Prickly Pear
//     Low paddle-stack: a thick ovoid pad at the base, 1–2 smaller
//     side pads branching left/right, and up to 3 pear dots clustered
//     on the upper pads.
//   isDragonfruit == 1 → Dragonfruit Cactus
//     Tall columnar spine: a ribbed vertical trunk 5–7 px tall, a
//     couple of bent arm offshoots, and up to 2 magenta fruit bulbs
//     with tiny green bracts on the upper half.
//
// Per-hex variation comes from hash21(seed, *) picking position,
// branch count, arm angle, and a subtle hue/brightness drift.
//
// Uniforms: _CactusBody, _CactusBodyShade, _CactusSpine,
//           _CactusFlower, _DragonfruitFlesh
// Helpers: rectMask, circleMask, hash21 (from HexShared.hlsl).
//
// `amount` is the per-instance _CactusAmount (HexResources.Cactus /
// 100): the main silhouette always renders when called, side pads /
// arms appear only when amount > 0.5, and visible fruit count is
// capped to ceil(amount * fullCount) so a heavily-foraged plant reads
// as a sparse trunk while a fresh one shows the full cluster.
float3 ApplyCactus(float3 ground, float2 px, float grid, float seed, float isDragonfruit, float amount)
{
    bool showSidePads = amount > 0.5;
    float3 result = ground;

    // Pixel-space scale (1.0 at legacy 16-grid, 2.0 at 32-grid bump).
    // `ps` to avoid shadowing the loop index `int s` below.
    float ps = grid * 0.0625;

    // Per-plant hue / brightness drift so neighbours don't clone.
    float bright = 0.94 + hash21(float2(seed, 71.0)) * 0.14;
    float warm   = (hash21(float2(seed, 72.0)) - 0.5) * 0.06;

    float3 body      = _CactusBody.rgb;
    body.r = saturate(body.r + warm);
    body.b = saturate(body.b - warm);
    body   = saturate(body * bright);
    float3 bodyDark  = saturate(_CactusBodyShade.rgb * bright);
    float3 spine     = _CactusSpine.rgb;
    float3 flower    = _CactusFlower.rgb;
    float3 dragonCol = _DragonfruitFlesh.rgb;

    // ----- Prickly Pear ---------------------------------------------
    if (isDragonfruit < 0.5)
    {
        float2 c = float2(floor(grid * 0.5), floor(grid * 0.38)) + float2(
            floor((hash21(float2(seed, 12.0)) - 0.5) * grid * 0.30),
            floor((hash21(float2(seed, 13.0)) - 0.5) * grid * 0.18));

        // Base pad: ~3 wide × 4 tall rounded rectangle.
        float basePad = circleMask(px, c,                                    2.6 * ps);
        // Side pads (two optional, slightly higher, offset left/right).
        float pad2 = circleMask(px, c + float2(-2.5, 1.2) * ps,              1.8 * ps);
        float pad3 = circleMask(px, c + float2( 2.5, 1.4) * ps,              1.8 * ps);
        // Side / crown pads are gated on amount so a near-foraged
        // plant reads as just the base pad.
        float pad2Gate = showSidePads ? step(0.25, hash21(float2(seed, 14.0))) : 0.0;
        float pad3Gate = showSidePads ? step(0.35, hash21(float2(seed, 15.0))) : 0.0;
        // Crown pad (smaller, centred above base).
        float crown = circleMask(px, c + float2(0.0, 2.4) * ps,              1.5 * ps);
        float crownGate = showSidePads ? step(0.20, hash21(float2(seed, 16.0))) : 0.0;

        float silhouette = max(basePad,
                             max(pad2 * pad2Gate,
                               max(pad3 * pad3Gate, crown * crownGate)));

        // Shaded rim on the lower row of each pad — gives the ovoid shape
        // a hint of 3D lighting without a full gradient.
        float rim = silhouette * step(px.y, c.y - 1.0 * ps);
        result = lerp(result, body,     silhouette);
        result = lerp(result, bodyDark, rim);

        // Spines / needles — sparse single bright pixels on the body.
        [unroll]
        for (int s = 0; s < 5; s++)
        {
            float ss = seed + (float)s * 5.0;
            if (hash21(float2(ss, 17.0)) < 0.55) continue;
            float2 sp = c + float2(
                floor((hash21(float2(ss, 18.0)) - 0.5) * 6.0 * ps),
                floor((hash21(float2(ss, 19.0)) - 0.5) * 5.0 * ps));
            float onBody = step(length(sp - c), 3.0 * ps);
            float spinePx = step(length(px - sp), 0.6 * ps) * onBody;
            result = lerp(result, spine, spinePx * silhouette);
        }

        // Pear fruits — 0–3 bright magenta dots on the upper pads.
        // Capped by amount so a near-foraged plant has fewer pears.
        int pearCap = clamp((int)ceil(amount * 3.0), 0, 3);
        [unroll]
        for (int f = 0; f < 3; f++)
        {
            if (f >= pearCap) break;
            float fs = seed + (float)f * 7.0;
            if (hash21(float2(fs, 21.0)) < 0.45) continue;
            float2 fp = c + float2(
                floor((hash21(float2(fs, 22.0)) - 0.5) * 5.0 * ps),
                floor(hash21(float2(fs, 23.0)) * 2.0 * ps + 1.5 * ps));
            float onBody = step(length(fp - c), 3.2 * ps);
            float fruit  = step(length(px - fp), 0.8 * ps) * onBody;
            result = lerp(result, flower, fruit);
        }
    }
    // ----- Dragonfruit Cactus ---------------------------------------
    else
    {
        float2 c = float2(floor(grid * 0.5), floor(grid * 0.32)) + float2(
            floor((hash21(float2(seed, 31.0)) - 0.5) * grid * 0.22),
            0.0);

        // Trunk: 2 wide × ~6 tall column with rounded top.
        float trunkH = (5.0 + floor(hash21(float2(seed, 32.0)) * 3.0)) * ps; // 5–7 at legacy
        float trunk  = rectMask(px, c + float2(-1 * ps, 0), float2(2 * ps, trunkH));
        float trunkTop = circleMask(px, c + float2(0.0, trunkH - 0.5 * ps), 1.3 * ps);

        // Optional bent arm — low-gated so ~40% of plants have one.
        // Suppressed entirely on heavily-foraged plants so the column
        // looks weathered rather than ornamental.
        float armGate  = showSidePads ? step(0.60, hash21(float2(seed, 33.0))) : 0.0;
        float armSide  = step(0.50, hash21(float2(seed, 34.0))); // 0 left, 1 right
        float armDx    = lerp(-2.0 * ps, 2.0 * ps, armSide);
        float2 armBase = c + float2(armDx, trunkH * 0.45);
        float arm      = rectMask(px, armBase + float2(-0.5 * ps, 0.0), float2(1 * ps, 2 * ps));
        float armTip   = circleMask(px, armBase + float2(armDx * 0.5, 2.0 * ps), 1.2 * ps);
        float armShape = max(arm, armTip) * armGate;

        float silhouette = max(trunk, max(trunkTop, armShape));

        // Central shade column on the right half of the trunk — cheap rib
        // effect since the trunk is only 2 px wide.
        float ribCol  = rectMask(px, c + float2(0, 0), float2(1 * ps, trunkH));
        result = lerp(result, body,     silhouette);
        result = lerp(result, bodyDark, ribCol * trunk);

        // Vertical spine dots down the trunk — every other row.
        [unroll]
        for (int s = 0; s < 4; s++)
        {
            float spy = c.y + 0.5 * ps + (float)s * 1.5 * ps;
            float2 sp = float2(c.x, floor(spy));
            float onTrunk = step(px.y, c.y + trunkH - 1.0 * ps) * step(c.y, px.y);
            float spinePx = step(length(px - sp), 0.55 * ps) * onTrunk;
            result = lerp(result, spine, spinePx * silhouette);
        }

        // Dragonfruit bulbs: 1–2 magenta ovals on the upper half, with
        // a green bract flick on top to hint at the real fruit. Bulb
        // count is capped by amount so a depleted dragonfruit cactus
        // shows just a trunk.
        int bulbCap = clamp((int)ceil(amount * 2.0), 0, 2);
        [unroll]
        for (int f = 0; f < 2; f++)
        {
            if (f >= bulbCap) break;
            float fs = seed + (float)f * 9.0;
            if (f > 0 && hash21(float2(fs, 41.0)) < 0.55) continue;
            float fy = c.y + trunkH * 0.6
                     + floor(hash21(float2(fs, 42.0)) * 2.0 * ps);
            float fx = c.x + (hash21(float2(fs, 43.0)) < 0.5 ? -1.5 * ps : 1.5 * ps);
            float2 fp = float2(floor(fx), floor(fy));
            float fruit = step(length(px - fp) * float2(1.1, 0.8).y, 1.1 * ps);
            float bract = step(length(px - (fp + float2(0, 1 * ps))), 0.7 * ps);
            result = lerp(result, dragonCol, fruit);
            result = lerp(result, body,      bract);
        }
    }

    return result;
}

#endif // RAREICON_HEX_CACTUS_INCLUDED

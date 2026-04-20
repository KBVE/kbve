#ifndef RAREICON_HEX_MUSHROOM_INCLUDED
#define RAREICON_HEX_MUSHROOM_INCLUDED

// 1-3 pixel mushrooms per tile, mirroring the three species used by the
// isometric meshes (apps/kbve/isometric/src-tauri/src/game/mushrooms.rs):
//
//   kind 0 — Porcini:     brown-shifted dome, short visible stem.
//   kind 1 — Chanterelle: gold-shifted wider cap, 1-row pedestal.
//   kind 2 — Fly Agaric:  primary _MushroomCap tint, tallest stem + spots.
//
// Sized as small floor clutter — stems stay 1 px wide, caps max out at
// 5 px across and 3 rows tall. Each cap uses 3-band dome shading (gill
// rim on the bottom row, base cap in the middle, highlight on top) and
// picks up per-mushroom brightness + warm/cool hue drift so neighbours
// don't read as clones. Soft 1-pixel ground shadow one row below the
// stem grounds the mushroom on the tile.
//
// Uniforms: _MushroomCap, _MushroomStem
// Helpers: rectMask, circleMask, hash21 (from HexShared.hlsl).
//
// `amount` is the per-instance _FloorAmounts.z (HexResources.Mushrooms /
// 100): cluster size is capped to ceil(amount * 3) so a near-foraged
// hex shows a single mushroom while a freshly-grown patch shows the
// full 1-3 cluster.
float3 ApplyMushrooms(float3 ground, float2 px, float grid, float seed, float amount)
{
    float3 result = ground;
    float3 spotCol = float3(0.96, 0.93, 0.85);
    int mushroomCap = clamp((int)ceil(amount * 3.0), 1, 3);

    // Pixel-space scale (1.0 at legacy 16-grid, 2.0 at 32-grid bump).
    // Named `ps` to avoid shadowing the inner loop's `int s`.
    float ps = grid * 0.0625;

    [unroll]
    for (int m = 0; m < 3; m++)
    {
        if (m >= mushroomCap) break;
        float ms = seed + (float)m * 9.0;
        if (m > 0 && hash21(float2(ms, 81.0)) < 0.35) continue;

        // Species roll — weights match the isometric generator
        // (45% porcini, 30% chanterelle, 25% fly agaric).
        float kh = hash21(float2(ms, 95.0));
        int kind = (kh < 0.45) ? 0 : ((kh < 0.75) ? 1 : 2);

        // Per-mushroom brightness + subtle warm/cool hue drift.
        float bright = 0.90 + hash21(float2(ms, 96.0)) * 0.22;
        float warmth = (hash21(float2(ms, 97.0)) - 0.5) * 0.08;

        // Kind-specific tint on top of the user-driven _MushroomCap.
        float3 capBase = _MushroomCap.rgb;
        if (kind == 0)      capBase *= float3(0.78, 0.72, 0.66); // porcini brown
        else if (kind == 1) capBase *= float3(1.08, 0.92, 0.70); // chanterelle gold
        capBase.r = saturate(capBase.r + warmth);
        capBase.b = saturate(capBase.b - warmth);
        capBase   = saturate(capBase * bright);

        float3 capGills = capBase * 0.55;
        float3 capHL    = saturate(capBase * 1.22 + 0.04);

        // Integer-aligned centre. Grid-relative, auto-tracks density.
        float2 c = float2(floor(grid * 0.5), floor(grid * 0.42)) + float2(
            floor((hash21(float2(ms, 82.0)) - 0.5) * grid * 0.40),
            floor((hash21(float2(ms, 83.0)) - 0.5) * grid * 0.25));

        // Stem height by kind — chanterelle squat, fly agaric tallest.
        float stemH = 3.0 * ps;
        if (kind == 1) stemH = 1.0 * ps;
        if (kind == 2) stemH = 4.0 * ps;
        float stemBottomY = c.y - stemH + 1.0 * ps;

        // Ground shadow — single pixel one row below stem bottom.
        float shadowMask = rectMask(px,
            float2(c.x, stemBottomY - 1.0 * ps), float2(1, 1) * ps);
        result = lerp(result, ground * 0.68, shadowMask * 0.55);

        // Stem — 1 pixel wide at legacy, scales with density.
        float stem = rectMask(px,
            float2(c.x, stemBottomY), float2(1.0 * ps, stemH));
        result = lerp(result, _MushroomStem.rgb, stem);

        // Cap — compact dome, chanterelle slightly wider.
        float capR = (1.5 + hash21(float2(ms, 84.0)) * 0.6) * ps;   // 1.5–2.1
        if (kind == 1) capR += 0.4 * ps;                             // 1.9–2.5
        float2 capCenter = c + float2(0, 0.5 * ps);
        float capDist = length(px - capCenter);
        float cap = step(capDist, capR) * step(c.y, px.y);
        result = lerp(result, capBase, cap);

        // Gill line on the bottom row of the dome.
        float gillMask = cap * step(px.y, c.y + 0.5 * ps);
        result = lerp(result, capGills, gillMask);

        // Top highlight (rows c.y + 2 and up).
        float topMask = cap * step(c.y + 2.0 * ps, px.y);
        result = lerp(result, capHL, topMask);

        // Spots — fly agaric only, 1-2 single-pixel dots on the upper cap.
        float spotGate = (kind == 2) ? 1.0 : 0.0;
        [unroll]
        for (int s = 0; s < 2; s++)
        {
            float ss = ms + (float)s * 3.0;
            if (s > 0 && hash21(float2(ss, 87.0)) < 0.55) continue;
            float2 spotPos = c + float2(
                floor(hash21(float2(ss, 89.0)) * 3.0 * ps) - 1.0 * ps,
                1.0 * ps + floor(hash21(float2(ss, 90.0)) * 2.0 * ps));
            float spot = step(length(px - spotPos), 0.75 * ps) * cap * spotGate;
            result = lerp(result, spotCol, spot);
        }
    }
    return result;
}

#endif // RAREICON_HEX_MUSHROOM_INCLUDED

#ifndef RAREICON_HEX_MUSHROOM_INCLUDED
#define RAREICON_HEX_MUSHROOM_INCLUDED

// 1-3 pixel mushrooms per tile, mirroring the three species used by the
// isometric meshes (apps/kbve/isometric/src-tauri/src/game/mushrooms.rs):
//
//   kind 0 — Porcini:     brown-shifted dome, tall 3-row stem, no spots.
//   kind 1 — Chanterelle: gold-shifted wide cap, 1-row pedestal stem.
//   kind 2 — Fly Agaric:  primary _MushroomCap tint, tall stem, 1-3 spots.
//
// Every mushroom uses the same 3-band dome shading (gill rim on the
// bottom row, base cap in the middle, highlight on top) and picks up
// per-mushroom brightness + warmth jitter so neighbours don't read as
// clones. A soft ground shadow one row below the stem grounds the
// mushroom on the tile.
//
// Uniforms: _MushroomCap, _MushroomStem
// Helpers: rectMask, circleMask, hash21 (from HexShared.hlsl).
float3 ApplyMushrooms(float3 ground, float2 px, float grid, float seed)
{
    float3 result = ground;
    float3 spotCol = float3(0.96, 0.93, 0.85);

    [unroll]
    for (int m = 0; m < 3; m++)
    {
        float ms = seed + (float)m * 9.0;
        if (m > 0 && hash21(float2(ms, 81.0)) < 0.35) continue;

        // Species roll — weights roughly match the isometric generator
        // (45% porcini, 30% chanterelle, 25% fly agaric).
        float kh = hash21(float2(ms, 95.0));
        int kind = (kh < 0.45) ? 0 : ((kh < 0.75) ? 1 : 2);

        // Per-mushroom brightness + subtle warm/cool hue drift.
        float bright  = 0.90 + hash21(float2(ms, 96.0)) * 0.22;
        float warmth  = (hash21(float2(ms, 97.0)) - 0.5) * 0.08;

        // Kind-specific tint on top of the user-driven _MushroomCap.
        float3 capBase = _MushroomCap.rgb;
        if (kind == 0)      capBase *= float3(0.78, 0.72, 0.66); // porcini: brown down
        else if (kind == 1) capBase *= float3(1.08, 0.92, 0.70); // chanterelle: gold shift
        capBase.r = saturate(capBase.r + warmth);
        capBase.b = saturate(capBase.b - warmth);
        capBase   = saturate(capBase * bright);

        float3 capGills = capBase * 0.55;
        float3 capHL    = saturate(capBase * 1.22 + 0.04);

        // Integer-aligned centre so 2×N stem + dome line up cleanly.
        float2 c = float2(floor(grid * 0.5), floor(grid * 0.42)) + float2(
            floor((hash21(float2(ms, 82.0)) - 0.5) * grid * 0.40),
            floor((hash21(float2(ms, 83.0)) - 0.5) * grid * 0.25));

        // Stem height: 1 row for chanterelle pedestal, 3 rows otherwise.
        float stemH = (kind == 1) ? 1.0 : 3.0;
        float stemBottomY = c.y - stemH + 1.0;

        // Ground shadow one row below the stem bottom.
        float shadowMask = rectMask(px,
            float2(c.x - 1.0, stemBottomY - 1.0), float2(2, 1));
        result = lerp(result, ground * 0.68, shadowMask * 0.55);

        // Stem — 2 wide, shaded right column.
        float stem      = rectMask(px,
            float2(c.x - 1.0, stemBottomY), float2(2, stemH));
        float stemRight = rectMask(px,
            float2(c.x,       stemBottomY), float2(1, stemH));
        result = lerp(result, _MushroomStem.rgb,        stem);
        result = lerp(result, _MushroomStem.rgb * 0.78, stemRight);

        // Cap — circle masked to the upper half, with chanterelle wider.
        float capR = 2.3 + hash21(float2(ms, 84.0)) * 0.8;   // 2.3–3.1
        if (kind == 1) capR += 0.6;                           // 2.9–3.7
        float2 capCenter = c + float2(0, 1);
        float capDist = length(px - capCenter);
        float cap = step(capDist, capR) * step(c.y, px.y);
        result = lerp(result, capBase, cap);

        // Gill line on the bottom row of the dome.
        float gillMask = cap * step(px.y, c.y + 0.5);
        result = lerp(result, capGills, gillMask);

        // Top highlight (rows c.y+2 and up).
        float topMask = cap * step(c.y + 2.0, px.y);
        result = lerp(result, capHL, topMask);

        // Spots only for fly agaric — scatter 1-3 across the upper cap.
        float spotGate = (kind == 2) ? 1.0 : 0.0;
        [unroll]
        for (int s = 0; s < 3; s++)
        {
            float ss = ms + (float)s * 3.0;
            if (s > 0 && hash21(float2(ss, 87.0)) < 0.50) continue;
            float2 spotPos = capCenter + float2(
                floor((hash21(float2(ss, 89.0)) - 0.5) * (capR * 1.2)),
                floor(hash21(float2(ss, 90.0)) * 2.5));
            float spot = step(length(px - spotPos), 0.75) * cap * spotGate;
            result = lerp(result, spotCol, spot);
        }
    }
    return result;
}

#endif // RAREICON_HEX_MUSHROOM_INCLUDED

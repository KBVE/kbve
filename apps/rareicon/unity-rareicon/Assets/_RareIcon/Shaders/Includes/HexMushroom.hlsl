#ifndef RAREICON_HEX_MUSHROOM_INCLUDED
#define RAREICON_HEX_MUSHROOM_INCLUDED

// 1-3 Amanita-style mushrooms: 1×2 pale stem + small rounded dome cap with
// a darker bottom rim and a single white polka-dot pixel for instant read.
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

        float2 mc = float2(grid * 0.55, grid * 0.45) + float2(
            floor((hash21(float2(ms, 82.0)) - 0.5) * (grid * 0.45)),
            floor((hash21(float2(ms, 83.0)) - 0.5) * (grid * 0.30)));

        float stem = rectMask(px, mc + float2(0, -1), float2(1, 2));
        result = lerp(result, _MushroomStem.rgb, stem);

        float capR = 1.4 + hash21(float2(ms, 84.0)) * 0.4;   // 1.4–1.8
        float2 capCenter = mc + float2(0, 0.5);
        float capDist = length(px - capCenter);
        float cap = step(capDist, capR) * step(mc.y - 0.5, px.y);
        float capRim = cap * step(px.y, mc.y);

        result = lerp(result, _MushroomCap.rgb,        cap);
        result = lerp(result, _MushroomCap.rgb * 0.72, capRim);

        float2 spotPos = mc + float2(
            floor((hash21(float2(ms, 86.0)) - 0.5) * 2.0),
            1.0);
        float spot = step(length(px - spotPos), 0.55) * cap;
        result = lerp(result, spotCol, spot);
    }
    return result;
}

#endif // RAREICON_HEX_MUSHROOM_INCLUDED

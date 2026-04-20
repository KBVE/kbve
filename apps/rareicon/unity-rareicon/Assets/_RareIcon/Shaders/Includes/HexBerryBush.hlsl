#ifndef RAREICON_HEX_BERRY_BUSH_INCLUDED
#define RAREICON_HEX_BERRY_BUSH_INCLUDED

// Chunky 3-lobe bush with a darker bottom rim, plus 3-5 berries clustered
// on the upper canopy. Each berry is a single bright pixel + a darker
// shadow pixel below it, both pinned to the bush mask so they never float.
//
// Uniforms: _BerryBushColor, _BerryColor
// Helpers: circleMask, hash21 (from HexShared.hlsl).
//
// `amount` is the per-instance _FloorAmounts.y (HexResources.Berries /
// 100): the bush silhouette always draws when called, but the visible
// berry count is capped to ceil(amount * 5). A near-picked hex shows
// the bush with one stubborn berry, full hex shows up to 5.
float3 ApplyBerryBush(float3 ground, float2 px, float grid, float seed, float amount)
{
    int berryCap = clamp((int)ceil(amount * 5.0), 1, 5);
    float2 bc = float2(grid * 0.45, grid * 0.40) + float2(
        floor((hash21(float2(seed, 61.0)) - 0.5) * 4.0),
        floor((hash21(float2(seed, 62.0)) - 0.5) * 2.0));

    float lobeL = circleMask(px, bc,                       2.4);
    float lobeR = circleMask(px, bc + float2( 2.5, 0.0),   2.0);
    float crown = circleMask(px, bc + float2( 1.0, 1.6),   1.8);
    float bush  = max(lobeL, max(lobeR, crown));

    float3 result = lerp(ground, _BerryBushColor.rgb, bush);
    float bottomRim = bush * step(px.y, bc.y - 1.5);
    result = lerp(result, _BerryBushColor.rgb * 0.65, bottomRim);

    [unroll]
    for (int b = 0; b < 5; b++)
    {
        if (b >= berryCap) break;
        float bs = seed + (float)b * 3.0;
        if (hash21(float2(bs, 63.0)) < 0.40) continue;

        float2 bd = float2(
            floor((hash21(float2(bs, 64.0)) - 0.5) * 3.5),
            floor( hash21(float2(bs, 65.0)) * 2.0 + 1.0));
        float2 berryC = bc + float2(1.0, 1.0) + bd;

        float onBush = step(min(min(length(px - bc),
                                    length(px - (bc + float2(2.5, 0.0)))),
                                length(px - (bc + float2(1.0, 1.6)))), 2.5);

        float berryPx  = step(length(px - berryC), 0.7);
        float shadowPx = step(length(px - (berryC + float2(0, -1))), 0.7);
        result = lerp(result, _BerryColor.rgb,        berryPx  * onBush);
        result = lerp(result, _BerryColor.rgb * 0.55, shadowPx * onBush * (1.0 - berryPx));
    }
    return result;
}

#endif // RAREICON_HEX_BERRY_BUSH_INCLUDED

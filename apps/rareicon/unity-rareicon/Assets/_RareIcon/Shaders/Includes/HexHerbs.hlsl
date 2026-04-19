#ifndef RAREICON_HEX_HERBS_INCLUDED
#define RAREICON_HEX_HERBS_INCLUDED

// 3-5 small green herb tufts in a tight cluster.
//
// Uniforms: _HerbColor
// Helpers: hash21 (from HexShared.hlsl).
float3 ApplyHerbs(float3 ground, float2 px, float grid, float seed)
{
    float3 result = ground;

    [unroll]
    for (int h = 0; h < 5; h++)
    {
        float hs = seed + (float)h * 4.0;
        if (hash21(float2(hs, 51.0)) < 0.45) continue;

        float2 hc = float2(grid * 0.4, grid * 0.45) + float2(
            floor((hash21(float2(hs, 52.0)) - 0.5) * (grid * 0.55)),
            floor((hash21(float2(hs, 53.0)) - 0.5) * (grid * 0.35)));

        float tuft = step(length(px - hc), 0.9);
        result = lerp(result, _HerbColor.rgb, tuft);
    }
    return result;
}

#endif // RAREICON_HEX_HERBS_INCLUDED

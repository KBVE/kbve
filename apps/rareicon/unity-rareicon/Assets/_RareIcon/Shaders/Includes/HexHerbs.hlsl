#ifndef RAREICON_HEX_HERBS_INCLUDED
#define RAREICON_HEX_HERBS_INCLUDED

// 3-5 small green herb tufts in a tight cluster.
//
// Uniforms: _HerbColor
// Helpers: hash21 (from HexShared.hlsl).
//
// `amount` is the per-instance _FloorAmounts.w (HexResources.Herbs /
// 100): tuft count is capped to ceil(amount * 5) so a depleted patch
// reads as a single tuft instead of a full cluster.
float3 ApplyHerbs(float3 ground, float2 px, float grid, float seed, float amount)
{
    float3 result = ground;
    int tuftCap = clamp((int)ceil(amount * 5.0), 1, 5);

    // Pixel-space scale. 1.0 at legacy 16-grid, 2.0 at current 32-grid.
    // Raw pixel radii / offsets multiply by s so silhouettes stay the same
    // on-screen size when the grid density is bumped. Grid-relative coords
    // (e.g. `grid * 0.4`) already track automatically and stay untouched.
    float s = grid * 0.0625;

    [unroll]
    for (int h = 0; h < 5; h++)
    {
        if (h >= tuftCap) break;
        float hs = seed + (float)h * 4.0;
        if (hash21(float2(hs, 51.0)) < 0.45) continue;

        float2 hc = float2(grid * 0.4, grid * 0.45) + float2(
            floor((hash21(float2(hs, 52.0)) - 0.5) * (grid * 0.55)),
            floor((hash21(float2(hs, 53.0)) - 0.5) * (grid * 0.35)));

        float tuft = step(length(px - hc), 0.9 * s);
        result = lerp(result, _HerbColor.rgb, tuft);
    }
    return result;
}

#endif // RAREICON_HEX_HERBS_INCLUDED

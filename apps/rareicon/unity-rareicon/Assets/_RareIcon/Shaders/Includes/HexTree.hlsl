#ifndef RAREICON_HEX_TREE_INCLUDED
#define RAREICON_HEX_TREE_INCLUDED

// 1-3 procedural pixel trees per hex. Each tree has its own seed driving
// position offset, blob count, blob sizes, and a small palette shift.
// Trunks render three bark tones (lit left column, mid centre column,
// shaded right column) and flare into a 5-pixel root base. Canopy masks
// accumulate across all trees so trunks always sit beneath canopies
// regardless of paint order.
//
// Uniforms read from the parent shader's UnityPerMaterial CBUFFER:
//   _TrunkColor, _CanopyDark, _CanopyMid, _CanopyLight
// Helpers (rectMask, circleMask, hash21) come from HexShared.hlsl.
float3 ApplyPixelTree(float3 ground, float2 px, float grid, float seed)
{
    int treeCount = 1 + (int)(hash21(float2(seed, 100.0)) * 2.99);

    float trunkMask = 0.0;
    float trunkLightMask = 0.0;
    float trunkShadeMask = 0.0;
    float canopyMask = 0.0;
    float minDist = 1e6;

    [unroll]
    for (int t = 0; t < 3; t++)
    {
        if (t >= treeCount) break;
        float ts = seed * 17.0 + (float)t * 13.0;

        // Centre on an integer pixel so rect masks align cleanly.
        float2 c = float2(grid * 0.5, grid * 0.5) + float2(
            floor((hash21(float2(ts, 11.0)) - 0.5) * grid * 0.40),
            floor((hash21(float2(ts, 22.0)) - 0.5) * grid * 0.25));

        // 3-wide × 5-tall trunk core with a 5-pixel root flare at the base.
        float trunkCore = rectMask(px, c + float2(-1, -5), float2(3, 5));
        float trunkRoot = rectMask(px, c + float2(-2, -5), float2(5, 1));
        trunkMask = max(trunkMask, max(trunkCore, trunkRoot));
        // Left column catches the light, right column sits in shadow —
        // 4 rows tall so the root flare at the base stays mid-tone.
        trunkLightMask = max(trunkLightMask,
            rectMask(px, c + float2(-1, -4), float2(1, 4)));
        trunkShadeMask = max(trunkShadeMask,
            rectMask(px, c + float2( 1, -4), float2(1, 4)));

        // Canopy built from up to 6 overlapping blobs. First two are
        // guaranteed so every tree has a full silhouette; the remainder
        // fire ~70% of the time for irregular outlines.
        [unroll]
        for (int b = 0; b < 6; b++)
        {
            float bs = ts + (float)b * 7.0;
            bool present = b < 2 || hash21(float2(bs, 33.0)) > 0.30;
            if (!present) continue;

            // Push blobs upward (positive y) so the trunk peeks out at
            // the base instead of being swallowed by the foliage.
            float2 bo = float2(
                (hash21(float2(bs, 44.0)) - 0.5) * 6.0,
                hash21(float2(bs, 55.0)) * 3.5 + 1.0);
            float br = 2.8 + hash21(float2(bs, 66.0)) * 1.8;
            float2 bc = c + bo;
            canopyMask = max(canopyMask, circleMask(px, bc, br));
            minDist = min(minDist, length(px - bc));
        }
    }

    // Tighter light band + wider dark band to read against bigger blobs.
    float3 canopyCol = _CanopyMid.rgb;
    if (minDist <= 2.0)       canopyCol = _CanopyLight.rgb;
    else if (minDist >= 3.3)  canopyCol = _CanopyDark.rgb;
    canopyCol *= 1.0 + (hash21(float2(seed, 44.0)) - 0.5) * 0.18;

    float3 trunkMid   = _TrunkColor.rgb;
    float3 trunkLight = saturate(_TrunkColor.rgb * 1.35 + 0.04);
    float3 trunkDark  = _TrunkColor.rgb * 0.62;

    float3 result = lerp(ground, trunkMid,   trunkMask);
    result = lerp(result, trunkLight, trunkLightMask);
    result = lerp(result, trunkDark,  trunkShadeMask);
    result = lerp(result, canopyCol,  canopyMask);
    return result;
}

#endif // RAREICON_HEX_TREE_INCLUDED

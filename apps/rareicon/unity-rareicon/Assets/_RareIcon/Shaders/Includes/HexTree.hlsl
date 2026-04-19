#ifndef RAREICON_HEX_TREE_INCLUDED
#define RAREICON_HEX_TREE_INCLUDED

// 1-3 procedural pixel trees per hex. Each tree has its own seed driving
// position offset, blob count (3-5), blob sizes, and a small palette shift.
// Trunk + canopy masks accumulate across all trees so trunks always sit
// beneath canopies regardless of paint order.
//
// Uniforms read from the parent shader's UnityPerMaterial CBUFFER:
//   _TrunkColor, _CanopyDark, _CanopyMid, _CanopyLight
// Helpers (rectMask, circleMask, hash21) come from HexShared.hlsl.
float3 ApplyPixelTree(float3 ground, float2 px, float grid, float seed)
{
    int treeCount = 1 + (int)(hash21(float2(seed, 100.0)) * 2.99);

    float trunkMask = 0.0;
    float canopyMask = 0.0;
    float minDist = 1e6;

    [unroll]
    for (int t = 0; t < 3; t++)
    {
        if (t >= treeCount) break;
        float ts = seed * 17.0 + (float)t * 13.0;

        float2 c = float2(grid * 0.5, grid * 0.55) + float2(
            floor((hash21(float2(ts, 11.0)) - 0.5) * grid * 0.45),
            floor((hash21(float2(ts, 22.0)) - 0.5) * grid * 0.30));

        trunkMask = max(trunkMask,
            rectMask(px, c + float2(-1, -4), float2(2, 3)));

        [unroll]
        for (int b = 0; b < 5; b++)
        {
            float bs = ts + (float)b * 7.0;
            bool present = b == 0 || hash21(float2(bs, 33.0)) > 0.30;
            if (!present) continue;

            float2 bo = float2(
                (hash21(float2(bs, 44.0)) - 0.5) * 5.0,
                (hash21(float2(bs, 55.0)) - 0.5) * 4.0 + 1.0);
            float br = 2.0 + hash21(float2(bs, 66.0)) * 2.0;
            float2 bc = c + bo;
            canopyMask = max(canopyMask, circleMask(px, bc, br));
            minDist = min(minDist, length(px - bc));
        }
    }

    float3 canopyCol = _CanopyMid.rgb;
    if (minDist <= 1.5) canopyCol = _CanopyLight.rgb;
    else if (minDist >= 3.0) canopyCol = _CanopyDark.rgb;
    canopyCol *= 1.0 + (hash21(float2(seed, 44.0)) - 0.5) * 0.18;

    float3 result = lerp(ground, _TrunkColor.rgb, trunkMask);
    result = lerp(result, canopyCol, canopyMask);
    return result;
}

#endif // RAREICON_HEX_TREE_INCLUDED

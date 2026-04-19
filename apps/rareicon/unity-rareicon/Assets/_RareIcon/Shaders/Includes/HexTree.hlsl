#ifndef RAREICON_HEX_TREE_INCLUDED
#define RAREICON_HEX_TREE_INCLUDED

// 1-3 procedural pixel trees per hex. Each tree has its own seed driving
// position offset, blob count, blob sizes, and a per-tree palette tint.
//
// Trunks render three bark tones (lit left column, mid centre column,
// shaded right column). The base varies per tree: ~60% grow a 5-pixel
// root flare on the bottom row, and ~45% sprout buttress knuckles
// one pixel out from the second-from-bottom row. Combinations give
// heavy-root, thin-trunk, and asymmetric bases mixed across the forest.
//
// Canopies are a stack of up to 6 overlapping blobs (first two always
// present). Colouring mirrors the 3-zone scheme used by the isometric
// trees (apps/kbve/isometric/src-tauri/src/game/trees.rs push_dome):
// the top of each blob picks up the light tone, the middle stays mid,
// the underside falls to the dark tone, and blob 0 gets a single
// sun-cap highlight offset up-left so every tree has one readable
// sparkle instead of speckling every blob.
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
    float canopySunMask = 0.0;
    float minDist = 1e6;
    float2 nearestCenter = 0.0;
    float nearestRadius = 1.0;

    [unroll]
    for (int t = 0; t < 3; t++)
    {
        if (t >= treeCount) break;
        float ts = seed * 17.0 + (float)t * 13.0;

        // Integer pixel centre so rect masks align cleanly.
        float2 c = float2(grid * 0.5, grid * 0.5) + float2(
            floor((hash21(float2(ts, 11.0)) - 0.5) * grid * 0.40),
            floor((hash21(float2(ts, 22.0)) - 0.5) * grid * 0.25));

        // Trunk core: 3 wide × 5 tall column.
        float trunkCore = rectMask(px, c + float2(-1, -5), float2(3, 5));

        // Root flare: 60% of trees spread to 5 px on the bottom row.
        float flared = step(0.40, hash21(float2(ts, 77.0)));
        float rootOx = lerp(-1.0, -2.0, flared);
        float rootW  = lerp( 3.0,  5.0, flared);
        float trunkRoot = rectMask(px, c + float2(rootOx, -5),
                                   float2(rootW, 1));

        // Buttress knuckles one pixel out from the trunk on row c.y-4.
        // Gate with step() so the loop stays unroll-friendly.
        float buttressGate = step(0.55, hash21(float2(ts, 88.0)));
        float buttressL = rectMask(px, c + float2(-2, -4), float2(1, 1));
        float buttressR = rectMask(px, c + float2( 2, -4), float2(1, 1));
        float buttress = max(buttressL, buttressR) * buttressGate;

        trunkMask = max(trunkMask,
            max(trunkCore, max(trunkRoot, buttress)));
        trunkLightMask = max(trunkLightMask,
            rectMask(px, c + float2(-1, -4), float2(1, 4)));
        trunkShadeMask = max(trunkShadeMask,
            rectMask(px, c + float2( 1, -4), float2(1, 4)));

        // Canopy: up to 6 blobs, first two guaranteed.
        [unroll]
        for (int b = 0; b < 6; b++)
        {
            float bs = ts + (float)b * 7.0;
            bool present = b < 2 || hash21(float2(bs, 33.0)) > 0.30;
            if (!present) continue;

            float2 bo = float2(
                (hash21(float2(bs, 44.0)) - 0.5) * 7.0,
                hash21(float2(bs, 55.0)) * 3.8 + 0.8);
            float br = 2.5 + hash21(float2(bs, 66.0)) * 2.5;
            float2 bc = c + bo;
            canopyMask = max(canopyMask, circleMask(px, bc, br));

            float d = length(px - bc);
            if (d < minDist)
            {
                minDist = d;
                nearestCenter = bc;
                nearestRadius = br;
            }

            // Sun cap — first blob only, offset upper-left. Clamped to
            // canopyMask later so it never paints outside the silhouette.
            if (b == 0)
            {
                float sunR = max(br - 2.8, 1.0);
                canopySunMask = max(canopySunMask,
                    circleMask(px, bc + float2(-1.5, 1.5), sunR));
            }
        }
    }

    // Per-tree palette tint — slight brightness + hue push so neighbouring
    // trees in the same tile don't read as copies.
    float treeBright = 1.0 + (hash21(float2(seed, 44.0)) - 0.5) * 0.18;
    float treeHue    = (hash21(float2(seed, 45.0)) - 0.5) * 0.10;

    // 3-zone vertical banding relative to nearest blob centre.
    //   top ~ 35%  → light   (normY >  0.30)
    //   mid ~ 22%  → mid     (-0.15 ≤ normY ≤ 0.30)
    //   bot ~ 43%  → dark    (normY < -0.15)
    float normY = (px.y - nearestCenter.y) / max(nearestRadius, 1.0);
    float3 canopyCol = _CanopyMid.rgb;
    if (normY > 0.30)      canopyCol = _CanopyLight.rgb;
    else if (normY < -0.15) canopyCol = _CanopyDark.rgb;
    canopyCol.g += treeHue * 0.5;           // push green channel subtly
    canopyCol.r -= treeHue * 0.3;
    canopyCol *= treeBright;
    canopyCol = saturate(canopyCol);

    float3 trunkMid   = _TrunkColor.rgb;
    float3 trunkLight = saturate(_TrunkColor.rgb * 1.35 + 0.04);
    float3 trunkDark  = _TrunkColor.rgb * 0.62;
    float3 sunCol     = saturate(_CanopyLight.rgb * 1.18 + 0.04);

    float3 result = lerp(ground, trunkMid,   trunkMask);
    result = lerp(result, trunkLight, trunkLightMask);
    result = lerp(result, trunkDark,  trunkShadeMask);
    result = lerp(result, canopyCol,  canopyMask);
    result = lerp(result, sunCol,     canopySunMask * canopyMask);
    return result;
}

#endif // RAREICON_HEX_TREE_INCLUDED

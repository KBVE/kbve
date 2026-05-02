#ifndef RAREICON_HEX_SENTINEL_TOWER_INCLUDED
#define RAREICON_HEX_SENTINEL_TOWER_INCLUDED

// SentinelTower — Tower T2 default-pick. Reuses DrawTower as the base
// silhouette and adds a heavy double-banner crown plus a gold-tint
// pass over the parapet so the T2 silhouette reads as a fortified
// garrison rather than a basic spire.
void DrawSentinelTower(inout float3 color, inout float alpha, float2 px, float grid)
{
    DrawTower(color, alpha, px, grid);
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    // Twin banners flanking the central torches.
    DrawBannerOnPole(color, alpha, px,
                     c + float2(-4, 6), 3.0,
                     float2(-2, 0), float2(2, 2),
                     _TowerStoneShade.rgb, _OutpostBanner.rgb,
                     1.0, inside);
    DrawBannerOnPole(color, alpha, px,
                     c + float2(3, 6), 3.0,
                     float2(2, 0), float2(2, 2),
                     _TowerStoneShade.rgb, _OutpostBanner.rgb,
                     1.0, inside);

    // Gold trim across the parapet stone — single-row warm tint.
    float trim = rectMask(px, c + float2(-4, 6), float2(9, 1)) * inside;
    if (trim > 0.5) { color = lerp(color, _OutpostBanner.rgb, 0.55); alpha = 1.0; }
}

#endif

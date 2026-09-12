#ifndef RAREICON_HEX_WATCHTOWER_INCLUDED
#define RAREICON_HEX_WATCHTOWER_INCLUDED

// WatchTower — Tower T1 default-pick. Reuses DrawTower as the base
// silhouette and adds a small observation flag on the central pole so
// the upgraded silhouette reads as "manned defense" instead of an empty
// spire. Variant 0 of the Tower T1 alt-pick fan.
void DrawWatchTower(inout float3 color, inout float alpha, float2 px, float grid)
{
    DrawTower(color, alpha, px, grid);
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    // Pennant flag flying from the central torch pole.
    DrawBannerOnPole(color, alpha, px,
                     c + float2(0, 8), 1.0,
                     float2(1, 0), float2(2, 1),
                     _TowerStoneShade.rgb, _OutpostBanner.rgb,
                     1.0, inside);
}

#endif

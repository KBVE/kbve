#ifndef RAREICON_HEX_HIGHWATCH_TOWER_INCLUDED
#define RAREICON_HEX_HIGHWATCH_TOWER_INCLUDED

// HighwatchTower — Tower T1 alt-pick (variant 2). Reuses DrawTower as
// the base silhouette and stacks a raised observation cupola on top
// (extra block band + a dome cap) so the upgraded structure reads as a
// recon lookout, not a defensive tower. No torch flame on top — the
// vision-radius VisionRadius component is the gameplay distinction.
void DrawHighwatchTower(inout float3 color, inout float alpha, float2 px, float grid)
{
    DrawTower(color, alpha, px, grid);
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    // Raised cupola pillar — narrower than the main shaft.
    DrawStoneBlock(color, alpha, px, c + float2(-2, 8), float2(5, 2),
                   _TowerStone.rgb, inside, float2(53, 89));
    DrawStoneSideShadow(color, alpha, px, c + float2(-2, 8), float2(5, 2),
                        _TowerStoneShade.rgb, inside);

    // Dome cap — single row plus a centered stone keystone.
    float dome = rectMask(px, c + float2(-1, 10), float2(3, 1)) * inside;
    if (dome > 0.5) { color = _TowerStone.rgb; alpha = 1.0; }
    float keystone = rectMask(px, c + float2(0, 11), float2(1, 1)) * inside;
    if (keystone > 0.5) { color = _TowerStoneShade.rgb; alpha = 1.0; }
}

#endif

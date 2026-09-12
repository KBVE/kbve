#ifndef RAREICON_HEX_BEACON_TOWER_INCLUDED
#define RAREICON_HEX_BEACON_TOWER_INCLUDED

// BeaconTower — Tower T1 alt-pick (variant 1). Reuses DrawTower as the
// base silhouette and replaces the single central torch with a wider
// brazier crown so the upgraded structure reads as a signal beacon. The
// brazier sits two rows above the crenellations and uses _OutpostTorch
// for a warm flicker tied to _BuildingActive.
void DrawBeaconTower(inout float3 color, inout float alpha, float2 px, float grid)
{
    DrawTower(color, alpha, px, grid);
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Brazier rim — short stone band sits above the crenellations.
    float brazier = rectMask(px, c + float2(-2, 8), float2(5, 1)) * inside;
    if (brazier > 0.5) { color = _TowerStoneShade.rgb; alpha = 1.0; }

    // Wide flame crown — three torch flames spaced across the brazier.
    DrawTorchFlame(color, alpha, px, c + float2(-2, 9),
                   _TowerStoneShade.rgb, _OutpostTorch.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2(0, 10),
                   _TowerStoneShade.rgb, _OutpostTorch.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2(2, 9),
                   _TowerStoneShade.rgb, _OutpostTorch.rgb, active, inside);
}

#endif

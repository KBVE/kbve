#ifndef RAREICON_HEX_TOWER_INCLUDED
#define RAREICON_HEX_TOWER_INCLUDED

// Tower — standalone defensive spire. Tall stone shaft + parapet +
// crenellations + lit torch at top. Single-hex footprint.
void DrawTower(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    DrawFoundationBand(color, alpha, px, c + float2(-4, -8), 9.0,
                       _TowerStone.rgb * 0.4, _TowerStone.rgb * 0.55, inside);

    // Wide base flare.
    DrawStoneBlock(color, alpha, px, c + float2(-4, -6), float2(9, 2),
                   _TowerStone.rgb, inside, float2(29, 61));

    // Tall shaft.
    DrawStoneBlock(color, alpha, px, c + float2(-3, -4), float2(7, 9),
                   _TowerStone.rgb, inside, float2(71, 113));
    DrawStoneSideShadow(color, alpha, px, c + float2(-3, -4), float2(7, 9),
                        _TowerStoneShade.rgb, inside);
    DrawMasonrySeams(color, alpha, px, c + float2(-3, -4), float2(7, 9),
                     3.0, _TowerStoneShade.rgb, inside);

    // Entry.
    DrawArchedDoor(color, alpha, px, c + float2(-1, -4), 2.0, 2.0,
                   _CapitalDoor.rgb, inside);

    // Stacked arrow slits.
    DrawWindowSlit(color, alpha, px, c + float2(0, -1), float2(1, 2), _CapitalDoor.rgb, inside);
    DrawWindowSlit(color, alpha, px, c + float2(0,  3), float2(1, 2), _CapitalDoor.rgb, inside);

    // Upper parapet ring — slight outward flare.
    float parapet = rectMask(px, c + float2(-4, 5), float2(9, 1)) * inside;
    if (parapet > 0.5) { color = _TowerStoneShade.rgb; alpha = 1.0; }

    float cap = rectMask(px, c + float2(-4, 6), float2(9, 1)) * inside;
    if (cap > 0.5) { color = _TowerStone.rgb; alpha = 1.0; }

    // Crenellations on top.
    DrawCrenellations(color, alpha, px, c + float2(-4, 7), 9.0,
                      _TowerStone.rgb, inside);

    // Central torch at top — animated.
    DrawTorchFlame(color, alpha, px, c + float2(0, 8),
                   _TowerStoneShade.rgb, _OutpostTorch.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2(-1, 7),
                   _TowerStoneShade.rgb, _OutpostTorch.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2( 1, 7),
                   _TowerStoneShade.rgb, _OutpostTorch.rgb, active, inside);

    // Banner trailing from parapet.
    DrawBannerOnPole(color, alpha, px,
                     c + float2(-3, 6), 2.0,
                     float2(-2, 0), float2(2, 1),
                     _TowerStoneShade.rgb, _OutpostBanner.rgb,
                     1.0, inside);
}

#endif

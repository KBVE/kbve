#ifndef RAREICON_HEX_KEEP_INCLUDED
#define RAREICON_HEX_KEEP_INCLUDED

// Keep — Barracks tier 1. Taller central tower + single corner tower +
// curtain wall with crenellations. Reuses _Barracks* palette.
void DrawKeep(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    DrawFoundationBand(color, alpha, px, c + float2(-9, -8), 19.0,
                       _BarracksFoundation.rgb * 0.5, _BarracksFoundation.rgb, inside);

    // Curtain wall body.
    DrawStoneBlock(color, alpha, px, c + float2(-9, -6), float2(19, 4),
                   _BarracksWall.rgb, inside, float2(23, 67));
    DrawMasonrySeams(color, alpha, px, c + float2(-9, -6), float2(19, 4),
                     2.0, _BarracksFoundation.rgb, inside);

    // Wall crenellations.
    DrawCrenellations(color, alpha, px, c + float2(-9, -2), 19.0,
                      _BarracksTile.rgb, inside);

    // Arrow slits in curtain wall.
    DrawWindowSlit(color, alpha, px, c + float2(-6, -4), float2(1, 2),
                   _BarracksDoor.rgb, inside);
    DrawWindowSlit(color, alpha, px, c + float2( 5, -4), float2(1, 2),
                   _BarracksDoor.rgb, inside);

    // Central arched gate.
    DrawArchedDoor(color, alpha, px, c + float2(-1, -6), 3.0, 3.0,
                   _BarracksDoor.rgb, inside);

    // Left corner tower — rises above wall.
    DrawStoneBlock(color, alpha, px, c + float2(-9, -6), float2(4, 8),
                   _BarracksWall.rgb, inside, float2(5, 53));
    DrawStoneSideShadow(color, alpha, px, c + float2(-9, -6), float2(4, 8),
                        _BarracksFoundation.rgb, inside);
    DrawCrenellations(color, alpha, px, c + float2(-9, 2), 4.0,
                      _BarracksTile.rgb, inside);

    // Right corner tower.
    DrawStoneBlock(color, alpha, px, c + float2( 5, -6), float2(4, 8),
                   _BarracksWall.rgb, inside, float2(41, 89));
    DrawStoneSideShadow(color, alpha, px, c + float2( 5, -6), float2(4, 8),
                        _BarracksFoundation.rgb, inside);
    DrawCrenellations(color, alpha, px, c + float2( 5, 2), 4.0,
                      _BarracksTile.rgb, inside);

    // Central keep tower — dominates silhouette.
    DrawStoneBlock(color, alpha, px, c + float2(-3, -2), float2(7, 6),
                   _BarracksWall.rgb, inside, float2(101, 7));
    DrawStoneSideShadow(color, alpha, px, c + float2(-3, -2), float2(7, 6),
                        _BarracksFoundation.rgb, inside);
    DrawWindowSlit(color, alpha, px, c + float2(-1, 1), float2(1, 2),
                   _BarracksDoor.rgb, inside);
    DrawWindowSlit(color, alpha, px, c + float2( 1, 1), float2(1, 2),
                   _BarracksDoor.rgb, inside);
    DrawCrenellations(color, alpha, px, c + float2(-3, 4), 7.0,
                      _BarracksTile.rgb, inside);

    // Banner on keep.
    DrawBannerOnPole(color, alpha, px,
                     c + float2(0, 5), 4.0,
                     float2(1, 2), float2(3, 2),
                     _BarracksTimber.rgb, _BarracksInsignia.rgb,
                     1.0, inside);

    // Torch pulsing on each corner tower at night.
    DrawTorchFlame(color, alpha, px, c + float2(-7, 3),
                   _BarracksFoundation.rgb, _OutpostTorch.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2( 7, 3),
                   _BarracksFoundation.rgb, _OutpostTorch.rgb, active, inside);
}

#endif

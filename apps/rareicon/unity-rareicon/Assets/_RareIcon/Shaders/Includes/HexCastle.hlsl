#ifndef RAREICON_HEX_CASTLE_INCLUDED
#define RAREICON_HEX_CASTLE_INCLUDED

// Castle — Barracks tier 2. Twin flanking towers + wider curtain + multi-
// tier central keep + large banner. Darker, more imposing palette via
// _CastleStone / _CastleRoof overrides.
void DrawCastle(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    DrawFoundationBand(color, alpha, px, c + float2(-11, -9), 23.0,
                       _CastleStone.rgb * 0.4, _CastleStone.rgb * 0.55, inside);

    // Curtain wall (lower tier).
    DrawStoneBlock(color, alpha, px, c + float2(-11, -7), float2(23, 5),
                   _CastleStone.rgb, inside, float2(73, 131));
    DrawMasonrySeams(color, alpha, px, c + float2(-11, -7), float2(23, 5),
                     2.0, _CastleStone.rgb * 0.6, inside);

    // Wall crenellations.
    DrawCrenellations(color, alpha, px, c + float2(-11, -2), 23.0,
                      _CastleRoof.rgb, inside);

    // Arrow slits evenly spaced.
    DrawWindowSlit(color, alpha, px, c + float2(-7, -5), float2(1, 2), _CapitalDoor.rgb, inside);
    DrawWindowSlit(color, alpha, px, c + float2(-3, -5), float2(1, 2), _CapitalDoor.rgb, inside);
    DrawWindowSlit(color, alpha, px, c + float2( 2, -5), float2(1, 2), _CapitalDoor.rgb, inside);
    DrawWindowSlit(color, alpha, px, c + float2( 6, -5), float2(1, 2), _CapitalDoor.rgb, inside);

    // Central gate — double portcullis height.
    DrawArchedDoor(color, alpha, px, c + float2(-2, -7), 4.0, 4.0,
                   _CapitalDoor.rgb, inside);

    // Left flanking tower — taller + wider than Keep.
    DrawStoneBlock(color, alpha, px, c + float2(-11, -7), float2(5, 11),
                   _CastleStone.rgb, inside, float2(17, 89));
    DrawStoneSideShadow(color, alpha, px, c + float2(-11, -7), float2(5, 11),
                        _CastleStone.rgb * 0.55, inside);
    DrawWindowSlit(color, alpha, px, c + float2(-9, 0), float2(1, 2), _CapitalDoor.rgb, inside);
    DrawCrenellations(color, alpha, px, c + float2(-11, 4), 5.0, _CastleRoof.rgb, inside);

    // Right flanking tower.
    DrawStoneBlock(color, alpha, px, c + float2( 6, -7), float2(5, 11),
                   _CastleStone.rgb, inside, float2(113, 37));
    DrawStoneSideShadow(color, alpha, px, c + float2( 6, -7), float2(5, 11),
                        _CastleStone.rgb * 0.55, inside);
    DrawWindowSlit(color, alpha, px, c + float2( 8, 0), float2(1, 2), _CapitalDoor.rgb, inside);
    DrawCrenellations(color, alpha, px, c + float2( 6, 4), 5.0, _CastleRoof.rgb, inside);

    // Central keep lower tier.
    DrawStoneBlock(color, alpha, px, c + float2(-4, -2), float2(9, 6),
                   _CastleStone.rgb, inside, float2(211, 7));
    DrawStoneSideShadow(color, alpha, px, c + float2(-4, -2), float2(9, 6),
                        _CastleStone.rgb * 0.55, inside);
    DrawWindowSlit(color, alpha, px, c + float2(-2, 0), float2(1, 2), _CapitalDoor.rgb, inside);
    DrawWindowSlit(color, alpha, px, c + float2( 2, 0), float2(1, 2), _CapitalDoor.rgb, inside);

    // Central keep upper tier — watchtower.
    DrawStoneBlock(color, alpha, px, c + float2(-2, 4), float2(5, 4),
                   _CastleStone.rgb, inside, float2(43, 151));
    DrawStoneSideShadow(color, alpha, px, c + float2(-2, 4), float2(5, 4),
                        _CastleStone.rgb * 0.55, inside);
    DrawCrenellations(color, alpha, px, c + float2(-2, 8), 5.0, _CastleRoof.rgb, inside);

    // Huge banner on central keep peak.
    DrawBannerOnPole(color, alpha, px,
                     c + float2(0, 9), 5.0,
                     float2(1, 2), float2(4, 3),
                     _CastleStone.rgb * 0.5, _BarracksInsignia.rgb,
                     1.0, inside);

    // Four torches at tower corners.
    DrawTorchFlame(color, alpha, px, c + float2(-9, 5),
                   _CastleStone.rgb * 0.4, _OutpostTorch.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2( 9, 5),
                   _CastleStone.rgb * 0.4, _OutpostTorch.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2(-4, 9),
                   _CastleStone.rgb * 0.4, _OutpostTorch.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2( 4, 9),
                   _CastleStone.rgb * 0.4, _OutpostTorch.rgb, active, inside);
}

#endif

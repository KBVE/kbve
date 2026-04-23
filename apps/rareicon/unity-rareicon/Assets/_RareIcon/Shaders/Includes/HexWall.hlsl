#ifndef RAREICON_HEX_WALL_INCLUDED
#define RAREICON_HEX_WALL_INCLUDED

// Wall — standalone barrier segment. Stone rampart spanning the hex
// east-west with crenellations + gate arch in centre. Built low so units
// + other buildings still read above it in the silhouette.
void DrawWall(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    DrawFoundationBand(color, alpha, px, c + float2(-12, -3), 25.0,
                       _WallStone.rgb * 0.4, _WallStone.rgb * 0.55, inside);

    // Main rampart.
    DrawStoneBlock(color, alpha, px, c + float2(-12, -1), float2(25, 3),
                   _WallStone.rgb, inside, float2(47, 29));
    DrawMasonrySeams(color, alpha, px, c + float2(-12, -1), float2(25, 3),
                     1.0, _WallStoneShade.rgb, inside);

    // Central gate arch.
    DrawArchedDoor(color, alpha, px, c + float2(-2, -1), 4.0, 2.0,
                   _CapitalDoor.rgb, inside);

    // Crenellations along the top.
    DrawCrenellations(color, alpha, px, c + float2(-12, 2), 25.0,
                      _WallStone.rgb, inside);

    // Four arrow slits flanking the gate.
    DrawWindowSlit(color, alpha, px, c + float2(-8, 0), float2(1, 1), _CapitalDoor.rgb, inside);
    DrawWindowSlit(color, alpha, px, c + float2(-5, 0), float2(1, 1), _CapitalDoor.rgb, inside);
    DrawWindowSlit(color, alpha, px, c + float2( 5, 0), float2(1, 1), _CapitalDoor.rgb, inside);
    DrawWindowSlit(color, alpha, px, c + float2( 8, 0), float2(1, 1), _CapitalDoor.rgb, inside);

    // Corner bastion stubs — darker pixels at each end for termination.
    float bastL = rectMask(px, c + float2(-12, 2), float2(2, 2)) * inside;
    if (bastL > 0.5) { color = _WallStoneShade.rgb; alpha = 1.0; }
    float bastR = rectMask(px, c + float2( 11, 2), float2(2, 2)) * inside;
    if (bastR > 0.5) { color = _WallStoneShade.rgb; alpha = 1.0; }
}

#endif

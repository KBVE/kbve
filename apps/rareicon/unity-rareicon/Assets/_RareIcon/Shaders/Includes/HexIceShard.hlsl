#ifndef RAREICON_HEX_ICE_SHARD_INCLUDED
#define RAREICON_HEX_ICE_SHARD_INCLUDED

// Ice shard — elongated crystal with a sharp bright tip and darker
// edge pixels top/bottom. Symmetric rhombus silhouette, rotated per
// facing. Reads as a cold spike next to the warm fireball.
//
// Layout (east):
//     . E E . .        C = ice core, E = dark edge,
//     C C C C T        T = bright tip
//     . E E . .
//
// Uniforms: _IceCore, _IceEdge, _IceTip
// Helpers: rectMask (HexShared.hlsl).

void DrawIceShardEast(inout float3 color, inout float alpha, float2 px,
                      float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    float core = rectMask(px, c + float2(-2, 0), float2(4, 1));
    if (core > 0.5) { color = _IceCore.rgb; alpha = 1.0; }

    float edgeTop = rectMask(px, c + float2(-1,  1), float2(2, 1));
    float edgeBot = rectMask(px, c + float2(-1, -1), float2(2, 1));
    if (edgeTop > 0.5 || edgeBot > 0.5)
    {
        color = _IceEdge.rgb;
        alpha = 1.0;
    }

    float tip = rectMask(px, c + float2(2, 0), float2(1, 1));
    if (tip > 0.5) { color = _IceTip.rgb; alpha = 1.0; }
}

void DrawIceShardNorth(inout float3 color, inout float alpha, float2 px,
                       float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    float core = rectMask(px, c + float2(0, -2), float2(1, 4));
    if (core > 0.5) { color = _IceCore.rgb; alpha = 1.0; }

    float edgeL = rectMask(px, c + float2(-1, -1), float2(1, 2));
    float edgeR = rectMask(px, c + float2( 1, -1), float2(1, 2));
    if (edgeL > 0.5 || edgeR > 0.5)
    {
        color = _IceEdge.rgb;
        alpha = 1.0;
    }

    float tip = rectMask(px, c + float2(0, 2), float2(1, 1));
    if (tip > 0.5) { color = _IceTip.rgb; alpha = 1.0; }
}

void DrawIceShardSouth(inout float3 color, inout float alpha, float2 px,
                       float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    float core = rectMask(px, c + float2(0, -1), float2(1, 4));
    if (core > 0.5) { color = _IceCore.rgb; alpha = 1.0; }

    float edgeL = rectMask(px, c + float2(-1, 0), float2(1, 2));
    float edgeR = rectMask(px, c + float2( 1, 0), float2(1, 2));
    if (edgeL > 0.5 || edgeR > 0.5)
    {
        color = _IceEdge.rgb;
        alpha = 1.0;
    }

    float tip = rectMask(px, c + float2(0, -2), float2(1, 1));
    if (tip > 0.5) { color = _IceTip.rgb; alpha = 1.0; }
}

void DrawIceShard(inout float3 color, inout float alpha, float2 px, float grid,
                  int facing)
{
    if (facing == 0)
    {
        DrawIceShardEast(color, alpha, px, grid);
    }
    else if (facing == 1)
    {
        DrawIceShardNorth(color, alpha, px, grid);
    }
    else if (facing == 2)
    {
        px.x = grid - 1.0 - px.x;
        DrawIceShardEast(color, alpha, px, grid);
    }
    else
    {
        DrawIceShardSouth(color, alpha, px, grid);
    }
}

#endif // RAREICON_HEX_ICE_SHARD_INCLUDED

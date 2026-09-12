#ifndef RAREICON_HEX_BOLT_INCLUDED
#define RAREICON_HEX_BOLT_INCLUDED

// Crossbow bolt — about two-thirds the length of an arrow with a
// heavier 2-pixel head. Stubby shaft, small single-pair fletch.
// Reads as a shorter, chunkier projectile next to a goblin arrow.
//
// Layout (east):
//     F . . B .        F = fletch, S = shaft,
//     . S S H H        H = chunky head, B = barb
//     F . . B .
//
// Uniforms: _BoltShaft, _BoltHead, _BoltFletch
// Helpers: rectMask (HexShared.hlsl).

void DrawBoltEast(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    float shaft = rectMask(px, c + float2(-1, 0), float2(2, 1));
    if (shaft > 0.5) { color = _BoltShaft.rgb; alpha = 1.0; }

    // 2-pixel chunky head + barbs on the rear of the head.
    float head   = rectMask(px, c + float2( 1,  0), float2(2, 1));
    float barbUp = rectMask(px, c + float2( 1,  1), float2(1, 1));
    float barbDn = rectMask(px, c + float2( 1, -1), float2(1, 1));
    if (head > 0.5 || barbUp > 0.5 || barbDn > 0.5)
    {
        color = _BoltHead.rgb;
        alpha = 1.0;
    }

    float fletchUp = rectMask(px, c + float2(-2,  1), float2(1, 1));
    float fletchDn = rectMask(px, c + float2(-2, -1), float2(1, 1));
    if (fletchUp > 0.5 || fletchDn > 0.5)
    {
        color = _BoltFletch.rgb;
        alpha = 1.0;
    }
}

void DrawBoltNorth(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    float shaft = rectMask(px, c + float2(0, -1), float2(1, 2));
    if (shaft > 0.5) { color = _BoltShaft.rgb; alpha = 1.0; }

    float head  = rectMask(px, c + float2( 0,  1), float2(1, 2));
    float barbL = rectMask(px, c + float2(-1,  1), float2(1, 1));
    float barbR = rectMask(px, c + float2( 1,  1), float2(1, 1));
    if (head > 0.5 || barbL > 0.5 || barbR > 0.5)
    {
        color = _BoltHead.rgb;
        alpha = 1.0;
    }

    float fletchL = rectMask(px, c + float2(-1, -2), float2(1, 1));
    float fletchR = rectMask(px, c + float2( 1, -2), float2(1, 1));
    if (fletchL > 0.5 || fletchR > 0.5)
    {
        color = _BoltFletch.rgb;
        alpha = 1.0;
    }
}

void DrawBoltSouth(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    float shaft = rectMask(px, c + float2(0, 0), float2(1, 2));
    if (shaft > 0.5) { color = _BoltShaft.rgb; alpha = 1.0; }

    float head  = rectMask(px, c + float2( 0, -2), float2(1, 2));
    float barbL = rectMask(px, c + float2(-1, -1), float2(1, 1));
    float barbR = rectMask(px, c + float2( 1, -1), float2(1, 1));
    if (head > 0.5 || barbL > 0.5 || barbR > 0.5)
    {
        color = _BoltHead.rgb;
        alpha = 1.0;
    }

    float fletchL = rectMask(px, c + float2(-1, 2), float2(1, 1));
    float fletchR = rectMask(px, c + float2( 1, 2), float2(1, 1));
    if (fletchL > 0.5 || fletchR > 0.5)
    {
        color = _BoltFletch.rgb;
        alpha = 1.0;
    }
}

void DrawBolt(inout float3 color, inout float alpha, float2 px, float grid,
              int facing)
{
    if (facing == 0)
    {
        DrawBoltEast(color, alpha, px, grid);
    }
    else if (facing == 1)
    {
        DrawBoltNorth(color, alpha, px, grid);
    }
    else if (facing == 2)
    {
        px.x = grid - 1.0 - px.x;
        DrawBoltEast(color, alpha, px, grid);
    }
    else
    {
        DrawBoltSouth(color, alpha, px, grid);
    }
}

#endif // RAREICON_HEX_BOLT_INCLUDED

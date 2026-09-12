#ifndef RAREICON_HEX_ARROW_INCLUDED
#define RAREICON_HEX_ARROW_INCLUDED

// Wooden arrow — 4-pixel shaft, metal tip + 2 trailing barbs, V-shaped
// fletching at the tail. Facing 0/1/2/3 → East/North/West/South; West
// reuses East mirrored on x. Static sprite — movement comes from the
// projectile entity's velocity, not from the shader.
//
// Layout (east):
//     F . . . B .      F = fletch, S = shaft,
//     . S S S S T      B = barb,  T = tip
//     F . . . B .
//
// Uniforms: _ArrowShaft, _ArrowHead, _ArrowFletch
// Helpers: rectMask (HexShared.hlsl).

void DrawArrowEast(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    float shaft = rectMask(px, c + float2(-3, 0), float2(4, 1));
    if (shaft > 0.5) { color = _ArrowShaft.rgb; alpha = 1.0; }

    float tip    = rectMask(px, c + float2( 1,  0), float2(1, 1));
    float barbUp = rectMask(px, c + float2( 0,  1), float2(1, 1));
    float barbDn = rectMask(px, c + float2( 0, -1), float2(1, 1));
    if (tip > 0.5 || barbUp > 0.5 || barbDn > 0.5)
    {
        color = _ArrowHead.rgb;
        alpha = 1.0;
    }

    float fletchUp = rectMask(px, c + float2(-4,  1), float2(1, 1));
    float fletchDn = rectMask(px, c + float2(-4, -1), float2(1, 1));
    if (fletchUp > 0.5 || fletchDn > 0.5)
    {
        color = _ArrowFletch.rgb;
        alpha = 1.0;
    }
}

void DrawArrowNorth(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    float shaft = rectMask(px, c + float2(0, -3), float2(1, 4));
    if (shaft > 0.5) { color = _ArrowShaft.rgb; alpha = 1.0; }

    float tip   = rectMask(px, c + float2( 0,  1), float2(1, 1));
    float barbL = rectMask(px, c + float2(-1,  0), float2(1, 1));
    float barbR = rectMask(px, c + float2( 1,  0), float2(1, 1));
    if (tip > 0.5 || barbL > 0.5 || barbR > 0.5)
    {
        color = _ArrowHead.rgb;
        alpha = 1.0;
    }

    float fletchL = rectMask(px, c + float2(-1, -4), float2(1, 1));
    float fletchR = rectMask(px, c + float2( 1, -4), float2(1, 1));
    if (fletchL > 0.5 || fletchR > 0.5)
    {
        color = _ArrowFletch.rgb;
        alpha = 1.0;
    }
}

void DrawArrowSouth(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    float shaft = rectMask(px, c + float2(0, 0), float2(1, 4));
    if (shaft > 0.5) { color = _ArrowShaft.rgb; alpha = 1.0; }

    float tip   = rectMask(px, c + float2( 0, -1), float2(1, 1));
    float barbL = rectMask(px, c + float2(-1,  0), float2(1, 1));
    float barbR = rectMask(px, c + float2( 1,  0), float2(1, 1));
    if (tip > 0.5 || barbL > 0.5 || barbR > 0.5)
    {
        color = _ArrowHead.rgb;
        alpha = 1.0;
    }

    float fletchL = rectMask(px, c + float2(-1, 4), float2(1, 1));
    float fletchR = rectMask(px, c + float2( 1, 4), float2(1, 1));
    if (fletchL > 0.5 || fletchR > 0.5)
    {
        color = _ArrowFletch.rgb;
        alpha = 1.0;
    }
}

void DrawArrow(inout float3 color, inout float alpha, float2 px, float grid,
               int facing)
{
    if (facing == 0)
    {
        DrawArrowEast(color, alpha, px, grid);
    }
    else if (facing == 1)
    {
        DrawArrowNorth(color, alpha, px, grid);
    }
    else if (facing == 2)
    {
        px.x = grid - 1.0 - px.x;
        DrawArrowEast(color, alpha, px, grid);
    }
    else
    {
        DrawArrowSouth(color, alpha, px, grid);
    }
}

#endif // RAREICON_HEX_ARROW_INCLUDED

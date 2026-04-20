#ifndef RAREICON_HEX_STONE_INCLUDED
#define RAREICON_HEX_STONE_INCLUDED

// Thrown rock — small rounded lump with a single highlight pixel.
// Rotationally symmetric (same sprite for every facing) because a
// tumbling rock has no front. Smallest projectile in the set so it
// reads as a cheap goblin throw rather than a precision shot.
//
// Layout:
//     . H .           H = highlight,
//     S S S           S = stone body / shade
//     S S S
//
// Uniforms: _StoneProj, _StoneProjShade
// Helpers: rectMask (HexShared.hlsl).

void DrawStone(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    // Main body — 3-pixel wide, 2-pixel tall block of shaded stone.
    float body = rectMask(px, c + float2(-1, -1), float2(3, 2));
    if (body > 0.5) { color = _StoneProjShade.rgb; alpha = 1.0; }

    // Upper highlight row — lighter stone on top.
    float hi = rectMask(px, c + float2(-1, 0), float2(3, 1));
    if (hi > 0.5) { color = _StoneProj.rgb; alpha = 1.0; }

    // Single specular pixel at the top-left shoulder.
    float spec = rectMask(px, c + float2(-1, 1), float2(1, 1));
    if (spec > 0.5) { color = _StoneProj.rgb; alpha = 1.0; }
}

#endif // RAREICON_HEX_STONE_INCLUDED

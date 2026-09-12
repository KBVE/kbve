#ifndef RAREICON_HEX_FIREBALL_INCLUDED
#define RAREICON_HEX_FIREBALL_INCLUDED

// Magical fireball — bright core plus a flickering flame aura and a
// tail trailing behind the direction of flight. Three concentric
// circles at offset centres build the lit-core + flowing-trail shape,
// and the outer radius breathes over time so the flame reads as alive.
//
// Layout (east, schematic):
//     . . O O M .
//     . O M M M C    C = core, M = mid flame,
//     . . O O M .    O = outer flame aura
//
// Uniforms: _FireballCore, _FireballMid, _FireballOuter
// Helpers: circleMask, rectMask (HexShared.hlsl).

void DrawFireballEast(inout float3 color, inout float alpha, float2 px,
                      float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));
    float flick = sin(_Time.y * 18.0) * 0.5 + 0.5;  // 0..1

    float2 outerC = c + float2(-1, 0);
    float2 midC   = c + float2( 0, 0);
    float2 coreC  = c + float2( 1, 0);

    float outerM = circleMask(px, outerC, 2.4 + flick * 0.3);
    float midM   = circleMask(px, midC,   1.5);
    float coreM  = circleMask(px, coreC,  0.8);

    if (outerM > 0.5) { color = _FireballOuter.rgb; alpha = 1.0; }
    if (midM   > 0.5) { color = _FireballMid.rgb;   alpha = 1.0; }
    if (coreM  > 0.5) { color = _FireballCore.rgb;  alpha = 1.0; }
}

void DrawFireballNorth(inout float3 color, inout float alpha, float2 px,
                       float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));
    float flick = sin(_Time.y * 18.0) * 0.5 + 0.5;

    float2 outerC = c + float2(0, -1);
    float2 midC   = c + float2(0,  0);
    float2 coreC  = c + float2(0,  1);

    float outerM = circleMask(px, outerC, 2.4 + flick * 0.3);
    float midM   = circleMask(px, midC,   1.5);
    float coreM  = circleMask(px, coreC,  0.8);

    if (outerM > 0.5) { color = _FireballOuter.rgb; alpha = 1.0; }
    if (midM   > 0.5) { color = _FireballMid.rgb;   alpha = 1.0; }
    if (coreM  > 0.5) { color = _FireballCore.rgb;  alpha = 1.0; }
}

void DrawFireballSouth(inout float3 color, inout float alpha, float2 px,
                       float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));
    float flick = sin(_Time.y * 18.0) * 0.5 + 0.5;

    float2 outerC = c + float2(0,  1);
    float2 midC   = c + float2(0,  0);
    float2 coreC  = c + float2(0, -1);

    float outerM = circleMask(px, outerC, 2.4 + flick * 0.3);
    float midM   = circleMask(px, midC,   1.5);
    float coreM  = circleMask(px, coreC,  0.8);

    if (outerM > 0.5) { color = _FireballOuter.rgb; alpha = 1.0; }
    if (midM   > 0.5) { color = _FireballMid.rgb;   alpha = 1.0; }
    if (coreM  > 0.5) { color = _FireballCore.rgb;  alpha = 1.0; }
}

void DrawFireball(inout float3 color, inout float alpha, float2 px, float grid,
                  int facing)
{
    if (facing == 0)
    {
        DrawFireballEast(color, alpha, px, grid);
    }
    else if (facing == 1)
    {
        DrawFireballNorth(color, alpha, px, grid);
    }
    else if (facing == 2)
    {
        px.x = grid - 1.0 - px.x;
        DrawFireballEast(color, alpha, px, grid);
    }
    else
    {
        DrawFireballSouth(color, alpha, px, grid);
    }
}

#endif // RAREICON_HEX_FIREBALL_INCLUDED

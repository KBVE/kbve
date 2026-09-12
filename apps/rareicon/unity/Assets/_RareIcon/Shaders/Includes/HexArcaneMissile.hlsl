#ifndef RAREICON_HEX_ARCANE_MISSILE_INCLUDED
#define RAREICON_HEX_ARCANE_MISSILE_INCLUDED

// Arcane missile — a thin lance of magical energy: bright tip, 3-pixel
// core, glow ahead of the core, plus a single trailing wisp behind.
// Narrower than HexFireball so the two read as distinct mage shots:
// fireball = round orb, arcane missile = sharp lance. Core pulses
// subtly via _Time.y so the shot feels alive without the big radius
// breathing of the fireball.
//
// Layout (east):
//     . . G . . .        T = tip, C = core, G = glow,
//     O G C C C T        O = outer wisp
//     . . G . . .
//
// Uniforms: _ArcaneCore, _ArcaneGlow, _ArcaneOuter
// Helpers: rectMask (HexShared.hlsl).

void DrawArcaneMissileEast(inout float3 color, inout float alpha, float2 px,
                           float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));
    float pulse = sin(_Time.y * 22.0) * 0.5 + 0.5;  // 0..1

    // Outer wisp — single pixel trailing at the far rear.
    float wisp = rectMask(px, c + float2(-3, 0), float2(1, 1));
    if (wisp > 0.5) { color = _ArcaneOuter.rgb; alpha = 1.0; }

    // Glow — behind the core on the lateral axis + one ahead.
    float glowBack = rectMask(px, c + float2(-2, 0), float2(1, 1));
    float glowUp   = rectMask(px, c + float2(-1, 1), float2(1, 1));
    float glowDn   = rectMask(px, c + float2(-1, -1), float2(1, 1));
    if (glowBack > 0.5 || glowUp > 0.5 || glowDn > 0.5)
    {
        color = _ArcaneGlow.rgb;
        alpha = 1.0;
    }

    // Core — 3 horizontal pixels forming the lance body.
    float core = rectMask(px, c + float2(-1, 0), float2(3, 1));
    if (core > 0.5)
    {
        color = lerp(_ArcaneCore.rgb, _ArcaneGlow.rgb, 1.0 - pulse * 0.6);
        alpha = 1.0;
    }

    // Tip — single bright pixel leading the shot.
    float tip = rectMask(px, c + float2(2, 0), float2(1, 1));
    if (tip > 0.5) { color = _ArcaneCore.rgb; alpha = 1.0; }
}

void DrawArcaneMissileNorth(inout float3 color, inout float alpha, float2 px,
                            float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));
    float pulse = sin(_Time.y * 22.0) * 0.5 + 0.5;

    float wisp = rectMask(px, c + float2(0, -3), float2(1, 1));
    if (wisp > 0.5) { color = _ArcaneOuter.rgb; alpha = 1.0; }

    float glowBack = rectMask(px, c + float2(0, -2), float2(1, 1));
    float glowL    = rectMask(px, c + float2(-1, -1), float2(1, 1));
    float glowR    = rectMask(px, c + float2( 1, -1), float2(1, 1));
    if (glowBack > 0.5 || glowL > 0.5 || glowR > 0.5)
    {
        color = _ArcaneGlow.rgb;
        alpha = 1.0;
    }

    float core = rectMask(px, c + float2(0, -1), float2(1, 3));
    if (core > 0.5)
    {
        color = lerp(_ArcaneCore.rgb, _ArcaneGlow.rgb, 1.0 - pulse * 0.6);
        alpha = 1.0;
    }

    float tip = rectMask(px, c + float2(0, 2), float2(1, 1));
    if (tip > 0.5) { color = _ArcaneCore.rgb; alpha = 1.0; }
}

void DrawArcaneMissileSouth(inout float3 color, inout float alpha, float2 px,
                            float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));
    float pulse = sin(_Time.y * 22.0) * 0.5 + 0.5;

    float wisp = rectMask(px, c + float2(0, 3), float2(1, 1));
    if (wisp > 0.5) { color = _ArcaneOuter.rgb; alpha = 1.0; }

    float glowBack = rectMask(px, c + float2(0, 2), float2(1, 1));
    float glowL    = rectMask(px, c + float2(-1, 1), float2(1, 1));
    float glowR    = rectMask(px, c + float2( 1, 1), float2(1, 1));
    if (glowBack > 0.5 || glowL > 0.5 || glowR > 0.5)
    {
        color = _ArcaneGlow.rgb;
        alpha = 1.0;
    }

    float core = rectMask(px, c + float2(0, -1), float2(1, 3));
    if (core > 0.5)
    {
        color = lerp(_ArcaneCore.rgb, _ArcaneGlow.rgb, 1.0 - pulse * 0.6);
        alpha = 1.0;
    }

    float tip = rectMask(px, c + float2(0, -2), float2(1, 1));
    if (tip > 0.5) { color = _ArcaneCore.rgb; alpha = 1.0; }
}

void DrawArcaneMissile(inout float3 color, inout float alpha, float2 px,
                       float grid, int facing)
{
    if (facing == 0)
    {
        DrawArcaneMissileEast(color, alpha, px, grid);
    }
    else if (facing == 1)
    {
        DrawArcaneMissileNorth(color, alpha, px, grid);
    }
    else if (facing == 2)
    {
        px.x = grid - 1.0 - px.x;
        DrawArcaneMissileEast(color, alpha, px, grid);
    }
    else
    {
        DrawArcaneMissileSouth(color, alpha, px, grid);
    }
}

#endif // RAREICON_HEX_ARCANE_MISSILE_INCLUDED

#ifndef RAREICON_HEX_SHIELD_INCLUDED
#define RAREICON_HEX_SHIELD_INCLUDED

// Round shield — 3×3 circle with a brighter boss at its centre.
// Drawn on the unit's off-hand side; the shader mirrors px for West
// facing externally, so the anchor is always returned in unflipped
// pixel space.
//
// Shape is rotation-symmetric so the same draw works for every
// facing. The anchor shifts with facing to keep the shield on the
// off-hand side of the body.
//
// Uniforms: _ShieldFace, _ShieldBoss
// Helpers: rectMask, circleMask (HexShared.hlsl).

float2 UnitShieldAnchor(float grid, int facing)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.45));
    // Shield sits on the body's rear-off side for East (negative x is
    // "our left" which is the unit's right-back when east-facing). The
    // same offset reads as "viewer-left off-hand" on North / South.
    // West reuses East after the shader's px.x flip.
    return c + float2(-2, -1);
}

void DrawShield(inout float3 color, inout float alpha, float2 px,
                float2 anchor, int facing)
{
    float face = circleMask(px, anchor, 1.5);
    if (face > 0.5)
    {
        color = _ShieldFace.rgb;
        alpha = 1.0;
    }

    // Boss — single bright pixel at the shield's centre.
    float boss = rectMask(px, anchor, float2(1, 1));
    if (boss > 0.5)
    {
        color = _ShieldBoss.rgb;
        alpha = 1.0;
    }
}

#endif // RAREICON_HEX_SHIELD_INCLUDED

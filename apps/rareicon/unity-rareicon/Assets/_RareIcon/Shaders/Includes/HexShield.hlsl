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
// Tints come from a switch on shieldType (1..5 matching ShieldType.*
// in C#). Sprite shape is identical across types — the differentiation
// is colour only, until per-type silhouettes land.

float2 UnitShieldAnchor(float grid, int facing)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.45));
    return c + float2(-2, -1);
}

void DrawShield(inout float3 color, inout float alpha, float2 px,
                float2 anchor, int facing, int shieldType)
{
    float3 face = _ShieldFace.rgb;
    float3 boss = _ShieldBoss.rgb;

    if      (shieldType == 1) { face = float3(0.42, 0.28, 0.16); boss = float3(0.62, 0.42, 0.22); } // Buckler  - oak / bronze stud
    else if (shieldType == 2) { face = float3(0.55, 0.38, 0.20); boss = float3(0.78, 0.56, 0.30); } // Wooden   - lighter wood + iron rim
    else if (shieldType == 3) { face = _ShieldFace.rgb;          boss = _ShieldBoss.rgb;          } // Iron     - the original round shield colours
    else if (shieldType == 4) { face = float3(0.40, 0.44, 0.52); boss = float3(0.85, 0.78, 0.45); } // Kite     - cold steel + gilt boss
    else if (shieldType == 5) { face = float3(0.92, 0.78, 0.30); boss = float3(0.98, 0.92, 0.55); } // GoldPlated - solid gold + bright

    float maskFace = circleMask(px, anchor, 1.5);
    if (maskFace > 0.5)
    {
        color = face;
        alpha = 1.0;
    }

    float maskBoss = rectMask(px, anchor, float2(1, 1));
    if (maskBoss > 0.5)
    {
        color = boss;
        alpha = 1.0;
    }
}

#endif // RAREICON_HEX_SHIELD_INCLUDED

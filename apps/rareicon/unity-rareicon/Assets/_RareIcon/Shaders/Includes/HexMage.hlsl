#ifndef RAREICON_HEX_MAGE_INCLUDED
#define RAREICON_HEX_MAGE_INCLUDED

// Robed mage — pointed hood, flared robe hem with a trim stripe, no
// visible legs. Feet show as a single alternating pixel peeking below
// the hem so the sprite still reads as walking without leg geometry.
// Three views (Side / Back / Front); West reuses Side mirrored. Skin
// only appears inside the hood opening.
//
// Uniforms (HexUnit.shader UnityPerMaterial CBUFFER):
//   _MageRobe, _MageRobeShade, _MageTrim, _MageSkin, _MageEye
// Helpers: rectMask, circleMask (HexShared.hlsl) +
//          _UnitShadow, _UnitStep, _UnitBob (HexUnitAnim.hlsl).

// Helper — flared hem (hem rectangle + trim stripe over the top row).
void _MageHem(inout float3 color, inout float alpha, float2 px, float2 c)
{
    float hem = rectMask(px, c + float2(-2, -4), float2(5, 2));
    if (hem > 0.5) { color = _MageRobeShade.rgb; alpha = 1.0; }
    float trim = rectMask(px, c + float2(-2, -3), float2(5, 1));
    if (trim > 0.5) { color = _MageTrim.rgb; alpha = 1.0; }
}

// Helper — single foot pixel alternating left/right with the step phase.
void _MageFoot(inout float3 color, inout float alpha, float2 px, float2 c,
               float legSwap)
{
    float footX = (legSwap > 0.5) ? -1.0 : 1.0;
    float foot = rectMask(px, c + float2(footX, -5), float2(1, 1));
    if (foot > 0.5) { color = _MageRobeShade.rgb; alpha = 1.0; }
}

// ---- side view (east; west = east mirrored) ---------------------------------
void DrawMageSide(inout float3 color, inout float alpha, float2 px,
                  float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);
    _MageHem(color, alpha, px, c);
    _MageFoot(color, alpha, px, c, legSwap);

    // Robe torso.
    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _MageRobe.rgb : _MageRobeShade.rgb;
        alpha = 1.0;
    }

    // Hood — circle over where the head sits, capped with a tip pixel.
    float2 hc = c + float2(0, 2);
    float hood = circleMask(px, hc, 1.9);
    if (hood > 0.5) { color = _MageRobe.rgb; alpha = 1.0; }
    float hoodTip = rectMask(px, hc + float2(0, 2), float2(1, 1));
    if (hoodTip > 0.5) { color = _MageRobe.rgb; alpha = 1.0; }

    // Face — single skin pixel peeking forward out of the hood opening.
    float face = rectMask(px, hc + float2(1, -1), float2(1, 1));
    if (face > 0.5) { color = _MageSkin.rgb; alpha = 1.0; }
    float eye = step(length(px - (hc + float2(1, 0))), 0.45);
    if (eye > 0.5 && hood > 0.5) { color = _MageEye.rgb; alpha = 1.0; }
}

// ---- back view (north; we see the back of the mage) -------------------------
void DrawMageBack(inout float3 color, inout float alpha, float2 px,
                  float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);
    _MageHem(color, alpha, px, c);
    _MageFoot(color, alpha, px, c, legSwap);

    // Wider robe back — full shoulders visible.
    float body = rectMask(px, c + float2(-2, -2), float2(5, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _MageRobe.rgb : _MageRobeShade.rgb;
        alpha = 1.0;
    }

    // Hood — solid back, no face.
    float2 hc = c + float2(0, 2);
    float hood = circleMask(px, hc, 2.0);
    if (hood > 0.5) { color = _MageRobe.rgb; alpha = 1.0; }
    float hoodTip = rectMask(px, hc + float2(0, 2), float2(1, 1));
    if (hoodTip > 0.5) { color = _MageRobe.rgb; alpha = 1.0; }
}

// ---- front view (south; facing the camera) ----------------------------------
void DrawMageFront(inout float3 color, inout float alpha, float2 px,
                   float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);
    _MageHem(color, alpha, px, c);
    _MageFoot(color, alpha, px, c, legSwap);

    // Wider robe body.
    float body = rectMask(px, c + float2(-2, -2), float2(5, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _MageRobe.rgb : _MageRobeShade.rgb;
        alpha = 1.0;
    }

    // Hood.
    float2 hc = c + float2(0, 2);
    float hood = circleMask(px, hc, 2.0);
    if (hood > 0.5) { color = _MageRobe.rgb; alpha = 1.0; }
    float hoodTip = rectMask(px, hc + float2(0, 2), float2(1, 1));
    if (hoodTip > 0.5) { color = _MageRobe.rgb; alpha = 1.0; }

    // Face — 3-pixel skin row inside the hood opening with two eye dots.
    float face = rectMask(px, hc + float2(-1, -1), float2(3, 1));
    if (face > 0.5 && hood > 0.5) { color = _MageSkin.rgb; alpha = 1.0; }
    float eyeL = step(length(px - (hc + float2(-1, -1))), 0.45);
    float eyeR = step(length(px - (hc + float2( 1, -1))), 0.45);
    if ((eyeL > 0.5 || eyeR > 0.5) && hood > 0.5)
    {
        color = _MageEye.rgb;
        alpha = 1.0;
    }
}

// Hand anchor for a staff held at the mage's side. North/South reach
// the grip in front of the torso, East/West extend forward like the
// other units. Staff/orb .hlsl can paint from this anchor later.
float2 MageWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    if (facing == 1) return c + float2( 2.0, 0);
    if (facing == 3) return c + float2( 2.0, -1);
    return c + float2( 2.2, -1);
}

// ---- dispatch ---------------------------------------------------------------
void DrawMage(inout float3 color, inout float alpha, float2 px, float grid,
              float seed, int facing)
{
    if (facing == 0)
    {
        DrawMageSide(color, alpha, px, grid, seed);
    }
    else if (facing == 1)
    {
        DrawMageBack(color, alpha, px, grid, seed);
    }
    else if (facing == 2)
    {
        px.x = grid - 1.0 - px.x;
        DrawMageSide(color, alpha, px, grid, seed);
    }
    else
    {
        DrawMageFront(color, alpha, px, grid, seed);
    }
}

#endif // RAREICON_HEX_MAGE_INCLUDED

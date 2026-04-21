#ifndef RAREICON_HEX_SOLDIER_INCLUDED
#define RAREICON_HEX_SOLDIER_INCLUDED

// Light-armour human soldier — leather vest over a cloth shirt, pants,
// bare head with cropped hair. Three views (Side / Back / Front); West
// reuses Side mirrored. Hair replaces the goblin's ear silhouette so
// the profile reads as human at a glance.
//
// Uniforms (HexUnit.shader UnityPerMaterial CBUFFER):
//   _SoldierBody, _SoldierBodyShade, _SoldierCloth, _SoldierClothShade,
//   _SoldierSkin, _SoldierSkinShade, _SoldierHair, _SoldierEye
// Helpers: rectMask, circleMask (HexShared.hlsl) +
//          _UnitShadow, _UnitStep, _UnitBob (HexUnitAnim.hlsl).

// ---- side view (east; west = east mirrored) ---------------------------------
void DrawSoldierSide(inout float3 color, inout float alpha, float2 px,
                     float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Leather vest torso.
    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _SoldierBody.rgb : _SoldierBodyShade.rgb;
        alpha = 1.0;
    }
    // Cloth shirt peeking through the vest at the shoulders (top row).
    float collar = rectMask(px, c + float2(-1, 0), float2(3, 1));
    if (collar > 0.5) { color = _SoldierCloth.rgb; alpha = 1.0; }

    // Head — skin tone, shaded at the chin.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5)
    {
        color = (px.y >= hc.y) ? _SoldierSkin.rgb : _SoldierSkinShade.rgb;
        alpha = 1.0;
    }
    // Hair — band across the scalp + a sideburn pixel on the BACK of the
    // head so the silhouette reads hair-trails-behind-forehead instead of
    // a symmetric cap. The prior "hairFwd" pixel lived under the eye and
    // got overdrawn, leaving the profile facing-ambiguous.
    float hair     = rectMask(px, hc + float2(-1, 1), float2(3, 1));
    float hairBack = rectMask(px, hc + float2(-2, 0), float2(1, 1));
    if (hair > 0.5 || hairBack > 0.5)
    {
        color = _SoldierHair.rgb;
        alpha = 1.0;
    }
    // Nose — single skin pixel jutting forward past the head circle so
    // East/West facing reads at a glance.
    float nose = rectMask(px, hc + float2(2, 0), float2(1, 1));
    if (nose > 0.5) { color = _SoldierSkinShade.rgb; alpha = 1.0; }
    // Single forward eye.
    float eye = step(length(px - (hc + float2(0.6, 0))), 0.45);
    if (eye > 0.5 && head > 0.5) { color = _SoldierEye.rgb; alpha = 1.0; }

    // Legs — cloth pants, brighter front leg for depth.
    float frontLegX = (legSwap > 0.5) ?  1.0 : -1.0;
    float backLegX  = (legSwap > 0.5) ? -1.0 :  1.0;
    bool  frontDown = (legSwap > 0.5);
    float frontH = frontDown ? 3.0 : 2.0;
    float backH  = frontDown ? 2.0 : 3.0;
    float frontY = -1.0 - frontH;
    float backY  = -1.0 - backH;
    float legBack  = rectMask(px, c + float2(backLegX,  backY),  float2(1, backH));
    float legFront = rectMask(px, c + float2(frontLegX, frontY), float2(1, frontH));
    if (legBack  > 0.5) { color = _SoldierClothShade.rgb; alpha = 1.0; }
    if (legFront > 0.5) { color = _SoldierCloth.rgb;      alpha = 1.0; }
}

// ---- back view (north; we see the back of the soldier) ----------------------
void DrawSoldierBack(inout float3 color, inout float alpha, float2 px,
                     float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Vest back + cloth collar.
    float body = rectMask(px, c + float2(-2, -2), float2(5, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _SoldierBody.rgb : _SoldierBodyShade.rgb;
        alpha = 1.0;
    }
    float collar = rectMask(px, c + float2(-2, 0), float2(5, 1));
    if (collar > 0.5) { color = _SoldierCloth.rgb; alpha = 1.0; }

    // Arms — cloth sleeves + a bare skin cuff at the hand.
    float armL = step(length(px - (c + float2(-2.5, -1))), 0.6);
    float armR = step(length(px - (c + float2( 2.5, -1))), 0.6);
    if (armL > 0.5 || armR > 0.5) { color = _SoldierCloth.rgb; alpha = 1.0; }

    // Head — back of the scalp is all hair; skin only peeks at the nape.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.8);
    if (head > 0.5)
    {
        color = (px.y >= hc.y - 1) ? _SoldierHair.rgb : _SoldierSkinShade.rgb;
        alpha = 1.0;
    }

    // Legs — pants.
    bool leftDown = (legSwap > 0.5);
    float lH = leftDown ? 3.0 : 2.0;
    float rH = leftDown ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5)
    {
        color = _SoldierClothShade.rgb;
        alpha = 1.0;
    }
}

// ---- front view (south; facing the camera) ----------------------------------
void DrawSoldierFront(inout float3 color, inout float alpha, float2 px,
                      float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Vest + cloth collar.
    float body = rectMask(px, c + float2(-2, -2), float2(5, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _SoldierBody.rgb : _SoldierBodyShade.rgb;
        alpha = 1.0;
    }
    float collar = rectMask(px, c + float2(-2, 0), float2(5, 1));
    if (collar > 0.5) { color = _SoldierCloth.rgb; alpha = 1.0; }

    // Arms — cloth sleeves, bare skin cuff at the hand.
    float armL = step(length(px - (c + float2(-2.5, -1))), 0.6);
    float armR = step(length(px - (c + float2( 2.5, -1))), 0.6);
    if (armL > 0.5 || armR > 0.5) { color = _SoldierCloth.rgb; alpha = 1.0; }
    float handL = step(length(px - (c + float2(-2.5, -2))), 0.5);
    float handR = step(length(px - (c + float2( 2.5, -2))), 0.5);
    if (handL > 0.5 || handR > 0.5) { color = _SoldierSkin.rgb; alpha = 1.0; }

    // Head — skin face with hair on top, two dark eye dots.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.8);
    if (head > 0.5)
    {
        color = (px.y >= hc.y) ? _SoldierSkin.rgb : _SoldierSkinShade.rgb;
        alpha = 1.0;
    }
    float hair = rectMask(px, hc + float2(-2, 1), float2(5, 1));
    if (hair > 0.5) { color = _SoldierHair.rgb; alpha = 1.0; }
    float eyeL = step(length(px - (hc + float2(-0.7, 0))), 0.45);
    float eyeR = step(length(px - (hc + float2( 0.7, 0))), 0.45);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5)
    {
        color = _SoldierEye.rgb;
        alpha = 1.0;
    }

    // Legs — pants.
    bool leftDown = (legSwap > 0.5);
    float lH = leftDown ? 3.0 : 2.0;
    float rH = leftDown ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5)
    {
        color = _SoldierClothShade.rgb;
        alpha = 1.0;
    }
}

// Hand anchor for a weapon in the soldier's sword hand.
float2 SoldierWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    if (facing == 1) return c + float2( 2.0, 0);
    if (facing == 3) return c + float2( 2.0, -1);
    return c + float2( 2.0, -1);
}

// ---- dispatch ---------------------------------------------------------------
void DrawSoldier(inout float3 color, inout float alpha, float2 px, float grid,
                 float seed, int facing)
{
    if (facing == 0)
    {
        DrawSoldierSide(color, alpha, px, grid, seed);
    }
    else if (facing == 1)
    {
        DrawSoldierBack(color, alpha, px, grid, seed);
    }
    else if (facing == 2)
    {
        px.x = grid - 1.0 - px.x;
        DrawSoldierSide(color, alpha, px, grid, seed);
    }
    else
    {
        DrawSoldierFront(color, alpha, px, grid, seed);
    }
}

#endif // RAREICON_HEX_SOLDIER_INCLUDED

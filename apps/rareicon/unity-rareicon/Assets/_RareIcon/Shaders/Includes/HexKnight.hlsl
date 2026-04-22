#ifndef RAREICON_HEX_KNIGHT_INCLUDED
#define RAREICON_HEX_KNIGHT_INCLUDED

// Fully-armored knight — closed helm (no visible skin), plate torso,
// plume crest on top of the helmet. Three views (Side / Back / Front);
// West reuses Side mirrored. Pauldron bumps on each shoulder + a visor
// dot on Side/Front read the facing direction at a glance.
//
// Uniforms (HexUnit.shader UnityPerMaterial CBUFFER):
//   _KnightArmor, _KnightArmorShade, _KnightPlume
// Helpers: rectMask, circleMask (HexShared.hlsl) +
//          _UnitShadow, _UnitStep, _UnitBob (HexUnitAnim.hlsl).

// ---- side view (east; west = east mirrored) ---------------------------------
void DrawKnightSide(inout float3 color, inout float alpha, float2 px,
                    float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Plate torso — upper row lit, lower rows in shadow (belt line).
    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _KnightArmor.rgb : _KnightArmorShade.rgb;
        alpha = 1.0;
    }

    // Pauldron — forward shoulder bump.
    float pauldron = step(length(px - (c + float2(1.8, 1))), 0.6);
    if (pauldron > 0.5) { color = _KnightArmor.rgb; alpha = 1.0; }

    // Helm — solid armor, no skin visible.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.8);
    if (head > 0.5)
    {
        color = (px.y >= hc.y) ? _KnightArmor.rgb : _KnightArmorShade.rgb;
        alpha = 1.0;
    }
    // Visor dot — single dark pixel on the forward face.
    float visor = step(length(px - (hc + float2(0.7, 0))), 0.45);
    if (visor > 0.5 && head > 0.5)
    {
        color = _KnightArmorShade.rgb * 0.45;
        alpha = 1.0;
    }

    // Horsehair crest streaming backward off the helm — 3 horizontal
    // pixels above the crown. Vertical back-stacks read as a chicken comb
    // at 16-grid; horizontal reads as "crest".
    float plumeA = rectMask(px, hc + float2(-2, 2), float2(1, 1));
    float plumeB = rectMask(px, hc + float2(-1, 2), float2(1, 1));
    float plumeC = rectMask(px, hc + float2( 0, 2), float2(1, 1));
    if (plumeA > 0.5 || plumeB > 0.5 || plumeC > 0.5)
    {
        color = _KnightPlume.rgb;
        alpha = 1.0;
    }

    // Legs — armored shuffle. Same 2↔3 swap as the goblin so the leg
    // top stays flush with the body bottom while the body bobs.
    float frontLegX = (legSwap > 0.5) ?  1.0 : -1.0;
    float backLegX  = (legSwap > 0.5) ? -1.0 :  1.0;
    bool  frontDown = (legSwap > 0.5);
    float frontH = frontDown ? 3.0 : 2.0;
    float backH  = frontDown ? 2.0 : 3.0;
    float frontY = -1.0 - frontH;
    float backY  = -1.0 - backH;
    float legBack  = rectMask(px, c + float2(backLegX,  backY),  float2(1, backH));
    float legFront = rectMask(px, c + float2(frontLegX, frontY), float2(1, frontH));
    if (legBack  > 0.5) { color = _KnightArmorShade.rgb; alpha = 1.0; }
    if (legFront > 0.5) { color = _KnightArmor.rgb;      alpha = 1.0; }
}

// ---- back view (north; we see the back of the knight) -----------------------
void DrawKnightBack(inout float3 color, inout float alpha, float2 px,
                    float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Plate backplate.
    float body = rectMask(px, c + float2(-2, -2), float2(5, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _KnightArmor.rgb : _KnightArmorShade.rgb;
        alpha = 1.0;
    }

    // Pauldrons — both shoulders visible.
    float pauldronL = step(length(px - (c + float2(-2.5, 1))), 0.6);
    float pauldronR = step(length(px - (c + float2( 2.5, 1))), 0.6);
    if (pauldronL > 0.5 || pauldronR > 0.5)
    {
        color = _KnightArmor.rgb;
        alpha = 1.0;
    }

    // Helm from behind — two-tone shade matches Side/Front so the shape
    // reads as plate instead of a bald scalp, plus a brow-rim band at
    // the helmet base and a centre seam down the back where the two
    // plate halves meet. Without these cues the back view lost the
    // helmet entirely.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.8);
    if (head > 0.5)
    {
        color = (px.y >= hc.y) ? _KnightArmor.rgb : _KnightArmorShade.rgb;
        alpha = 1.0;
    }
    // Brow / nuchal rim — darker row at the helmet base.
    float brow = rectMask(px, hc + float2(-2, -1), float2(5, 1));
    if (brow > 0.5 && head > 0.5) color = _KnightArmorShade.rgb * 0.65;
    // Centre seam — thin darker column straight down the back.
    float seam = rectMask(px, hc + float2(0, 0), float2(1, 2));
    if (seam > 0.5 && head > 0.5) color = _KnightArmorShade.rgb * 0.75;

    // Horsehair crest from behind — 3 horizontal pixels above the crown.
    float plumeA = rectMask(px, hc + float2(-1, 2), float2(1, 1));
    float plumeB = rectMask(px, hc + float2( 0, 2), float2(1, 1));
    float plumeC = rectMask(px, hc + float2( 1, 2), float2(1, 1));
    if (plumeA > 0.5 || plumeB > 0.5 || plumeC > 0.5)
    {
        color = _KnightPlume.rgb;
        alpha = 1.0;
    }

    // Legs.
    bool leftDown = (legSwap > 0.5);
    float lH = leftDown ? 3.0 : 2.0;
    float rH = leftDown ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5)
    {
        color = _KnightArmorShade.rgb;
        alpha = 1.0;
    }
}

// ---- front view (south; facing the camera) ----------------------------------
void DrawKnightFront(inout float3 color, inout float alpha, float2 px,
                     float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Breastplate.
    float body = rectMask(px, c + float2(-2, -2), float2(5, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _KnightArmor.rgb : _KnightArmorShade.rgb;
        alpha = 1.0;
    }

    // Pauldrons.
    float pauldronL = step(length(px - (c + float2(-2.5, 1))), 0.6);
    float pauldronR = step(length(px - (c + float2( 2.5, 1))), 0.6);
    if (pauldronL > 0.5 || pauldronR > 0.5)
    {
        color = _KnightArmor.rgb;
        alpha = 1.0;
    }

    // Helm.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.8);
    if (head > 0.5)
    {
        color = (px.y >= hc.y) ? _KnightArmor.rgb : _KnightArmorShade.rgb;
        alpha = 1.0;
    }
    // Visor slit — horizontal 2-pixel dark band across the faceplate.
    float visor = rectMask(px, hc + float2(-1, 0), float2(3, 1));
    if (visor > 0.5 && head > 0.5)
    {
        color = _KnightArmorShade.rgb * 0.45;
        alpha = 1.0;
    }

    // Horsehair crest from the front — 3 horizontal pixels, matches the
    // side/back silhouette so facing changes don't pop a new shape.
    float plumeA = rectMask(px, hc + float2(-1, 2), float2(1, 1));
    float plumeB = rectMask(px, hc + float2( 0, 2), float2(1, 1));
    float plumeC = rectMask(px, hc + float2( 1, 2), float2(1, 1));
    if (plumeA > 0.5 || plumeB > 0.5 || plumeC > 0.5)
    {
        color = _KnightPlume.rgb;
        alpha = 1.0;
    }

    // Legs.
    bool leftDown = (legSwap > 0.5);
    float lH = leftDown ? 3.0 : 2.0;
    float rH = leftDown ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5)
    {
        color = _KnightArmorShade.rgb;
        alpha = 1.0;
    }
}

// Hand anchor for a weapon in the knight's sword hand. Returned in
// unflipped pixel space — the unit shader mirrors for West externally.
float2 KnightWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    if (facing == 1) return c + float2( 2.0, 0);   // North: behind right shoulder
    if (facing == 3) return c + float2( 2.0, -1);  // South: held at right side
    return c + float2( 2.2, -1);                   // East / West: extended forward
}

// ---- dispatch ---------------------------------------------------------------
void DrawKnight(inout float3 color, inout float alpha, float2 px, float grid,
                float seed, int facing)
{
    if (facing == 0)
    {
        DrawKnightSide(color, alpha, px, grid, seed);
    }
    else if (facing == 1)
    {
        DrawKnightBack(color, alpha, px, grid, seed);
    }
    else if (facing == 2)
    {
        px.x = grid - 1.0 - px.x;
        DrawKnightSide(color, alpha, px, grid, seed);
    }
    else
    {
        DrawKnightFront(color, alpha, px, grid, seed);
    }
}

#endif // RAREICON_HEX_KNIGHT_INCLUDED

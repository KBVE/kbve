#ifndef RAREICON_HEX_GOBLIN_GENERAL_INCLUDED
#define RAREICON_HEX_GOBLIN_GENERAL_INCLUDED

// Warlord variant of the Goblin — same humanoid footprint but with a
// dark iron chestplate over the cloth, a spiked gold crown-helm, a red
// warpaint stripe across the face, and a small cloak/cape flick at the
// back for silhouette. Reads as a "boss goblin" at a glance so players
// notice which to focus-fire.
//
// Uniforms: _GoblinGeneralSkin, _GoblinGeneralSkinShade,
//           _GoblinGeneralArmor, _GoblinGeneralArmorShade,
//           _GoblinGeneralCrown, _GoblinGeneralCloak,
//           _GoblinGeneralEye, _GoblinGeneralWarpaint

void DrawGoblinGeneralSide(inout float3 color, inout float alpha, float2 px,
                           float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Chestplate torso.
    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _GoblinGeneralArmor.rgb : _GoblinGeneralArmorShade.rgb;
        alpha = 1.0;
    }

    // Cloak flick trailing off the back shoulder.
    float cloak = rectMask(px, c + float2(-2, 0), float2(1, 2));
    if (cloak > 0.5) { color = _GoblinGeneralCloak.rgb; alpha = 1.0; }

    // Head — green skin with a jagged pointed ear toward the back.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5)
    {
        color = (px.y >= hc.y) ? _GoblinGeneralSkin.rgb : _GoblinGeneralSkinShade.rgb;
        alpha = 1.0;
    }
    float ear = rectMask(px, hc + float2(-2, 0), float2(1, 1));
    if (ear > 0.5) { color = _GoblinGeneralSkin.rgb; alpha = 1.0; }

    // Crown-helm — spiked band across the forehead.
    float band  = rectMask(px, hc + float2(-1, 0), float2(3, 1));
    float spike = rectMask(px, hc + float2(0, 1), float2(1, 1));
    if (band > 0.5 || spike > 0.5) { color = _GoblinGeneralCrown.rgb; alpha = 1.0; }

    // Warpaint — single red bar below the eye.
    float paint = rectMask(px, hc + float2(0, -1), float2(2, 1));
    if (paint > 0.5 && head > 0.5) { color = _GoblinGeneralWarpaint.rgb; alpha = 1.0; }

    // Forward eye — glowing yellow.
    float eye = step(length(px - (hc + float2(0.7, 0))), 0.45);
    if (eye > 0.5 && head > 0.5) { color = _GoblinGeneralEye.rgb; alpha = 1.0; }

    // Legs — iron greaves.
    float frontLegX = (legSwap > 0.5) ?  1.0 : -1.0;
    float backLegX  = (legSwap > 0.5) ? -1.0 :  1.0;
    bool  frontDown = (legSwap > 0.5);
    float frontH = frontDown ? 3.0 : 2.0;
    float backH  = frontDown ? 2.0 : 3.0;
    float legBack  = rectMask(px, c + float2(backLegX,  -1.0 - backH),  float2(1, backH));
    float legFront = rectMask(px, c + float2(frontLegX, -1.0 - frontH), float2(1, frontH));
    if (legBack  > 0.5) { color = _GoblinGeneralArmorShade.rgb; alpha = 1.0; }
    if (legFront > 0.5) { color = _GoblinGeneralArmor.rgb;      alpha = 1.0; }
}

void DrawGoblinGeneralBack(inout float3 color, inout float alpha, float2 px,
                           float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _GoblinGeneralArmor.rgb : _GoblinGeneralArmorShade.rgb;
        alpha = 1.0;
    }

    // Full cloak draped down the back — outer columns only, spine column stays armor.
    float cloakL = rectMask(px, c + float2(-1, -2), float2(1, 3));
    float cloakR = rectMask(px, c + float2( 1, -2), float2(1, 3));
    if (cloakL > 0.5 || cloakR > 0.5) { color = _GoblinGeneralCloak.rgb; alpha = 1.0; }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.6);
    if (head > 0.5) { color = _GoblinGeneralSkinShade.rgb; alpha = 1.0; }

    // Crown visible from the rear.
    float band  = rectMask(px, hc + float2(-1, 0), float2(3, 1));
    float spike = rectMask(px, hc + float2(0, 1), float2(1, 1));
    if (band > 0.5 || spike > 0.5) { color = _GoblinGeneralCrown.rgb; alpha = 1.0; }

    // Pointed ears to both sides.
    float earL = rectMask(px, hc + float2(-2, 0), float2(1, 1));
    float earR = rectMask(px, hc + float2( 2, 0), float2(1, 1));
    if (earL > 0.5 || earR > 0.5) { color = _GoblinGeneralSkinShade.rgb; alpha = 1.0; }

    float lH = (legSwap > 0.5) ? 3.0 : 2.0;
    float rH = (legSwap > 0.5) ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _GoblinGeneralArmorShade.rgb; alpha = 1.0; }
}

void DrawGoblinGeneralFront(inout float3 color, inout float alpha, float2 px,
                            float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _GoblinGeneralArmor.rgb : _GoblinGeneralArmorShade.rgb;
        alpha = 1.0;
    }

    // Cloak fringe trailing outside the torso.
    float cloakL = rectMask(px, c + float2(-2,  0), float2(1, 1));
    float cloakR = rectMask(px, c + float2( 2,  0), float2(1, 1));
    if (cloakL > 0.5 || cloakR > 0.5) { color = _GoblinGeneralCloak.rgb; alpha = 1.0; }

    // Centre rivet on the chestplate.
    float rivet = rectMask(px, c + float2(0, 0), float2(1, 1));
    if (rivet > 0.5 && body > 0.5) { color = _GoblinGeneralCrown.rgb; alpha = 1.0; }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5)
    {
        color = (px.y >= hc.y) ? _GoblinGeneralSkin.rgb : _GoblinGeneralSkinShade.rgb;
        alpha = 1.0;
    }

    // Crown with three spikes.
    float band   = rectMask(px, hc + float2(-1, 0), float2(3, 1));
    float spikeC = rectMask(px, hc + float2( 0, 1), float2(1, 1));
    float spikeL = rectMask(px, hc + float2(-1, 1), float2(1, 1));
    float spikeR = rectMask(px, hc + float2( 1, 1), float2(1, 1));
    if (band > 0.5 || spikeC > 0.5 || spikeL > 0.5 || spikeR > 0.5)
    {
        color = _GoblinGeneralCrown.rgb;
        alpha = 1.0;
    }

    // Warpaint horizontal bar across both eyes.
    float paint = rectMask(px, hc + float2(-1, -1), float2(3, 1));
    if (paint > 0.5 && head > 0.5) { color = _GoblinGeneralWarpaint.rgb; alpha = 1.0; }

    // Two glowing eyes.
    float eyeL = step(length(px - (hc + float2(-0.6, 0.2))), 0.4);
    float eyeR = step(length(px - (hc + float2( 0.6, 0.2))), 0.4);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5) { color = _GoblinGeneralEye.rgb; alpha = 1.0; }

    // Pointed ears.
    float earL = rectMask(px, hc + float2(-2, 0), float2(1, 1));
    float earR = rectMask(px, hc + float2( 2, 0), float2(1, 1));
    if (earL > 0.5 || earR > 0.5) { color = _GoblinGeneralSkin.rgb; alpha = 1.0; }

    float lH = (legSwap > 0.5) ? 3.0 : 2.0;
    float rH = (legSwap > 0.5) ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _GoblinGeneralArmorShade.rgb; alpha = 1.0; }
}

// Same hand as the plain Goblin so the Club composites cleanly; could
// divert to a sword anchor later when a Sword weapon slot lands.
float2 GoblinGeneralWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    if (facing == 1) return c + float2( 2.0,  0);
    if (facing == 3) return c + float2( 2.0, -1);
    return c + float2( 2.2, -1);
}

void DrawGoblinGeneral(inout float3 color, inout float alpha, float2 px, float grid,
                       float seed, int facing)
{
    if (facing == 0)      DrawGoblinGeneralSide(color, alpha, px, grid, seed);
    else if (facing == 1) DrawGoblinGeneralBack(color, alpha, px, grid, seed);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawGoblinGeneralSide(color, alpha, px, grid, seed); }
    else                  DrawGoblinGeneralFront(color, alpha, px, grid, seed);
}

#endif

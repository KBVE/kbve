#ifndef RAREICON_HEX_ROGUE_INCLUDED
#define RAREICON_HEX_ROGUE_INCLUDED

// Dark-hooded dual-dagger rogue. Slimmer silhouette reading: full hood +
// face scarf (only eyes visible), tight dark leather, and sheathed dagger
// marks on both hips — the sheaths live on the body so the unit reads as
// "rogue" even when the weapon slot is empty. Weapon anchor sits low at
// the hip for a drawn-dagger pose.
//
// Uniforms: _RogueCloak, _RogueCloakShade, _RoguePants, _RogueSkin,
//           _RogueScarf, _RogueEye, _RogueDagger

void DrawRogueSide(inout float3 color, inout float alpha, float2 px,
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
        color = (px.y >= c.y - 1) ? _RogueCloak.rgb : _RogueCloakShade.rgb;
        alpha = 1.0;
    }

    // Sheathed dagger on the forward hip — single pixel.
    float sheath = rectMask(px, c + float2(1, -2), float2(1, 1));
    if (sheath > 0.5) { color = _RogueDagger.rgb; alpha = 1.0; }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.6);
    if (head > 0.5) { color = _RogueSkin.rgb; alpha = 1.0; }

    // Hood wraps the upper head.
    float hood = rectMask(px, hc + float2(-1, 0), float2(3, 2));
    if (hood > 0.5) { color = _RogueCloak.rgb; alpha = 1.0; }

    // Scarf across the lower face.
    float scarf = rectMask(px, hc + float2(-1, -1), float2(3, 1));
    if (scarf > 0.5 && head > 0.5) { color = _RogueScarf.rgb; alpha = 1.0; }

    // Single forward eye, bright.
    float eye = step(length(px - (hc + float2(0.6, 0.2))), 0.45);
    if (eye > 0.5 && head > 0.5) { color = _RogueEye.rgb; alpha = 1.0; }

    // Legs.
    float frontLegX = (legSwap > 0.5) ?  1.0 : -1.0;
    float backLegX  = (legSwap > 0.5) ? -1.0 :  1.0;
    bool  frontDown = (legSwap > 0.5);
    float frontH = frontDown ? 3.0 : 2.0;
    float backH  = frontDown ? 2.0 : 3.0;
    float legBack  = rectMask(px, c + float2(backLegX,  -1.0 - backH),  float2(1, backH));
    float legFront = rectMask(px, c + float2(frontLegX, -1.0 - frontH), float2(1, frontH));
    if (legBack  > 0.5) { color = _RoguePants.rgb * 0.6; alpha = 1.0; }
    if (legFront > 0.5) { color = _RoguePants.rgb;       alpha = 1.0; }
}

void DrawRogueBack(inout float3 color, inout float alpha, float2 px,
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
        color = (px.y >= c.y - 1) ? _RogueCloak.rgb : _RogueCloakShade.rgb;
        alpha = 1.0;
    }

    // Crossed dagger hilts on the lower back.
    float sheathL = rectMask(px, c + float2(-1, -2), float2(1, 1));
    float sheathR = rectMask(px, c + float2( 1, -2), float2(1, 1));
    if (sheathL > 0.5 || sheathR > 0.5) { color = _RogueDagger.rgb; alpha = 1.0; }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.5);
    if (head > 0.5) { color = _RogueCloakShade.rgb; alpha = 1.0; }

    float lH = (legSwap > 0.5) ? 3.0 : 2.0;
    float rH = (legSwap > 0.5) ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _RoguePants.rgb; alpha = 1.0; }
}

void DrawRogueFront(inout float3 color, inout float alpha, float2 px,
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
        color = (px.y >= c.y - 1) ? _RogueCloak.rgb : _RogueCloakShade.rgb;
        alpha = 1.0;
    }

    // Sheathed daggers on both hips.
    float sheathL = rectMask(px, c + float2(-2, -2), float2(1, 1));
    float sheathR = rectMask(px, c + float2( 2, -2), float2(1, 1));
    if (sheathL > 0.5 || sheathR > 0.5) { color = _RogueDagger.rgb; alpha = 1.0; }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.6);
    if (head > 0.5) { color = _RogueSkin.rgb; alpha = 1.0; }

    float hood = rectMask(px, hc + float2(-1, 0), float2(3, 2));
    if (hood > 0.5) { color = _RogueCloak.rgb; alpha = 1.0; }

    float scarf = rectMask(px, hc + float2(-1, -1), float2(3, 1));
    if (scarf > 0.5 && head > 0.5) { color = _RogueScarf.rgb; alpha = 1.0; }

    float eyeL = step(length(px - (hc + float2(-0.6, 0.2))), 0.4);
    float eyeR = step(length(px - (hc + float2( 0.6, 0.2))), 0.4);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5) { color = _RogueEye.rgb; alpha = 1.0; }

    float lH = (legSwap > 0.5) ? 3.0 : 2.0;
    float rH = (legSwap > 0.5) ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _RoguePants.rgb; alpha = 1.0; }
}

// Drawn-dagger hand — lower than the Soldier anchor so a short blade
// sits against the hip instead of projecting forward like a sword.
float2 RogueWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    if (facing == 1) return c + float2( 1.8, -1);
    if (facing == 3) return c + float2( 1.8, -2);
    return c + float2( 2.0, -2);
}

void DrawRogue(inout float3 color, inout float alpha, float2 px, float grid,
               float seed, int facing)
{
    if (facing == 0)      DrawRogueSide(color, alpha, px, grid, seed);
    else if (facing == 1) DrawRogueBack(color, alpha, px, grid, seed);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawRogueSide(color, alpha, px, grid, seed); }
    else                  DrawRogueFront(color, alpha, px, grid, seed);
}

#endif

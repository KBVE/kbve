#ifndef RAREICON_HEX_ARCHER_INCLUDED
#define RAREICON_HEX_ARCHER_INCLUDED

// Human ranger — Soldier proportions with a hood, leather jerkin in forest
// tones, and a quiver strap across the chest with 2-pixel arrow fletching
// peeking over the shoulder so the silhouette reads "archer" even before
// the bow/crossbow weapon slot composites on top. Single forward eye
// glints through the shadow under the hood.
//
// Uniforms: _ArcherHood, _ArcherHoodShade, _ArcherVest, _ArcherVestShade,
//           _ArcherPants, _ArcherSkin, _ArcherQuiver, _ArcherFletching

void DrawArcherSide(inout float3 color, inout float alpha, float2 px,
                    float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Jerkin torso.
    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _ArcherVest.rgb : _ArcherVestShade.rgb;
        alpha = 1.0;
    }

    // Diagonal quiver strap across chest — 2 pixels running down-forward.
    float strap1 = rectMask(px, c + float2(-1, 0), float2(1, 1));
    float strap2 = rectMask(px, c + float2( 0, -1), float2(1, 1));
    if ((strap1 > 0.5 || strap2 > 0.5) && body > 0.5)
    {
        color = _ArcherQuiver.rgb;
        alpha = 1.0;
    }

    // Head — hood-shadowed skin.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5) { color = _ArcherSkin.rgb; alpha = 1.0; }

    // Hood — covers upper half + flicks down the back of the neck.
    float hood    = rectMask(px, hc + float2(-1, 0), float2(3, 2));
    float hoodTie = rectMask(px, hc + float2(-2, 0), float2(1, 1));
    if (hood > 0.5 || hoodTie > 0.5)
    {
        color = (px.y >= hc.y + 1) ? _ArcherHoodShade.rgb : _ArcherHood.rgb;
        alpha = 1.0;
    }

    // Forward eye slit peeking from under the hood.
    float eye = step(length(px - (hc + float2(0.6, 0))), 0.45);
    if (eye > 0.5 && head > 0.5)
    {
        color = _ArcherFletching.rgb;
        alpha = 1.0;
    }

    // Quiver + fletching — two pixels rising behind the shoulder.
    float fletchA = rectMask(px, c + float2(-2, 2), float2(1, 1));
    float fletchB = rectMask(px, c + float2(-2, 3), float2(1, 1));
    if (fletchA > 0.5) { color = _ArcherQuiver.rgb;    alpha = 1.0; }
    if (fletchB > 0.5) { color = _ArcherFletching.rgb; alpha = 1.0; }

    // Legs.
    float frontLegX = (legSwap > 0.5) ?  1.0 : -1.0;
    float backLegX  = (legSwap > 0.5) ? -1.0 :  1.0;
    bool  frontDown = (legSwap > 0.5);
    float frontH = frontDown ? 3.0 : 2.0;
    float backH  = frontDown ? 2.0 : 3.0;
    float legBack  = rectMask(px, c + float2(backLegX,  -1.0 - backH),  float2(1, backH));
    float legFront = rectMask(px, c + float2(frontLegX, -1.0 - frontH), float2(1, frontH));
    if (legBack  > 0.5) { color = _ArcherPants.rgb * 0.7; alpha = 1.0; }
    if (legFront > 0.5) { color = _ArcherPants.rgb;       alpha = 1.0; }
}

void DrawArcherBack(inout float3 color, inout float alpha, float2 px,
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
        color = (px.y >= c.y - 1) ? _ArcherVest.rgb : _ArcherVestShade.rgb;
        alpha = 1.0;
    }

    // Quiver centred on the back — 1×2 body with a fletching row.
    float quiver = rectMask(px, c + float2(0, 1), float2(1, 2));
    if (quiver > 0.5) { color = _ArcherQuiver.rgb; alpha = 1.0; }
    float fletchRow = rectMask(px, c + float2(0, 3), float2(1, 1));
    if (fletchRow > 0.5) { color = _ArcherFletching.rgb; alpha = 1.0; }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.6);
    if (head > 0.5) { color = _ArcherSkin.rgb; alpha = 1.0; }

    float hood = rectMask(px, hc + float2(-1, 0), float2(3, 2));
    if (hood > 0.5) { color = _ArcherHood.rgb; alpha = 1.0; }

    // Legs.
    float lH = (legSwap > 0.5) ? 3.0 : 2.0;
    float rH = (legSwap > 0.5) ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _ArcherPants.rgb; alpha = 1.0; }
}

void DrawArcherFront(inout float3 color, inout float alpha, float2 px,
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
        color = (px.y >= c.y - 1) ? _ArcherVest.rgb : _ArcherVestShade.rgb;
        alpha = 1.0;
    }

    // Strap crosses from one shoulder diagonally down — 2 pixels.
    float strap1 = rectMask(px, c + float2(-1, 1), float2(1, 1));
    float strap2 = rectMask(px, c + float2( 0, 0), float2(1, 1));
    if (strap1 > 0.5 || strap2 > 0.5) { color = _ArcherQuiver.rgb; alpha = 1.0; }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5) { color = _ArcherSkin.rgb; alpha = 1.0; }

    // Hood brim.
    float hood = rectMask(px, hc + float2(-1, 0), float2(3, 2));
    if (hood > 0.5) { color = _ArcherHood.rgb; alpha = 1.0; }

    // Two eyes glinting in hood shadow.
    float eyeL = step(length(px - (hc + float2(-0.6, 0.1))), 0.4);
    float eyeR = step(length(px - (hc + float2( 0.6, 0.1))), 0.4);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5)
    {
        color = _ArcherFletching.rgb;
        alpha = 1.0;
    }

    float lH = (legSwap > 0.5) ? 3.0 : 2.0;
    float rH = (legSwap > 0.5) ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _ArcherPants.rgb; alpha = 1.0; }
}

float2 ArcherWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    if (facing == 1) return c + float2( 2.0,  0);
    if (facing == 3) return c + float2( 2.0, -1);
    return c + float2( 2.2, -1);
}

void DrawArcher(inout float3 color, inout float alpha, float2 px, float grid,
                float seed, int facing)
{
    if (facing == 0)      DrawArcherSide(color, alpha, px, grid, seed);
    else if (facing == 1) DrawArcherBack(color, alpha, px, grid, seed);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawArcherSide(color, alpha, px, grid, seed); }
    else                  DrawArcherFront(color, alpha, px, grid, seed);
}

#endif

#ifndef RAREICON_HEX_MERCHANT_INCLUDED
#define RAREICON_HEX_MERCHANT_INCLUDED

// Travelling merchant — flat cap, cream shirt under a buttoned vest, a
// bulging coin pouch on the forward hip. No weapon read; palette hints
// "coin" (gold trim on the cap + pouch) so the unit is recognisable at
// glance as the trader civilian.
//
// Uniforms: _MerchantCap, _MerchantVest, _MerchantVestShade,
//           _MerchantShirt, _MerchantPants, _MerchantSkin, _MerchantPouch

void DrawMerchantSide(inout float3 color, inout float alpha, float2 px,
                      float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Vest over shirt.
    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _MerchantVest.rgb : _MerchantVestShade.rgb;
        alpha = 1.0;
    }
    // Shirt column down the centre (open vest).
    float shirt = rectMask(px, c + float2(0, -1), float2(1, 2));
    if (shirt > 0.5) { color = _MerchantShirt.rgb; alpha = 1.0; }

    // Coin pouch on forward hip.
    float pouch = rectMask(px, c + float2(1, -2), float2(1, 1));
    if (pouch > 0.5) { color = _MerchantPouch.rgb; alpha = 1.0; }

    // Head.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5) { color = _MerchantSkin.rgb; alpha = 1.0; }

    // Flat cap — wide brim + crown.
    float capBrim  = rectMask(px, hc + float2(-2, 0), float2(5, 1));
    float capCrown = rectMask(px, hc + float2(-1, 1), float2(3, 1));
    if (capBrim > 0.5 || capCrown > 0.5) { color = _MerchantCap.rgb; alpha = 1.0; }

    // Forward eye.
    float eye = step(length(px - (hc + float2(0.6, -0.2))), 0.45);
    if (eye > 0.5 && head > 0.5) { color = _MerchantVestShade.rgb; alpha = 1.0; }

    // Legs.
    float frontLegX = (legSwap > 0.5) ?  1.0 : -1.0;
    float backLegX  = (legSwap > 0.5) ? -1.0 :  1.0;
    bool  frontDown = (legSwap > 0.5);
    float frontH = frontDown ? 3.0 : 2.0;
    float backH  = frontDown ? 2.0 : 3.0;
    float legBack  = rectMask(px, c + float2(backLegX,  -1.0 - backH),  float2(1, backH));
    float legFront = rectMask(px, c + float2(frontLegX, -1.0 - frontH), float2(1, frontH));
    if (legBack  > 0.5) { color = _MerchantPants.rgb * 0.7; alpha = 1.0; }
    if (legFront > 0.5) { color = _MerchantPants.rgb;       alpha = 1.0; }
}

void DrawMerchantBack(inout float3 color, inout float alpha, float2 px,
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
        color = (px.y >= c.y - 1) ? _MerchantVest.rgb : _MerchantVestShade.rgb;
        alpha = 1.0;
    }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.6);
    if (head > 0.5) { color = _MerchantSkin.rgb; alpha = 1.0; }

    float capBrim  = rectMask(px, hc + float2(-2, 0), float2(5, 1));
    float capCrown = rectMask(px, hc + float2(-1, 1), float2(3, 1));
    if (capBrim > 0.5 || capCrown > 0.5) { color = _MerchantCap.rgb; alpha = 1.0; }

    float lH = (legSwap > 0.5) ? 3.0 : 2.0;
    float rH = (legSwap > 0.5) ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _MerchantPants.rgb; alpha = 1.0; }
}

void DrawMerchantFront(inout float3 color, inout float alpha, float2 px,
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
        color = (px.y >= c.y - 1) ? _MerchantVest.rgb : _MerchantVestShade.rgb;
        alpha = 1.0;
    }

    // Shirt V-opening + button dots.
    float shirt = rectMask(px, c + float2(0, -1), float2(1, 2));
    if (shirt > 0.5) { color = _MerchantShirt.rgb; alpha = 1.0; }
    float button = rectMask(px, c + float2(0, 0), float2(1, 1));
    if (button > 0.5) { color = _MerchantCap.rgb; alpha = 1.0; }

    // Pouches on both hips.
    float pouchL = rectMask(px, c + float2(-2, -2), float2(1, 1));
    float pouchR = rectMask(px, c + float2( 2, -2), float2(1, 1));
    if (pouchL > 0.5 || pouchR > 0.5) { color = _MerchantPouch.rgb; alpha = 1.0; }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5) { color = _MerchantSkin.rgb; alpha = 1.0; }

    float capBrim  = rectMask(px, hc + float2(-2, 0), float2(5, 1));
    float capCrown = rectMask(px, hc + float2(-1, 1), float2(3, 1));
    if (capBrim > 0.5 || capCrown > 0.5) { color = _MerchantCap.rgb; alpha = 1.0; }

    float eyeL = step(length(px - (hc + float2(-0.6, -0.2))), 0.4);
    float eyeR = step(length(px - (hc + float2( 0.6, -0.2))), 0.4);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5) { color = _MerchantVestShade.rgb; alpha = 1.0; }

    float lH = (legSwap > 0.5) ? 3.0 : 2.0;
    float rH = (legSwap > 0.5) ? 2.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _MerchantPants.rgb; alpha = 1.0; }
}

float2 MerchantWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    if (facing == 1) return c + float2( 2.0,  0);
    if (facing == 3) return c + float2( 2.0, -1);
    return c + float2( 2.0, -1);
}

void DrawMerchant(inout float3 color, inout float alpha, float2 px, float grid,
                  float seed, int facing)
{
    if (facing == 0)      DrawMerchantSide(color, alpha, px, grid, seed);
    else if (facing == 1) DrawMerchantBack(color, alpha, px, grid, seed);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawMerchantSide(color, alpha, px, grid, seed); }
    else                  DrawMerchantFront(color, alpha, px, grid, seed);
}

#endif

#ifndef RAREICON_HEX_CHICKEN_INCLUDED
#define RAREICON_HEX_CHICKEN_INCLUDED

// Small, low-profile bird. 3-wide oval body, tiny head with a red comb, orange
// beak, thin legs that alternate up/down on the step. Back view hides the
// face and shows the comb from behind; front view doubles the eyes.
//
// Uniforms: _ChickenBody, _ChickenBodyShade, _ChickenComb, _ChickenBeak,
//           _ChickenLeg, _ChickenEye
// Helpers: rectMask, circleMask (HexShared.hlsl) +
//          _UnitShadow, _UnitStep, _UnitBob (HexUnitAnim.hlsl).

void DrawChickenSide(inout float3 color, inout float alpha, float2 px,
                     float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.42));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Body — egg-shaped (flatter bottom).
    float body = circleMask(px, c, 2.1) * step(px.y, c.y + 1.5);
    if (body > 0.5)
    {
        color = (px.y >= c.y) ? _ChickenBody.rgb : _ChickenBodyShade.rgb;
        alpha = 1.0;
    }

    // Tail feather — small triangle at the back-top.
    float tail = rectMask(px, c + float2(-3, 0), float2(1, 2));
    if (tail > 0.5) { color = _ChickenBodyShade.rgb; alpha = 1.0; }

    // Head — small, forward-up from body.
    float2 hc = c + float2(1.5, 2);
    float head = circleMask(px, hc, 1.2);
    if (head > 0.5)
    {
        color = _ChickenBody.rgb;
        alpha = 1.0;
    }

    // Comb — single red pixel on top of head.
    float comb = rectMask(px, hc + float2(0, 1), float2(1, 1));
    if (comb > 0.5) { color = _ChickenComb.rgb; alpha = 1.0; }

    // Beak — single orange pixel forward of head.
    float beak = rectMask(px, hc + float2(2, 0), float2(1, 1));
    if (beak > 0.5) { color = _ChickenBeak.rgb; alpha = 1.0; }

    // Eye — 1 black pixel on the forward side of the head.
    float eye = step(length(px - (hc + float2(1, 0.3))), 0.45);
    if (eye > 0.5 && head > 0.5) { color = _ChickenEye.rgb; alpha = 1.0; }

    // Legs LAST — two thin vertical pixels that swap length for the step.
    float frontH = (legSwap > 0.5) ? 2.0 : 1.0;
    float backH  = (legSwap > 0.5) ? 1.0 : 2.0;
    float legBack  = rectMask(px, c + float2(-1, -1.0 - backH),  float2(1, backH));
    float legFront = rectMask(px, c + float2( 1, -1.0 - frontH), float2(1, frontH));
    if (legBack  > 0.5 || legFront > 0.5) { color = _ChickenLeg.rgb; alpha = 1.0; }
}

void DrawChickenBack(inout float3 color, inout float alpha, float2 px,
                     float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.42));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Wider, squatter body than side view — we see the full rear.
    float body = rectMask(px, c + float2(-2, -1), float2(5, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y + 1) ? _ChickenBody.rgb : _ChickenBodyShade.rgb;
        alpha = 1.0;
    }

    // Head peeking over the top, no face features visible.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.1);
    if (head > 0.5) { color = _ChickenBody.rgb; alpha = 1.0; }

    // Comb — red pixel on top-centre of head.
    float comb = rectMask(px, hc + float2(0, 1), float2(1, 1));
    if (comb > 0.5) { color = _ChickenComb.rgb; alpha = 1.0; }

    // Two legs visible at the rear.
    float lH = (legSwap > 0.5) ? 2.0 : 1.0;
    float rH = (legSwap > 0.5) ? 1.0 : 2.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _ChickenLeg.rgb; alpha = 1.0; }
}

void DrawChickenFront(inout float3 color, inout float alpha, float2 px,
                      float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.42));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float body = rectMask(px, c + float2(-2, -1), float2(5, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y + 1) ? _ChickenBody.rgb : _ChickenBodyShade.rgb;
        alpha = 1.0;
    }

    // Head with two dark eyes + centre beak.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.2);
    if (head > 0.5) { color = _ChickenBody.rgb; alpha = 1.0; }

    float comb = rectMask(px, hc + float2(0, 1), float2(1, 1));
    if (comb > 0.5) { color = _ChickenComb.rgb; alpha = 1.0; }

    float beak = rectMask(px, hc + float2(0, -1), float2(1, 1));
    if (beak > 0.5) { color = _ChickenBeak.rgb; alpha = 1.0; }

    float eyeL = step(length(px - (hc + float2(-0.7, 0))), 0.4);
    float eyeR = step(length(px - (hc + float2( 0.7, 0))), 0.4);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5) { color = _ChickenEye.rgb; alpha = 1.0; }

    // Two legs front-and-centre.
    float lH = (legSwap > 0.5) ? 2.0 : 1.0;
    float rH = (legSwap > 0.5) ? 1.0 : 2.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _ChickenLeg.rgb; alpha = 1.0; }
}

void DrawChicken(inout float3 color, inout float alpha, float2 px, float grid,
                 float seed, int facing)
{
    if (facing == 0)      DrawChickenSide(color, alpha, px, grid, seed);
    else if (facing == 1) DrawChickenBack(color, alpha, px, grid, seed);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawChickenSide(color, alpha, px, grid, seed); }
    else                  DrawChickenFront(color, alpha, px, grid, seed);
}

#endif // RAREICON_HEX_CHICKEN_INCLUDED

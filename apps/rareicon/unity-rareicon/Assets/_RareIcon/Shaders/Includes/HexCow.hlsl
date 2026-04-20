#ifndef RAREICON_HEX_COW_INCLUDED
#define RAREICON_HEX_COW_INCLUDED

// Chunky bovine — 5-wide body, rectangular head with two short horns, dangling
// tail, and hash-based patches painted in a contrasting body tone so each
// cow's spots are unique. Back view shows rump + tail, front view shows face
// with eyes + muzzle.
//
// Uniforms: _CowBodyA (pale), _CowBodyB (dark patches), _CowHorn, _CowHoof,
//           _CowNose, _CowEye
// Helpers: rectMask, circleMask, hash21 (HexShared.hlsl) +
//          _UnitShadow, _UnitStep, _UnitBob (HexUnitAnim.hlsl).

// Returns 1 if this pixel lies inside a hash-placed spot patch. Patches are
// a small fixed set of circles keyed off the per-cow seed so each cow gets
// a different pattern, but a single cow keeps the same pattern between
// frames and facings.
float _CowSpotMask(float2 px, float2 c, float seed)
{
    float s = 0.0;
    [unroll]
    for (int i = 0; i < 4; i++)
    {
        float si = seed + (float)i * 7.0;
        float2 p = c + float2(
            (hash21(float2(si, 11.0)) - 0.5) * 5.5,
            (hash21(float2(si, 12.0)) - 0.5) * 2.6);
        float r = 0.9 + hash21(float2(si, 13.0)) * 0.7;
        s = max(s, step(length(px - p), r));
    }
    return s;
}

void DrawCowSide(inout float3 color, inout float alpha, float2 px,
                 float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.44));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Body — wide rectangle + rounded corners via circle overlays.
    float bodyRect = rectMask(px, c + float2(-3, -1), float2(7, 3));
    float bodyL    = circleMask(px, c + float2(-3, 0), 1.5);
    float bodyR    = circleMask(px, c + float2( 3, 0), 1.5);
    float body     = max(bodyRect, max(bodyL, bodyR));
    if (body > 0.5)
    {
        // Base coat then spot overlay.
        color = (px.y >= c.y) ? _CowBodyA.rgb : _CowBodyA.rgb * 0.9;
        alpha = 1.0;
        if (_CowSpotMask(px, c, seed) > 0.5)
            color = _CowBodyB.rgb;
    }

    // Head — forward block.
    float head = rectMask(px, c + float2(3, 0), float2(3, 2));
    if (head > 0.5) { color = _CowBodyA.rgb; alpha = 1.0; }

    // Muzzle — one darker pixel at the front.
    float muzzle = rectMask(px, c + float2(5, 0), float2(1, 1));
    if (muzzle > 0.5) { color = _CowNose.rgb; alpha = 1.0; }

    // Horn + eye.
    float horn = rectMask(px, c + float2(3, 2), float2(1, 1));
    if (horn > 0.5) { color = _CowHorn.rgb; alpha = 1.0; }
    float eye = step(length(px - (c + float2(4.2, 1))), 0.4);
    if (eye > 0.5 && head > 0.5) { color = _CowEye.rgb; alpha = 1.0; }

    // Tail — short dangle at the rear, tipped a pixel down.
    float tail  = rectMask(px, c + float2(-4, -1), float2(1, 2));
    float tuft  = rectMask(px, c + float2(-4, -2), float2(1, 1));
    if (tail > 0.5 || tuft > 0.5) { color = _CowBodyB.rgb; alpha = 1.0; }

    // 4 legs — front pair alternates with back pair for a trot.
    bool fwdDown = (legSwap > 0.5);
    float fH = fwdDown ? 3.0 : 2.0;
    float bH = fwdDown ? 2.0 : 3.0;
    float legFF = rectMask(px, c + float2( 2, -1.0 - fH), float2(1, fH));
    float legFB = rectMask(px, c + float2(-2, -1.0 - bH), float2(1, bH));
    float legBF = rectMask(px, c + float2( 1, -1.0 - bH), float2(1, bH));
    float legBB = rectMask(px, c + float2(-1, -1.0 - fH), float2(1, fH));
    if (legFF > 0.5 || legFB > 0.5 || legBF > 0.5 || legBB > 0.5)
    { color = _CowHoof.rgb; alpha = 1.0; }
}

void DrawCowBack(inout float3 color, inout float alpha, float2 px,
                 float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.44));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float bodyRect = rectMask(px, c + float2(-3, -1), float2(7, 3));
    float bodyL    = circleMask(px, c + float2(-3, 0), 1.5);
    float bodyR    = circleMask(px, c + float2( 3, 0), 1.5);
    float body     = max(bodyRect, max(bodyL, bodyR));
    if (body > 0.5)
    {
        color = _CowBodyA.rgb;
        alpha = 1.0;
        if (_CowSpotMask(px, c, seed) > 0.5)
            color = _CowBodyB.rgb;
    }

    // Tail centred out the back.
    float tail = rectMask(px, c + float2(0, -3), float2(1, 2));
    if (tail > 0.5) { color = _CowBodyB.rgb; alpha = 1.0; }

    // 4 rear hooves.
    bool lDown = (legSwap > 0.5);
    float lH = lDown ? 3.0 : 2.0;
    float rH = lDown ? 2.0 : 3.0;
    float leg1 = rectMask(px, c + float2(-2, -1.0 - lH), float2(1, lH));
    float leg2 = rectMask(px, c + float2(-1, -1.0 - rH), float2(1, rH));
    float leg3 = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    float leg4 = rectMask(px, c + float2( 2, -1.0 - lH), float2(1, lH));
    if (leg1 > 0.5 || leg2 > 0.5 || leg3 > 0.5 || leg4 > 0.5)
    { color = _CowHoof.rgb; alpha = 1.0; }
}

void DrawCowFront(inout float3 color, inout float alpha, float2 px,
                  float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.44));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Chest + head stacked. Chest wider, face above it.
    float chest = rectMask(px, c + float2(-3, -1), float2(7, 3));
    if (chest > 0.5)
    {
        color = _CowBodyA.rgb;
        alpha = 1.0;
        if (_CowSpotMask(px, c, seed) > 0.5)
            color = _CowBodyB.rgb;
    }

    float2 hc = c + float2(0, 2.5);
    float head = rectMask(px, hc + float2(-2, -1), float2(5, 3));
    if (head > 0.5) { color = _CowBodyA.rgb; alpha = 1.0; }

    // Horns poking up out the top corners.
    float hornL = rectMask(px, hc + float2(-2, 2), float2(1, 1));
    float hornR = rectMask(px, hc + float2( 2, 2), float2(1, 1));
    if (hornL > 0.5 || hornR > 0.5) { color = _CowHorn.rgb; alpha = 1.0; }

    // Eyes + muzzle.
    float eyeL = step(length(px - (hc + float2(-0.7, 0.3))), 0.45);
    float eyeR = step(length(px - (hc + float2( 0.7, 0.3))), 0.45);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5) { color = _CowEye.rgb; alpha = 1.0; }
    float muzzle = rectMask(px, hc + float2(-1, -1), float2(3, 1));
    if (muzzle > 0.5) { color = _CowNose.rgb; alpha = 1.0; }

    // 4 front legs (two visible front pair + two behind staggered).
    bool lDown = (legSwap > 0.5);
    float lH = lDown ? 3.0 : 2.0;
    float rH = lDown ? 2.0 : 3.0;
    float leg1 = rectMask(px, c + float2(-2, -1.0 - lH), float2(1, lH));
    float leg2 = rectMask(px, c + float2(-1, -1.0 - rH), float2(1, rH));
    float leg3 = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    float leg4 = rectMask(px, c + float2( 2, -1.0 - lH), float2(1, lH));
    if (leg1 > 0.5 || leg2 > 0.5 || leg3 > 0.5 || leg4 > 0.5)
    { color = _CowHoof.rgb; alpha = 1.0; }
}

void DrawCow(inout float3 color, inout float alpha, float2 px, float grid,
             float seed, int facing)
{
    if (facing == 0)      DrawCowSide(color, alpha, px, grid, seed);
    else if (facing == 1) DrawCowBack(color, alpha, px, grid, seed);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawCowSide(color, alpha, px, grid, seed); }
    else                  DrawCowFront(color, alpha, px, grid, seed);
}

#endif // RAREICON_HEX_COW_INCLUDED

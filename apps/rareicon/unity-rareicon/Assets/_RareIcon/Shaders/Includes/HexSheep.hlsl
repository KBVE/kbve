#ifndef RAREICON_HEX_SHEEP_INCLUDED
#define RAREICON_HEX_SHEEP_INCLUDED

// Cloud-shaped wool body with a small dark face poking out the front. Four
// thin legs in side view, two in back / front views. The wool silhouette is
// a three-circle bundle so the outline reads as puffy, not rectangular.
//
// Uniforms: _SheepWool, _SheepWoolShade, _SheepFace, _SheepLeg, _SheepEye
// Helpers: rectMask, circleMask (HexShared.hlsl) +
//          _UnitShadow, _UnitStep, _UnitBob (HexUnitAnim.hlsl).

void DrawSheepSide(inout float3 color, inout float alpha, float2 px,
                   float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.44));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Wool — three overlapping circles.
    float w1 = circleMask(px, c + float2(-1.5, 0.0), 2.0);
    float w2 = circleMask(px, c + float2( 0.5, 0.3), 2.0);
    float w3 = circleMask(px, c + float2( 2.0, 0.0), 1.8);
    float wool = max(w1, max(w2, w3));
    if (wool > 0.5)
    {
        color = (px.y >= c.y) ? _SheepWool.rgb : _SheepWoolShade.rgb;
        alpha = 1.0;
    }

    // Face — small dark blob poking forward.
    float2 hc = c + float2(2.8, -0.2);
    float head = circleMask(px, hc, 1.1);
    if (head > 0.5) { color = _SheepFace.rgb; alpha = 1.0; }

    float eye = step(length(px - (hc + float2(0.3, 0.3))), 0.4);
    if (eye > 0.5 && head > 0.5) { color = _SheepEye.rgb; alpha = 1.0; }

    // Four legs visible in profile. Front pair alternates with back pair
    // so the gait reads as a realistic cross-pattern trot.
    bool fwdDown = (legSwap > 0.5);
    float fH = fwdDown ? 2.0 : 1.0;
    float bH = fwdDown ? 1.0 : 2.0;
    float legFF = rectMask(px, c + float2( 1.5, -1.6 - fH), float2(1, fH));
    float legFB = rectMask(px, c + float2(-1.8, -1.6 - bH), float2(1, bH));
    float legBF = rectMask(px, c + float2( 0.5, -1.6 - bH), float2(1, bH));
    float legBB = rectMask(px, c + float2(-0.8, -1.6 - fH), float2(1, fH));
    if (legFF > 0.5 || legFB > 0.5 || legBF > 0.5 || legBB > 0.5)
    { color = _SheepLeg.rgb; alpha = 1.0; }
}

void DrawSheepBack(inout float3 color, inout float alpha, float2 px,
                   float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.44));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float w1 = circleMask(px, c + float2(-1.5, 0), 2.0);
    float w2 = circleMask(px, c + float2( 1.5, 0), 2.0);
    float w3 = circleMask(px, c + float2( 0.0, 1), 2.1);
    float wool = max(w1, max(w2, w3));
    if (wool > 0.5)
    {
        color = (px.y >= c.y + 1) ? _SheepWool.rgb : _SheepWoolShade.rgb;
        alpha = 1.0;
    }

    // Two legs visible at the rear.
    float lH = (legSwap > 0.5) ? 2.0 : 1.0;
    float rH = (legSwap > 0.5) ? 1.0 : 2.0;
    float legL = rectMask(px, c + float2(-1.5, -1.6 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1.5, -1.6 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _SheepLeg.rgb; alpha = 1.0; }
}

void DrawSheepFront(inout float3 color, inout float alpha, float2 px,
                    float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.44));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float w1 = circleMask(px, c + float2(-1.5, 0), 2.0);
    float w2 = circleMask(px, c + float2( 1.5, 0), 2.0);
    float wool = max(w1, w2);
    if (wool > 0.5)
    {
        color = (px.y >= c.y + 1) ? _SheepWool.rgb : _SheepWoolShade.rgb;
        alpha = 1.0;
    }

    // Face centred, with two small dark eyes.
    float2 hc = c + float2(0, 0.5);
    float head = circleMask(px, hc, 1.4);
    if (head > 0.5) { color = _SheepFace.rgb; alpha = 1.0; }
    float eyeL = step(length(px - (hc + float2(-0.6, 0.3))), 0.4);
    float eyeR = step(length(px - (hc + float2( 0.6, 0.3))), 0.4);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5) { color = _SheepEye.rgb; alpha = 1.0; }

    float lH = (legSwap > 0.5) ? 2.0 : 1.0;
    float rH = (legSwap > 0.5) ? 1.0 : 2.0;
    float legL = rectMask(px, c + float2(-1.5, -1.6 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1.5, -1.6 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = _SheepLeg.rgb; alpha = 1.0; }
}

void DrawSheep(inout float3 color, inout float alpha, float2 px, float grid,
               float seed, int facing)
{
    if (facing == 0)      DrawSheepSide(color, alpha, px, grid, seed);
    else if (facing == 1) DrawSheepBack(color, alpha, px, grid, seed);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawSheepSide(color, alpha, px, grid, seed); }
    else                  DrawSheepFront(color, alpha, px, grid, seed);
}

#endif // RAREICON_HEX_SHEEP_INCLUDED

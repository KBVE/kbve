#ifndef RAREICON_HEX_WOLF_INCLUDED
#define RAREICON_HEX_WOLF_INCLUDED

// Lean quadruped — 5-wide body lower than the cow, pointed snout, tall
// ears, fluffy tail. Two-tone palette: dorsal _WolfBody on the back +
// head, paler _WolfBelly on the underside, eye + nose in _WolfNose.
// Per-wolf seed jitter shifts the back darker so packs don't read as
// clones. Animations match the existing _UnitBob / _UnitStep so the
// trot frame interleaves with the rest of the unit roster.
//
// Uniforms: _WolfBody, _WolfBodyShade, _WolfBelly, _WolfNose, _WolfEye
// Helpers: rectMask, circleMask (HexShared.hlsl) +
//          _UnitShadow, _UnitStep, _UnitBob (HexUnitAnim.hlsl).

void DrawWolfSide(inout float3 color, inout float alpha, float2 px,
                  float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.42));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Per-wolf darkness jitter — pure black to ash-grey range.
    float coatJit = (hash21(float2(seed, 33.0)) - 0.5) * 0.18;
    float3 back  = saturate(_WolfBody.rgb       * (1.0 + coatJit));
    float3 belly = saturate(_WolfBelly.rgb      * (1.0 + coatJit * 0.3));
    float3 shade = saturate(_WolfBodyShade.rgb  * (1.0 + coatJit));

    // Body — narrower and longer than the cow. Top half = back coat,
    // bottom half = belly tone.
    float bodyRect = rectMask(px, c + float2(-2, -1), float2(5, 2));
    float bodyR    = circleMask(px, c + float2(2.5, 0), 1.2);
    float bodyL    = circleMask(px, c + float2(-2.5, 0), 1.2);
    float body     = max(bodyRect, max(bodyL, bodyR));
    if (body > 0.5)
    {
        color = (px.y >= c.y) ? back : belly;
        alpha = 1.0;
    }

    // Head — pointed snout extends one pixel forward of the body.
    float head    = rectMask(px, c + float2(2, 0), float2(2, 2));
    float snout   = rectMask(px, c + float2(4, 0), float2(1, 1));
    if (head > 0.5)  { color = back;  alpha = 1.0; }
    if (snout > 0.5) { color = shade; alpha = 1.0; }

    // Nose — single black pixel at the tip of the snout.
    float nose = rectMask(px, c + float2(4, 1), float2(1, 1));
    if (nose > 0.5) { color = _WolfNose.rgb; alpha = 1.0; }

    // Ear — triangle peak above the head.
    float ear = rectMask(px, c + float2(2, 2), float2(1, 1));
    if (ear > 0.5) { color = back; alpha = 1.0; }

    // Eye — single yellow pixel on the head.
    float eye = step(length(px - (c + float2(3, 1))), 0.4);
    if (eye > 0.5 && head > 0.5) { color = _WolfEye.rgb; alpha = 1.0; }

    // Tail — bushier than the cow, tucked low at the rear with a
    // bob-tip pixel for movement read.
    float tail    = rectMask(px, c + float2(-3, 0), float2(1, 2));
    float tailTip = rectMask(px, c + float2(-4, 1), float2(1, 1));
    if (tail > 0.5 || tailTip > 0.5) { color = back; alpha = 1.0; }

    // 4 legs — alternating trot. Slightly thinner than the cow's.
    bool fwdDown = (legSwap > 0.5);
    float fH = fwdDown ? 2.0 : 1.0;
    float bH = fwdDown ? 1.0 : 2.0;
    float legFF = rectMask(px, c + float2( 2, -1.0 - fH), float2(1, fH));
    float legFB = rectMask(px, c + float2(-2, -1.0 - bH), float2(1, bH));
    float legBF = rectMask(px, c + float2( 1, -1.0 - bH), float2(1, bH));
    float legBB = rectMask(px, c + float2(-1, -1.0 - fH), float2(1, fH));
    if (legFF > 0.5 || legFB > 0.5 || legBF > 0.5 || legBB > 0.5)
    { color = shade; alpha = 1.0; }
}

void DrawWolfBack(inout float3 color, inout float alpha, float2 px,
                  float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.42));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float coatJit = (hash21(float2(seed, 33.0)) - 0.5) * 0.18;
    float3 back  = saturate(_WolfBody.rgb      * (1.0 + coatJit));
    float3 shade = saturate(_WolfBodyShade.rgb * (1.0 + coatJit));

    // Rump + back silhouette: 5-wide trunk, narrower head strip on
    // top, ears as 1-pixel tips on the head corners. Without the head
    // strip between body top (y=+1) and ears (y=+3) the ears float
    // over a blank y=+2 row and read as disembodied.
    float body = rectMask(px, c + float2(-2, -1), float2(5, 3));
    if (body > 0.5) { color = back; alpha = 1.0; }

    // Darker spine strip along the top of the back so the silhouette
    // tapers back → shoulders → head instead of reading as one flat slab.
    float spine = rectMask(px, c + float2(-2, 1), float2(5, 1));
    if (spine > 0.5) { color = shade; alpha = 1.0; }

    // Head / neck — 3 wide, sits on top of the shoulders and connects
    // the ears to the body.
    float head = rectMask(px, c + float2(-1, 2), float2(3, 1));
    if (head > 0.5) { color = back; alpha = 1.0; }

    // Two pointed ears at the top corners of the head.
    float earL = rectMask(px, c + float2(-1, 3), float2(1, 1));
    float earR = rectMask(px, c + float2( 1, 3), float2(1, 1));
    if (earL > 0.5 || earR > 0.5) { color = back; alpha = 1.0; }

    // Tail tip hanging behind the rear legs.
    float tail = rectMask(px, c + float2(0, -2), float2(1, 1));
    if (tail > 0.5) { color = shade; alpha = 1.0; }

    // 4 legs visible from behind.
    float lH = (legSwap > 0.5) ? 2.0 : 1.0;
    float rH = (legSwap > 0.5) ? 1.0 : 2.0;
    float legL  = rectMask(px, c + float2(-2, -1.0 - lH), float2(1, lH));
    float legR  = rectMask(px, c + float2( 2, -1.0 - rH), float2(1, rH));
    float legL2 = rectMask(px, c + float2(-1, -1.0 - rH), float2(1, rH));
    float legR2 = rectMask(px, c + float2( 1, -1.0 - lH), float2(1, lH));
    if (legL > 0.5 || legR > 0.5 || legL2 > 0.5 || legR2 > 0.5)
    { color = shade; alpha = 1.0; }
}

void DrawWolfFront(inout float3 color, inout float alpha, float2 px,
                   float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.42));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float coatJit = (hash21(float2(seed, 33.0)) - 0.5) * 0.18;
    float3 back  = saturate(_WolfBody.rgb       * (1.0 + coatJit));
    float3 belly = saturate(_WolfBelly.rgb      * (1.0 + coatJit * 0.3));
    float3 shade = saturate(_WolfBodyShade.rgb  * (1.0 + coatJit));

    // Wedge-shaped body — wider at chest, tapering down.
    float body = rectMask(px, c + float2(-2, -1), float2(5, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y + 1) ? back : belly;
        alpha = 1.0;
    }

    // Forward snout.
    float snout = rectMask(px, c + float2(0, -1), float2(1, 1));
    if (snout > 0.5) { color = shade; alpha = 1.0; }

    // Two tall ears + paired yellow eyes.
    float earL = rectMask(px, c + float2(-1, 3), float2(1, 1));
    float earR = rectMask(px, c + float2( 1, 3), float2(1, 1));
    if (earL > 0.5 || earR > 0.5) { color = back; alpha = 1.0; }

    float eyeL = step(length(px - (c + float2(-0.7, 1))), 0.4);
    float eyeR = step(length(px - (c + float2( 0.7, 1))), 0.4);
    if (eyeL > 0.5 || eyeR > 0.5) { color = _WolfEye.rgb; alpha = 1.0; }

    // Nose pixel just under the eyes.
    float nose = rectMask(px, c + float2(0, 0), float2(1, 1));
    if (nose > 0.5) { color = _WolfNose.rgb; alpha = 1.0; }

    // Front legs.
    float lH = (legSwap > 0.5) ? 2.0 : 1.0;
    float rH = (legSwap > 0.5) ? 1.0 : 2.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = shade; alpha = 1.0; }
}

void DrawWolf(inout float3 color, inout float alpha, float2 px, float grid,
              float seed, int facing)
{
    if (facing == 0)      DrawWolfSide(color, alpha, px, grid, seed);
    else if (facing == 1) DrawWolfBack(color, alpha, px, grid, seed);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawWolfSide(color, alpha, px, grid, seed); }
    else                  DrawWolfFront(color, alpha, px, grid, seed);
}

#endif // RAREICON_HEX_WOLF_INCLUDED

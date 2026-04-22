#ifndef RAREICON_HEX_COW_INCLUDED
#define RAREICON_HEX_COW_INCLUDED

// Chunky bovine — rounded barrel body, forward head block with horn + ear
// + eye + muzzle, hanging dewlap under the neck, swishing tail, small
// udder under the rear belly, and four legs running a diagonal trot with
// near/far-side depth shading. Per-cow hashed patches stay.
//
// Walks on a slower 3Hz gait than the shared 5Hz default so the cow
// doesn't goblin-trot, and legs anchor to the un-bobbed centre so feet
// stay planted while the body bobs above them (fixes the "bunny bounce"
// that read as weird movement).
//
// Uniforms: _CowBodyA (pale), _CowBodyB (dark patches), _CowHorn, _CowHoof,
//           _CowNose, _CowEye
// Helpers: rectMask, circleMask, hash21 (HexShared.hlsl) +
//          _UnitShadow (HexUnitAnim.hlsl). Step/bob are cow-local.

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

// Bovine-local gait (3Hz) so the cow lumbers instead of goblin-trotting.
// Moving cows do NOT bob — a quadruped's torso rides level while the
// legs alternate; bobbing the body shimmers the hide patches and the
// top/bot shade band on every step transition. Idle cows keep a slow
// 1Hz breath so a stationary cow still reads alive.
float _CowStep(float seed)
{
    return _UnitMoving * step(0.0, sin(_Time.y * 3.0 + seed * 6.28318));
}
float _CowBob(float seed)
{
    return (1.0 - _UnitMoving) * step(0.0, sin(_Time.y * 1.0 + seed * 6.28318));
}

void DrawCowSide(inout float3 color, inout float alpha, float2 px,
                 float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.44));
    float bob     = _CowBob(seed);
    float legSwap = _CowStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Barrel body — rect + rounded flank caps.
    float bodyRect = rectMask(px, c + float2(-3, -1), float2(7, 3));
    float bodyL    = circleMask(px, c + float2(-3, 0), 1.5);
    float bodyR    = circleMask(px, c + float2( 3, 0), 1.5);
    float body     = max(bodyRect, max(bodyL, bodyR));
    if (body > 0.5)
    {
        // Three-band vertical shading: lit top, mid base, darker belly.
        bool top = px.y >= c.y;
        bool bot = px.y <= c.y - 1;
        color = top ? _CowBodyA.rgb : (bot ? _CowBodyA.rgb * 0.78 : _CowBodyA.rgb * 0.92);
        alpha = 1.0;
        if (_CowSpotMask(px, c, seed) > 0.5) color = _CowBodyB.rgb;
    }

    // Backbone ridge — darker highlight running along the top of the body.
    float ridge = rectMask(px, c + float2(-2, 1), float2(4, 1));
    if (ridge > 0.5 && body > 0.5) color = _CowBodyA.rgb * 0.85;

    // Head — 3x2 block forward of the body.
    float head = rectMask(px, c + float2(3, 0), float2(3, 2));
    if (head > 0.5) { color = _CowBodyA.rgb; alpha = 1.0; }

    // Dewlap — hanging skin fold under the neck.
    float dewlap = rectMask(px, c + float2(3, -1), float2(1, 1));
    if (dewlap > 0.5) { color = _CowBodyA.rgb * 0.8; alpha = 1.0; }

    // Ear — pixel above head-back, distinct from horn.
    float ear = rectMask(px, c + float2(3, 2), float2(1, 1));
    if (ear > 0.5) { color = _CowBodyA.rgb * 0.7; alpha = 1.0; }

    // Horn — 2 pixels tall for clear silhouette, forward of the ear.
    float hornA = rectMask(px, c + float2(4, 2), float2(1, 1));
    float hornB = rectMask(px, c + float2(4, 3), float2(1, 1));
    if (hornA > 0.5 || hornB > 0.5) { color = _CowHorn.rgb; alpha = 1.0; }

    // Eye — single dark pixel centred in the face.
    float eye = step(length(px - (c + float2(4.0, 1))), 0.4);
    if (eye > 0.5 && head > 0.5) { color = _CowEye.rgb; alpha = 1.0; }

    // Muzzle + jaw shadow at the nose tip.
    float muzzle = rectMask(px, c + float2(5, 0), float2(1, 1));
    if (muzzle > 0.5) { color = _CowNose.rgb; alpha = 1.0; }
    float jawShadow = rectMask(px, c + float2(5, 1), float2(1, 1));
    if (jawShadow > 0.5 && head > 0.5) { color = _CowBodyA.rgb * 0.72; alpha = 1.0; }

    // Udder — small pink pouch under the belly, back half.
    float udder = rectMask(px, cFixed + float2(-1, -2), float2(2, 1));
    if (udder > 0.5) { color = _CowNose.rgb * 0.82; alpha = 1.0; }

    // Tail — switches between hanging-straight and back-flick with the gait.
    bool tailFlick = (legSwap > 0.5);
    float2 tailBodyPos = c + float2(-4, tailFlick ? 0 : -1);
    float2 tailTuftPos = tailFlick
        ? c + float2(-5,  0)
        : c + float2(-4, -2);
    float tailBody = rectMask(px, tailBodyPos, float2(1, tailFlick ? 1 : 2));
    float tailTuft = rectMask(px, tailTuftPos, float2(1, 1));
    if (tailBody > 0.5 || tailTuft > 0.5) { color = _CowBodyB.rgb; alpha = 1.0; }

    // Four legs, diagonal trot (NF + FB down together, then FF + NB).
    // Anchored to cFixed so feet stay planted while the body bobs above.
    bool phase0 = (legSwap > 0.5);
    float nfH = phase0 ? 3.0 : 2.0;  // near-front
    float ffH = phase0 ? 2.0 : 3.0;  // far-front (offset 1px back for depth)
    float nbH = phase0 ? 2.0 : 3.0;  // near-back
    float fbH = phase0 ? 3.0 : 2.0;  // far-back
    float legNF = rectMask(px, cFixed + float2( 2, -1.0 - nfH), float2(1, nfH));
    float legFF = rectMask(px, cFixed + float2( 3, -1.0 - ffH), float2(1, ffH));
    float legNB = rectMask(px, cFixed + float2(-2, -1.0 - nbH), float2(1, nbH));
    float legFB = rectMask(px, cFixed + float2(-3, -1.0 - fbH), float2(1, fbH));
    if (legNF > 0.5 || legNB > 0.5) { color = _CowHoof.rgb;       alpha = 1.0; }
    if (legFF > 0.5 || legFB > 0.5) { color = _CowHoof.rgb * 0.65; alpha = 1.0; }
}

void DrawCowBack(inout float3 color, inout float alpha, float2 px,
                 float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.44));
    float bob     = _CowBob(seed);
    float legSwap = _CowStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Rump — same barrel footprint as the side view.
    float bodyRect = rectMask(px, c + float2(-3, -1), float2(7, 3));
    float bodyL    = circleMask(px, c + float2(-3, 0), 1.5);
    float bodyR    = circleMask(px, c + float2( 3, 0), 1.5);
    float body     = max(bodyRect, max(bodyL, bodyR));
    if (body > 0.5)
    {
        color = (px.y >= c.y) ? _CowBodyA.rgb : _CowBodyA.rgb * 0.82;
        alpha = 1.0;
        if (_CowSpotMask(px, c, seed) > 0.5) color = _CowBodyB.rgb;
    }

    // Spine groove down the centre.
    float spine = rectMask(px, c + float2(0, 0), float2(1, 2));
    if (spine > 0.5 && body > 0.5) color = _CowBodyA.rgb * 0.78;

    // Tail base + dangle + tuft.
    float tailBase = rectMask(px, c + float2(0, -1), float2(1, 1));
    float tailBody = rectMask(px, c + float2(0, -2), float2(1, 1));
    float tailTuft = rectMask(px, c + float2(0, -3), float2(1, 1));
    if (tailBase > 0.5) { color = _CowBodyA.rgb * 0.75; alpha = 1.0; }
    if (tailBody > 0.5 || tailTuft > 0.5) { color = _CowBodyB.rgb; alpha = 1.0; }

    // Udder visible between hind legs.
    float udder = rectMask(px, cFixed + float2(-1, -2), float2(2, 1));
    if (udder > 0.5) { color = _CowNose.rgb * 0.82; alpha = 1.0; }

    // Four rear hooves — outer pair offset vs inner pair for gait read.
    bool phase0 = (legSwap > 0.5);
    float oH = phase0 ? 3.0 : 2.0;
    float iH = phase0 ? 2.0 : 3.0;
    float legOL = rectMask(px, cFixed + float2(-2, -1.0 - oH), float2(1, oH));
    float legIL = rectMask(px, cFixed + float2(-1, -1.0 - iH), float2(1, iH));
    float legIR = rectMask(px, cFixed + float2( 1, -1.0 - iH), float2(1, iH));
    float legOR = rectMask(px, cFixed + float2( 2, -1.0 - oH), float2(1, oH));
    if (legOL > 0.5 || legOR > 0.5) { color = _CowHoof.rgb;       alpha = 1.0; }
    if (legIL > 0.5 || legIR > 0.5) { color = _CowHoof.rgb * 0.7; alpha = 1.0; }
}

void DrawCowFront(inout float3 color, inout float alpha, float2 px,
                  float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.44));
    float bob     = _CowBob(seed);
    float legSwap = _CowStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Chest — wider barrel.
    float chest = rectMask(px, c + float2(-3, -1), float2(7, 3));
    if (chest > 0.5)
    {
        color = (px.y >= c.y) ? _CowBodyA.rgb : _CowBodyA.rgb * 0.86;
        alpha = 1.0;
        if (_CowSpotMask(px, c, seed) > 0.5) color = _CowBodyB.rgb;
    }

    // Dewlap — visible fold under the chin.
    float dewlap = rectMask(px, c + float2(-1, 1), float2(3, 1));
    if (dewlap > 0.5 && chest > 0.5) color = _CowBodyA.rgb * 0.78;

    // Head sits on top of the chest.
    float2 hc = c + float2(0, 2.5);
    float head = rectMask(px, hc + float2(-2, -1), float2(5, 3));
    if (head > 0.5) { color = _CowBodyA.rgb; alpha = 1.0; }

    // Ears on either side of the skull, below horns.
    float earL = rectMask(px, hc + float2(-3, 0), float2(1, 1));
    float earR = rectMask(px, hc + float2( 3, 0), float2(1, 1));
    if (earL > 0.5 || earR > 0.5) { color = _CowBodyA.rgb * 0.7; alpha = 1.0; }

    // Horns poking up above the skull.
    float hornL  = rectMask(px, hc + float2(-2, 2), float2(1, 1));
    float hornR  = rectMask(px, hc + float2( 2, 2), float2(1, 1));
    float hornLT = rectMask(px, hc + float2(-2, 3), float2(1, 1));
    float hornRT = rectMask(px, hc + float2( 2, 3), float2(1, 1));
    if (hornL > 0.5 || hornR > 0.5 || hornLT > 0.5 || hornRT > 0.5)
    { color = _CowHorn.rgb; alpha = 1.0; }

    // Eyes with a pupil highlight.
    float eyeL = step(length(px - (hc + float2(-0.8, 0.3))), 0.5);
    float eyeR = step(length(px - (hc + float2( 0.8, 0.3))), 0.5);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5) { color = _CowEye.rgb; alpha = 1.0; }

    // Muzzle with 2 nostril pixels.
    float muzzle  = rectMask(px, hc + float2(-1, -1), float2(3, 1));
    if (muzzle > 0.5 && head > 0.5) { color = _CowNose.rgb; alpha = 1.0; }
    float nostrilL = rectMask(px, hc + float2(-1, -1), float2(1, 1));
    float nostrilR = rectMask(px, hc + float2( 1, -1), float2(1, 1));
    if (nostrilL > 0.5 || nostrilR > 0.5)
    { color = _CowNose.rgb * 0.55; alpha = 1.0; }

    // Four front legs — near-pair lit, behind-pair shaded.
    bool phase0 = (legSwap > 0.5);
    float oH = phase0 ? 3.0 : 2.0;
    float iH = phase0 ? 2.0 : 3.0;
    float legOL = rectMask(px, cFixed + float2(-2, -1.0 - oH), float2(1, oH));
    float legIL = rectMask(px, cFixed + float2(-1, -1.0 - iH), float2(1, iH));
    float legIR = rectMask(px, cFixed + float2( 1, -1.0 - iH), float2(1, iH));
    float legOR = rectMask(px, cFixed + float2( 2, -1.0 - oH), float2(1, oH));
    if (legOL > 0.5 || legOR > 0.5) { color = _CowHoof.rgb;       alpha = 1.0; }
    if (legIL > 0.5 || legIR > 0.5) { color = _CowHoof.rgb * 0.7; alpha = 1.0; }
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

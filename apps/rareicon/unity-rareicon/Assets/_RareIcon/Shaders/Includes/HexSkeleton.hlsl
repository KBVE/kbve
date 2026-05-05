#ifndef RAREICON_HEX_SKELETON_INCLUDED
#define RAREICON_HEX_SKELETON_INCLUDED

float3 _SkeletonBoneFor(int variant)
{
    if (variant == 2) return _SkeletonBoneWraith.rgb;
    if (variant == 3) return _SkeletonBoneFungal.rgb;
    if (variant == 4) return _SkeletonBoneDesert.rgb;
    return _SkeletonBone.rgb;
}

float3 _SkeletonShadeFor(int variant)
{
    if (variant == 2) return _SkeletonShadeWraith.rgb;
    if (variant == 3) return _SkeletonShadeFungal.rgb;
    if (variant == 4) return _SkeletonShadeDesert.rgb;
    return _SkeletonShade.rgb;
}

float3 _SkeletonEyeFor(int variant)
{
    if (variant == 2) return _SkeletonEyeWraith.rgb;
    if (variant == 3) return _SkeletonEyeFungal.rgb;
    return _SkeletonEye.rgb;
}

void _DrawSkeletonHelmOverlay(inout float3 color, inout float alpha, float2 px, float2 hc, int variant)
{
    if (variant != 1) return;
    float helmTop  = rectMask(px, hc + float2(-1.5, 0.5), float2(4, 1));
    float helmSide = rectMask(px, hc + float2(-1.5, -0.5), float2(4, 1));
    if (helmTop > 0.5 || helmSide > 0.5)
    {
        color = _SkeletonHelm.rgb;
        if (helmSide > 0.5) color = _SkeletonHelmShade.rgb;
        alpha = 1.0;
    }
}

void DrawSkeletonSide(inout float3 color, inout float alpha, float2 px,
                      float grid, float seed, int variant)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c      = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float3 bone   = _SkeletonBoneFor(variant);
    float3 shade  = _SkeletonShadeFor(variant);
    float3 eyeCol = _SkeletonEyeFor(variant);

    float ribCage = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (ribCage > 0.5)
    {
        color = (px.y >= c.y - 1) ? bone : shade;
        alpha = 1.0;
        float ribLine = step(0.5, abs(fmod(px.y - c.y, 2.0)));
        if (ribLine > 0.5 && (px.x == c.x || px.x == c.x - 1)) color = shade * 0.8;
    }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5)
    {
        color = bone;
        alpha = 1.0;
    }

    float socket = step(length(px - (hc + float2(0.6, 0.2))), 0.55);
    if (socket > 0.5 && head > 0.5) { color = eyeCol; alpha = 1.0; }

    float jaw = rectMask(px, hc + float2(-1, -1), float2(3, 1));
    if (jaw > 0.5 && head > 0.5) { color = shade * 0.6; alpha = 1.0; }

    _DrawSkeletonHelmOverlay(color, alpha, px, hc, variant);

    float frontLegX = (legSwap > 0.5) ?  1.0 : -1.0;
    float backLegX  = (legSwap > 0.5) ? -1.0 :  1.0;
    bool  frontDown = (legSwap > 0.5);
    float frontH = frontDown ? 3.0 : 1.0;
    float backH  = frontDown ? 1.0 : 3.0;
    float legBack  = rectMask(px, c + float2(backLegX,  -1.0 - backH),  float2(1, backH));
    float legFront = rectMask(px, c + float2(frontLegX, -1.0 - frontH), float2(1, frontH));
    if (legBack  > 0.5) { color = shade; alpha = 1.0; }
    if (legFront > 0.5) { color = bone;  alpha = 1.0; }
}

void DrawSkeletonBack(inout float3 color, inout float alpha, float2 px,
                     float grid, float seed, int variant)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c      = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float3 bone  = _SkeletonBoneFor(variant);
    float3 shade = _SkeletonShadeFor(variant);

    float spine = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (spine > 0.5)
    {
        color = (px.y >= c.y - 1) ? bone : shade;
        alpha = 1.0;
        float spineLine = step(0.5, abs(px.x - c.x));
        if (spineLine < 0.5) color = shade * 0.7;
    }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.6);
    if (head > 0.5) { color = bone; alpha = 1.0; }

    _DrawSkeletonHelmOverlay(color, alpha, px, hc, variant);

    float lH = (legSwap > 0.5) ? 3.0 : 1.0;
    float rH = (legSwap > 0.5) ? 1.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = shade; alpha = 1.0; }
}

void DrawSkeletonFront(inout float3 color, inout float alpha, float2 px,
                      float grid, float seed, int variant)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c      = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float3 bone   = _SkeletonBoneFor(variant);
    float3 shade  = _SkeletonShadeFor(variant);
    float3 eyeCol = _SkeletonEyeFor(variant);

    float ribCage = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (ribCage > 0.5)
    {
        color = (px.y >= c.y - 1) ? bone : shade;
        alpha = 1.0;
        float ribLine = step(0.5, abs(fmod(px.y - c.y, 2.0)));
        if (ribLine > 0.5) color = shade * 0.75;
    }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5) { color = bone; alpha = 1.0; }

    float socketL = step(length(px - (hc + float2(-0.6, 0.2))), 0.5);
    float socketR = step(length(px - (hc + float2( 0.6, 0.2))), 0.5);
    if ((socketL > 0.5 || socketR > 0.5) && head > 0.5) { color = eyeCol; alpha = 1.0; }

    float jaw = rectMask(px, hc + float2(-1, -1), float2(3, 1));
    if (jaw > 0.5 && head > 0.5) { color = shade * 0.55; alpha = 1.0; }

    _DrawSkeletonHelmOverlay(color, alpha, px, hc, variant);

    float lH = (legSwap > 0.5) ? 3.0 : 1.0;
    float rH = (legSwap > 0.5) ? 1.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = shade; alpha = 1.0; }
}

float2 SkeletonWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    if (facing == 1) return c + float2( 2.0, 1);
    if (facing == 3) return c + float2( 2.0, 0);
    return c + float2( 2.0, 0);
}

void DrawSkeleton(inout float3 color, inout float alpha, float2 px, float grid,
                  float seed, int facing, int variant)
{
    if (facing == 0)      DrawSkeletonSide(color, alpha, px, grid, seed, variant);
    else if (facing == 1) DrawSkeletonBack(color, alpha, px, grid, seed, variant);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawSkeletonSide(color, alpha, px, grid, seed, variant); }
    else                  DrawSkeletonFront(color, alpha, px, grid, seed, variant);
}

#endif

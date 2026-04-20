#ifndef RAREICON_HEX_GOBLIN_CAVE_INCLUDED
#define RAREICON_HEX_GOBLIN_CAVE_INCLUDED

void DrawGoblinCave(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    float r0 = rectMask(px, c + float2(-8, -7), float2(17, 1));
    float r1 = rectMask(px, c + float2(-7, -6), float2(15, 1));
    float r2 = rectMask(px, c + float2(-6, -5), float2(13, 1));
    float r3 = rectMask(px, c + float2(-5, -4), float2(11, 4));
    float r4 = rectMask(px, c + float2(-4,  0), float2( 9, 2));
    float r5 = rectMask(px, c + float2(-3,  2), float2( 7, 2));
    float r6 = rectMask(px, c + float2(-2,  4), float2( 5, 1));
    float r7 = rectMask(px, c + float2(-1,  5), float2( 3, 1));
    float moundBody = max(max(max(r0, r1), max(r2, r3)),
                          max(max(r4, r5), max(r6, r7))) * inside;
    if (moundBody > 0.5)
    {
        float variance = (hash21(px + float2(41, 19)) - 0.5) * 0.12;
        color = saturate(_CaveStone.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    float sh0 = rectMask(px, c + float2( 7, -7), float2(2, 1));
    float sh1 = rectMask(px, c + float2( 6, -6), float2(2, 1));
    float sh2 = rectMask(px, c + float2( 5, -5), float2(2, 1));
    float sh3 = rectMask(px, c + float2( 4, -4), float2(2, 4));
    float sh4 = rectMask(px, c + float2( 3,  0), float2(2, 2));
    float sh5 = rectMask(px, c + float2( 3,  2), float2(1, 2));
    float sh6 = rectMask(px, c + float2( 2,  4), float2(1, 1));
    float shade = max(max(max(sh0, sh1), max(sh2, sh3)),
                      max(max(sh4, sh5), sh6)) * inside;
    if (shade > 0.5) { color = _CaveStoneShade.rgb; alpha = 1.0; }

    float mA = rectMask(px, c + float2(-1,  5), float2(1, 1));
    float mB = rectMask(px, c + float2(-2,  4), float2(1, 1));
    float mC = rectMask(px, c + float2(-3,  3), float2(1, 1));
    float mD = rectMask(px, c + float2(-1,  3), float2(1, 1));
    float mE = rectMask(px, c + float2(-2,  2), float2(1, 1));
    float mF = rectMask(px, c + float2(-4,  1), float2(1, 1));
    float moss = max(max(max(mA, mB), max(mC, mD)), max(mE, mF)) * inside;
    if (moss > 0.5) { color = _CaveMoss.rgb; alpha = 1.0; }

    float mouthRect = rectMask(px, c + float2(-1, -6), float2(3, 3));
    float mouthApex = rectMask(px, c + float2( 0, -3), float2(1, 1));
    float mouth     = max(mouthRect, mouthApex) * inside;
    if (mouth > 0.5) { color = _CaveMouth.rgb; alpha = 1.0; }

    float haloTop   = rectMask(px, c + float2(-1, -2), float2(3, 1));
    float haloSideL = rectMask(px, c + float2(-2, -6), float2(1, 3));
    float haloSideR = rectMask(px, c + float2( 2, -6), float2(1, 3));
    float halo = max(haloTop, max(haloSideL, haloSideR)) * inside;
    if (halo > 0.5) { color = lerp(_CaveStone.rgb, _CaveTorch.rgb, 0.35); alpha = 1.0; }

    float tick      = floor(_Time.y * 1.5);
    float phaseMod2 = tick - floor(tick * 0.5) * 2.0;
    float fireAHot  = lerp(1.00, 0.50, phaseMod2);
    float fireBHot  = lerp(0.50, 1.00, phaseMod2);

    float fireA = rectMask(px, c + float2( 0, -6), float2(1, 1)) * inside;
    if (fireA > 0.5)
    {
        color = lerp(_CaveMouth.rgb, _CaveTorch.rgb, fireAHot);
        alpha = 1.0;
    }
    float fireB = rectMask(px, c + float2(-1, -6), float2(1, 1)) * inside;
    if (fireB > 0.5)
    {
        color = lerp(_CaveMouth.rgb, _CaveTorch.rgb, fireBHot);
        alpha = 1.0;
    }

    float torchL = rectMask(px, c + float2(-3, -4), float2(1, 1)) * inside;
    float torchR = rectMask(px, c + float2( 2, -4), float2(1, 1)) * inside;
    float torches = max(torchL, torchR);
    if (torches > 0.5) { color = _CaveTorch.rgb; alpha = 1.0; }

    float bone1 = rectMask(px, c + float2(-5, -7), float2(1, 1)) * inside;
    float bone2 = rectMask(px, c + float2( 4, -7), float2(1, 1)) * inside;
    float bones = max(bone1, bone2);
    if (bones > 0.5) { color = _CaveBone.rgb; alpha = 1.0; }
}

#endif

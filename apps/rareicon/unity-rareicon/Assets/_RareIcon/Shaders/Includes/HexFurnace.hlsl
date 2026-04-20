#ifndef RAREICON_HEX_FURNACE_INCLUDED
#define RAREICON_HEX_FURNACE_INCLUDED

void DrawFurnace(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    float faceRow = rectMask(px, c + float2(-4, -5), float2(9, 1)) * inside;
    if (faceRow > 0.5) { color = _FurnaceMouth.rgb; alpha = 1.0; }
    float footing = rectMask(px, c + float2(-4, -4), float2(9, 1)) * inside;
    if (footing > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    float body = rectMask(px, c + float2(-4, -3), float2(9, 7)) * inside;
    if (body > 0.5)
    {
        float variance = (hash21(px) - 0.5) * 0.10;
        color = saturate(_FurnaceStone.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    float seamH1 = rectMask(px, c + float2(-4, -1), float2(9, 1));
    float seamH2 = rectMask(px, c + float2(-4,  2), float2(9, 1));
    float seamV1a = rectMask(px, c + float2(-2, -3), float2(1, 2));
    float seamV1b = rectMask(px, c + float2( 1, -3), float2(1, 2));
    float seamV2a = rectMask(px, c + float2(-1,  0), float2(1, 2));
    float seamV2b = rectMask(px, c + float2( 2,  0), float2(1, 2));
    float seams = max(max(seamH1, seamH2),
                      max(max(seamV1a, seamV1b), max(seamV2a, seamV2b))) * inside;
    if (seams > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    float bodyShade = rectMask(px, c + float2(4, -3), float2(1, 7)) * inside;
    if (bodyShade > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    float ashL = rectMask(px, c + float2(-1, 0), float2(1, 3));
    float ashR = rectMask(px, c + float2( 1, 0), float2(1, 3));
    float streakBand = rectMask(px, c + float2(-4, 3), float2(9, 1));
    float streaks = max(ashL, ashR) * streakBand * inside;
    if (streaks > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    float stackBase = rectMask(px, c + float2(-2, 4), float2(5, 1)) * inside;
    float stackMid  = rectMask(px, c + float2(-1, 5), float2(3, 2)) * inside;
    float stackAll  = max(stackBase, stackMid);
    if (stackAll > 0.5)
    {
        float variance = (hash21(px + float2(13, 7)) - 0.5) * 0.08;
        color = saturate(_FurnaceChimney.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    float cap = rectMask(px, c + float2(-2, 7), float2(5, 1)) * inside;
    if (cap > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    float mouth = rectMask(px, c + float2(-1, -2), float2(3, 3)) * inside;
    if (mouth > 0.5) { color = _FurnaceMouth.rgb; alpha = 1.0; }

    float haloTop   = rectMask(px, c + float2(-1,  1), float2(3, 1));
    float haloSideL = rectMask(px, c + float2(-2, -2), float2(1, 3));
    float haloSideR = rectMask(px, c + float2( 2, -2), float2(1, 3));
    float halo = max(haloTop, max(haloSideL, haloSideR)) * inside * active;
    if (halo > 0.5) { color = lerp(_FurnaceStone.rgb, _FurnaceEmber.rgb, 0.55); alpha = 1.0; }

    float tick      = floor(_Time.y * 1.5);
    float phaseMod2 = tick - floor(tick * 0.5) * 2.0;
    float coreHot   = lerp(1.00, 0.55, phaseMod2);
    float edgeHot   = lerp(0.55, 1.00, phaseMod2);

    float emberCore = rectMask(px, c + float2( 0, -1), float2(1, 1)) * inside * active;
    if (emberCore > 0.5)
    {
        color = lerp(_FurnaceMouth.rgb, _FurnaceEmber.rgb, coreHot);
        alpha = 1.0;
    }
    float emberEdge = rectMask(px, c + float2(-1, -1), float2(1, 1)) * inside * active;
    if (emberEdge > 0.5)
    {
        color = lerp(_FurnaceMouth.rgb, _FurnaceEmber.rgb, edgeHot);
        alpha = 1.0;
    }

    float coalL = rectMask(px, c + float2(-1, -4), float2(1, 1));
    float coalR = rectMask(px, c + float2( 1, -4), float2(1, 1));
    float coal = max(coalL, coalR) * inside * active;
    if (coal > 0.5) { color = _FurnaceChimney.rgb * 0.65; alpha = 1.0; }

    float smoke1 = rectMask(px, c + float2( 0,  8), float2(1, 1)) * inside * active;
    float smoke2 = rectMask(px, c + float2(-1,  9), float2(1, 1)) * inside * active;
    float smoke3 = rectMask(px, c + float2( 1, 10), float2(1, 1)) * inside * active;
    float smoke = max(smoke1, max(smoke2, smoke3));
    if (smoke > 0.5) { color = _FurnaceSmoke.rgb; alpha = 1.0; }
}

#endif

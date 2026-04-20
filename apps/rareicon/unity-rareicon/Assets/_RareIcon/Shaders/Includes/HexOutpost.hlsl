#ifndef RAREICON_HEX_OUTPOST_INCLUDED
#define RAREICON_HEX_OUTPOST_INCLUDED

void DrawOutpost(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    float faceRow = rectMask(px, c + float2(-3, -7), float2(7, 1)) * inside;
    if (faceRow > 0.5) { color = _OutpostStoneShade.rgb * 0.55; alpha = 1.0; }
    float footing = rectMask(px, c + float2(-3, -6), float2(7, 1)) * inside;
    if (footing > 0.5) { color = _OutpostStoneShade.rgb; alpha = 1.0; }

    float shaft = rectMask(px, c + float2(-2, -5), float2(5, 7)) * inside;
    if (shaft > 0.5)
    {
        float variance = (hash21(px + float2(61, 23)) - 0.5) * 0.12;
        color = saturate(_OutpostStone.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    float seam1 = rectMask(px, c + float2(-2, -3), float2(5, 1));
    float seam2 = rectMask(px, c + float2(-2,  0), float2(5, 1));
    float seams = max(seam1, seam2) * inside;
    if (seams > 0.5) { color = _OutpostStoneShade.rgb; alpha = 1.0; }

    float shaftShade = rectMask(px, c + float2(2, -5), float2(1, 7)) * inside;
    if (shaftShade > 0.5) { color = _OutpostStoneShade.rgb; alpha = 1.0; }

    float slit = rectMask(px, c + float2(0, -2), float2(1, 2)) * inside;
    if (slit > 0.5) { color = _OutpostStoneShade.rgb * 0.45; alpha = 1.0; }

    float parapet = rectMask(px, c + float2(-3, 2), float2(7, 1)) * inside;
    if (parapet > 0.5) { color = _OutpostTimber.rgb; alpha = 1.0; }

    float tooth1 = rectMask(px, c + float2(-2, 3), float2(1, 1));
    float tooth2 = rectMask(px, c + float2( 0, 3), float2(1, 1));
    float tooth3 = rectMask(px, c + float2( 2, 3), float2(1, 1));
    float teeth = max(max(tooth1, tooth2), tooth3) * inside;
    if (teeth > 0.5) { color = _OutpostStone.rgb; alpha = 1.0; }

    float pole = rectMask(px, c + float2(0, 4), float2(1, 4)) * inside * active;
    if (pole > 0.5) { color = _OutpostTimber.rgb; alpha = 1.0; }

    float banner = rectMask(px, c + float2(1, 6), float2(3, 2)) * inside * active;
    if (banner > 0.5) { color = _OutpostBanner.rgb; alpha = 1.0; }

    float tick      = floor(_Time.y * 1.5);
    float phaseMod2 = tick - floor(tick * 0.5) * 2.0;
    float torchHot  = lerp(1.00, 0.55, phaseMod2);

    float torch = rectMask(px, c + float2(-2, 4), float2(1, 1)) * inside * active;
    if (torch > 0.5)
    {
        color = lerp(_OutpostStoneShade.rgb, _OutpostTorch.rgb, torchHot);
        alpha = 1.0;
    }
}

#endif

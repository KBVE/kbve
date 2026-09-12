#ifndef RAREICON_HEX_SHATTERED_CROWN_INCLUDED
#define RAREICON_HEX_SHATTERED_CROWN_INCLUDED

// The Shattered Crown — broken royal circlet on a ruined pedestal, amid
// scattered rubble. Arena icon.
void DrawShatteredCrown(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Rubble ring on the ground.
    float rubble1 = rectMask(px, c + float2(-8, -7), float2(2, 1)) * inside;
    float rubble2 = rectMask(px, c + float2(-4, -7), float2(1, 1)) * inside;
    float rubble3 = rectMask(px, c + float2( 5, -7), float2(2, 1)) * inside;
    float rubble4 = rectMask(px, c + float2( 7, -6), float2(1, 1)) * inside;
    float rubble = max(max(rubble1, rubble2), max(rubble3, rubble4));
    if (rubble > 0.5) { color = _CrownStone.rgb * 0.6; alpha = 1.0; }

    DrawFoundationBand(color, alpha, px, c + float2(-4, -6), 9.0,
                       _CrownStone.rgb * 0.4, _CrownStone.rgb * 0.55, inside);

    // Broken pedestal — stepped but with one side chipped.
    float p1 = rectMask(px, c + float2(-4, -4), float2(9, 1)) * inside;
    if (p1 > 0.5) { color = _CrownStone.rgb; alpha = 1.0; }
    float p2 = rectMask(px, c + float2(-3, -3), float2(6, 1)) * inside;  // Narrower on right = chipped.
    if (p2 > 0.5) { color = _CrownStone.rgb * 0.9; alpha = 1.0; }
    float p3 = rectMask(px, c + float2(-3, -2), float2(5, 1)) * inside;
    if (p3 > 0.5) { color = _CrownStone.rgb; alpha = 1.0; }

    // Crown base circlet — horizontal gold band.
    float band = rectMask(px, c + float2(-3, -1), float2(7, 1)) * inside;
    if (band > 0.5) { color = _CrownGold.rgb; alpha = 1.0; }

    // Crown points — irregular heights + one broken off.
    float pt1 = rectMask(px, c + float2(-3, 0), float2(1, 2)) * inside;
    float pt2 = rectMask(px, c + float2(-1, 0), float2(1, 3)) * inside;
    // Centre point missing — the shatter.
    float pt4 = rectMask(px, c + float2( 3, 0), float2(1, 1)) * inside;  // Broken short.
    float points = max(max(pt1, pt2), pt4);
    if (points > 0.5) { color = _CrownGold.rgb; alpha = 1.0; }

    // Gem on the largest point.
    DrawGem(color, alpha, px, c + float2(-1, 3), _CrownGem.rgb, _CrownGlow.rgb, inside);

    // Fallen gem on the ground to the right — the missing crown jewel.
    float fallen = rectMask(px, c + float2(4, -6), float2(1, 1)) * inside;
    if (fallen > 0.5) { color = _CrownGem.rgb; alpha = 1.0; }

    // Faint magic glow over the broken centre when active.
    float tick = floor(_Time.y * 1.0);
    float phase = tick - floor(tick * 0.5) * 2.0;
    float hot = lerp(0.3, 1.0, phase);
    float glow = rectMask(px, c + float2(0, 0), float2(1, 1)) * inside * active;
    if (glow > 0.5) { color = lerp(_CrownStone.rgb, _CrownGlow.rgb, hot); alpha = 1.0; }
}

#endif

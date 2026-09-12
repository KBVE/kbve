#ifndef RAREICON_HEX_MUSHROOM_BAZAAR_INCLUDED
#define RAREICON_HEX_MUSHROOM_BAZAAR_INCLUDED

// Mushroom Bazaar — cluster of colourful mushroom tents + a central gem
// lantern. Settlement.
void DrawMushroomBazaar(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Ground shadow.
    float ground = rectMask(px, c + float2(-8, -7), float2(17, 1)) * inside;
    if (ground > 0.5) { color = _MushroomStem.rgb * 0.35; alpha = 1.0; }

    // Left mushroom — red cap, white stem.
    float stemL = rectMask(px, c + float2(-7, -6), float2(2, 3)) * inside;
    if (stemL > 0.5) { color = _MushroomStem.rgb; alpha = 1.0; }
    float capL1 = rectMask(px, c + float2(-8, -3), float2(4, 1)) * inside;
    float capL2 = rectMask(px, c + float2(-7, -2), float2(2, 1)) * inside;
    float capL = max(capL1, capL2);
    if (capL > 0.5) { color = _MushroomCapA.rgb; alpha = 1.0; }

    // Centre mushroom — tallest, purple cap.
    float stemC = rectMask(px, c + float2(-1, -6), float2(3, 5)) * inside;
    if (stemC > 0.5) { color = _MushroomStem.rgb; alpha = 1.0; }
    float capC1 = rectMask(px, c + float2(-3, -1), float2(7, 1)) * inside;
    float capC2 = rectMask(px, c + float2(-2,  0), float2(5, 1)) * inside;
    float capC3 = rectMask(px, c + float2(-1,  1), float2(3, 1)) * inside;
    float capC = max(max(capC1, capC2), capC3);
    if (capC > 0.5) { color = _MushroomCapB.rgb; alpha = 1.0; }
    // White spots on purple cap.
    float spot1 = rectMask(px, c + float2(-2, -1), float2(1, 1)) * inside;
    float spot2 = rectMask(px, c + float2( 2, -1), float2(1, 1)) * inside;
    float spots = max(spot1, spot2);
    if (spots > 0.5) { color = _MushroomStem.rgb; alpha = 1.0; }

    // Right mushroom — yellow cap.
    float stemR = rectMask(px, c + float2( 5, -6), float2(2, 3)) * inside;
    if (stemR > 0.5) { color = _MushroomStem.rgb; alpha = 1.0; }
    float capR1 = rectMask(px, c + float2( 4, -3), float2(4, 1)) * inside;
    float capR2 = rectMask(px, c + float2( 5, -2), float2(2, 1)) * inside;
    float capR = max(capR1, capR2);
    if (capR > 0.5) { color = _MushroomCapC.rgb; alpha = 1.0; }

    // Market stall awning between centre and right mushroom.
    float awn = rectMask(px, c + float2(2, -4), float2(3, 1)) * inside;
    if (awn > 0.5) { color = _MushroomCapA.rgb; alpha = 1.0; }
    float goods = rectMask(px, c + float2(3, -5), float2(2, 1)) * inside;
    if (goods > 0.5) { color = _MushroomCapC.rgb; alpha = 1.0; }

    // Glowing gem lantern hanging from centre mushroom stem.
    DrawGem(color, alpha, px, c + float2(0, -5),
            _MushroomCapB.rgb, _MushroomGlow.rgb, inside);

    // Firefly glow sparkles when active.
    float tick = floor(_Time.y * 2.0);
    float phase = tick - floor(tick / 4.0) * 4.0;
    float fx = c.x - 4.0 + phase * 2.0;
    float spark = rectMask(px, float2(fx, c.y + 2.0), float2(1, 1)) * inside * active;
    if (spark > 0.5) { color = _MushroomGlow.rgb; alpha = 1.0; }
}

#endif

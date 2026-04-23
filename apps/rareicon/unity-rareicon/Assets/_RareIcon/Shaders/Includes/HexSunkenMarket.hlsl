#ifndef RAREICON_HEX_SUNKEN_MARKET_INCLUDED
#define RAREICON_HEX_SUNKEN_MARKET_INCLUDED

// Sunken Market — partly submerged stone bazaar with coral growths + a
// bright lantern floating above. Settlement.
void DrawSunkenMarket(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Water surface.
    float water = rectMask(px, c + float2(-9, -8), float2(19, 4)) * inside;
    if (water > 0.5) { color = _SunkenWater.rgb; alpha = 1.0; }

    // Ripple highlights on water.
    float tick = floor(_Time.y * 1.0);
    float phase = tick - floor(tick / 3.0) * 3.0;
    float rx = c.x - 7.0 + phase * 2.0;
    float ripple1 = rectMask(px, float2(rx, c.y - 6.0), float2(3, 1)) * inside;
    float ripple2 = rectMask(px, float2(rx + 6.0, c.y - 5.0), float2(3, 1)) * inside;
    if ((ripple1 > 0.5 || ripple2 > 0.5))
    {
        color = _SunkenFoam.rgb; alpha = 1.0;
    }

    // Partially-submerged arch rising from water.
    DrawStoneBlock(color, alpha, px, c + float2(-6, -4), float2(13, 5),
                   _SunkenStone.rgb, inside, float2(83, 29));
    DrawStoneSideShadow(color, alpha, px, c + float2(-6, -4), float2(13, 5),
                        _SunkenStone.rgb * 0.55, inside);
    DrawArchedDoor(color, alpha, px, c + float2(-2, -4), 4.0, 3.0,
                   _SunkenStone.rgb * 0.3, inside);

    // Coral growths on the arch.
    float coral1 = rectMask(px, c + float2(-6, 1), float2(1, 2)) * inside;
    float coral2 = rectMask(px, c + float2(-5, 2), float2(1, 1)) * inside;
    float coral3 = rectMask(px, c + float2( 5, 1), float2(1, 3)) * inside;
    float coralA = max(coral1, max(coral2, coral3));
    if (coralA > 0.5) { color = _SunkenCoralA.rgb; alpha = 1.0; }

    float coralB = rectMask(px, c + float2(-3, 1), float2(1, 2)) * inside;
    if (coralB > 0.5) { color = _SunkenCoralB.rgb; alpha = 1.0; }

    // Ruined columns flanking the arch, broken at different heights.
    float colL = rectMask(px, c + float2(-6, 0), float2(1, 3)) * inside;
    float colR = rectMask(px, c + float2( 5, 0), float2(1, 2)) * inside;
    float cols = max(colL, colR);
    if (cols > 0.5) { color = _SunkenStone.rgb * 0.8; alpha = 1.0; }

    // Lantern floating above centre — bright glowing orb.
    float lanternPole = rectMask(px, c + float2(0, 4), float2(1, 2)) * inside;
    if (lanternPole > 0.5) { color = _SunkenStone.rgb * 0.45; alpha = 1.0; }
    float lanternOrb = rectMask(px, c + float2(-1, 6), float2(3, 2)) * inside;
    if (lanternOrb > 0.5)
    {
        float hot = lerp(0.6, 1.0, step(0.5, _BuildingActive));
        color = lerp(_SunkenLantern.rgb * 0.5, _SunkenLantern.rgb, hot);
        alpha = 1.0;
    }

    // Bubbles rising from the arch when active.
    float tickB = floor(_Time.y * 1.8);
    float phaseB = tickB - floor(tickB / 5.0) * 5.0;
    float bubble = rectMask(px, c + float2(1, -3.0 + phaseB), float2(1, 1)) * inside * active;
    if (bubble > 0.5) { color = _SunkenFoam.rgb; alpha = 1.0; }
}

#endif

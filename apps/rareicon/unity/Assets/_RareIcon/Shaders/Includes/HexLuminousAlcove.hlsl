#ifndef RAREICON_HEX_LUMINOUS_ALCOVE_INCLUDED
#define RAREICON_HEX_LUMINOUS_ALCOVE_INCLUDED

// Luminous Alcove — shrine. Cavern niche with glowing crystal cluster +
// mineral veins that pulse when active.
void DrawLuminousAlcove(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    DrawFoundationBand(color, alpha, px, c + float2(-6, -7), 13.0,
                       _AlcoveStone.rgb * 0.4, _AlcoveStone.rgb * 0.55, inside);

    // Cavern back wall.
    DrawStoneBlock(color, alpha, px, c + float2(-6, -5), float2(13, 10),
                   _AlcoveStone.rgb, inside, float2(41, 127));

    // Alcove opening — arched cavity punched into the wall.
    float cavityBody = rectMask(px, c + float2(-3, -4), float2(7, 6));
    float cavityApex = rectMask(px, c + float2(-2, 2), float2(5, 1));
    float cavityApex2 = rectMask(px, c + float2(-1, 3), float2(3, 1));
    float cavity = max(max(cavityBody, cavityApex), cavityApex2) * inside;
    if (cavity > 0.5) { color = _AlcoveStone.rgb * 0.2; alpha = 1.0; }

    // Crystal cluster on the floor of the alcove.
    float tick = floor(_Time.y * 1.0);
    float phase = tick - floor(tick / 3.0) * 3.0;
    float pulse = phase < 0.5 ? 0.5 : (phase < 1.5 ? 0.8 : 1.0);

    DrawGem(color, alpha, px, c + float2(-2, -3),
            _AlcoveCrystalA.rgb, _AlcoveGlow.rgb, inside);
    DrawGem(color, alpha, px, c + float2( 0, -2),
            _AlcoveCrystalB.rgb, _AlcoveGlow.rgb, inside);
    DrawGem(color, alpha, px, c + float2( 2, -3),
            _AlcoveCrystalC.rgb, _AlcoveGlow.rgb, inside);

    // Floor glow beneath crystals — pulsing.
    float floorGlow = rectMask(px, c + float2(-2, -4), float2(5, 1)) * inside * active;
    if (floorGlow > 0.5) { color = lerp(_AlcoveStone.rgb * 0.3, _AlcoveGlow.rgb, pulse); alpha = 1.0; }

    // Mineral veins climbing the walls — diagonal lines of bright pixels.
    float v1 = rectMask(px, c + float2(-5, -1), float2(1, 1)) * inside * active;
    float v2 = rectMask(px, c + float2(-4,  0), float2(1, 1)) * inside * active;
    float v3 = rectMask(px, c + float2( 4,  0), float2(1, 1)) * inside * active;
    float v4 = rectMask(px, c + float2( 5,  1), float2(1, 1)) * inside * active;
    float veins = max(max(v1, v2), max(v3, v4));
    if (veins > 0.5) { color = _AlcoveGlow.rgb; alpha = 1.0; }
}

#endif

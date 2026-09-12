#ifndef RAREICON_HEX_WHISPERING_HALL_INCLUDED
#define RAREICON_HEX_WHISPERING_HALL_INCLUDED

// Whispering Hall — ruined colonnade: rows of weathered columns under a
// broken pediment. Pale pillars pulse faintly when active.
void DrawWhisperingHall(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    DrawFoundationBand(color, alpha, px, c + float2(-8, -6), 17.0,
                       _HallStone.rgb * 0.4, _HallStone.rgb * 0.5, inside);

    // Stepped plinth.
    float step1 = rectMask(px, c + float2(-8, -4), float2(17, 1)) * inside;
    if (step1 > 0.5) { color = _HallStone.rgb * 0.8; alpha = 1.0; }
    float step2 = rectMask(px, c + float2(-7, -3), float2(15, 1)) * inside;
    if (step2 > 0.5) { color = _HallStone.rgb; alpha = 1.0; }

    // Five columns.
    DrawColumn(color, alpha, px, c + float2(-6, -2), 8.0, _HallStone.rgb, _HallStone.rgb * 0.55, inside);
    DrawColumn(color, alpha, px, c + float2(-3, -2), 8.0, _HallStone.rgb, _HallStone.rgb * 0.55, inside);
    DrawColumn(color, alpha, px, c + float2( 0, -2), 8.0, _HallStone.rgb, _HallStone.rgb * 0.55, inside);
    DrawColumn(color, alpha, px, c + float2( 3, -2), 8.0, _HallStone.rgb, _HallStone.rgb * 0.55, inside);
    DrawColumn(color, alpha, px, c + float2( 6, -2), 8.0, _HallStone.rgb, _HallStone.rgb * 0.55, inside);

    // Architrave above columns.
    float archi = rectMask(px, c + float2(-7, 6), float2(15, 1)) * inside;
    if (archi > 0.5) { color = _HallStone.rgb * 0.9; alpha = 1.0; }

    // Broken pediment — stepped triangle with missing apex.
    float pedA = rectMask(px, c + float2(-6, 7), float2(13, 1)) * inside;
    if (pedA > 0.5) { color = _HallStone.rgb; alpha = 1.0; }
    float pedB = rectMask(px, c + float2(-5, 8), float2(4, 1)) * inside;
    if (pedB > 0.5) { color = _HallStone.rgb; alpha = 1.0; }
    float pedC = rectMask(px, c + float2( 2, 8), float2(4, 1)) * inside;
    if (pedC > 0.5) { color = _HallStone.rgb; alpha = 1.0; }
    // Missing centre of the pediment — deliberate gap.

    // Whisper glow — cyan pulse inside the colonnade when active.
    float tick = floor(_Time.y * 0.8);
    float phase = tick - floor(tick * 0.5) * 2.0;
    float pulse = lerp(0.3, 1.0, phase);
    float haze = rectMask(px, c + float2(-6, 3), float2(13, 2)) * inside * active;
    if (haze > 0.5) { color = lerp(_HallStone.rgb * 0.6, _HallGlow.rgb, pulse); alpha = 1.0; }
}

#endif

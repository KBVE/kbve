#ifndef RAREICON_HEX_PRISMATIC_THRONE_INCLUDED
#define RAREICON_HEX_PRISMATIC_THRONE_INCLUDED

// The Prismatic Throne — stepped dais crowned by a crystalline throne that
// cycles through prism colours when active. Arena icon.
void DrawPrismaticThrone(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    DrawFoundationBand(color, alpha, px, c + float2(-6, -7), 13.0,
                       _ThroneStone.rgb * 0.4, _ThroneStone.rgb * 0.55, inside);

    // Wide stepped dais.
    DrawPedestal(color, alpha, px, c.x, c.y - 5.0, 13.0, 5.0,
                 _ThroneStone.rgb, _ThroneStone.rgb * 0.6, inside);

    // Throne back — tall rectangle behind the seat.
    float back = rectMask(px, c + float2(-3, 0), float2(7, 8)) * inside;
    if (back > 0.5) { color = _ThroneStone.rgb * 0.85; alpha = 1.0; }
    float seat = rectMask(px, c + float2(-2, 0), float2(5, 2)) * inside;
    if (seat > 0.5) { color = _ThroneSeat.rgb; alpha = 1.0; }

    // Throne arms.
    float armL = rectMask(px, c + float2(-3, -1), float2(1, 3)) * inside;
    float armR = rectMask(px, c + float2( 3, -1), float2(1, 3)) * inside;
    float arms = max(armL, armR);
    if (arms > 0.5) { color = _ThroneStone.rgb * 0.7; alpha = 1.0; }

    // Crown of gems on the throne back — three diamonds cycling colour.
    float tick = floor(_Time.y * 1.0);
    float phase3 = tick - floor(tick / 3.0) * 3.0;
    float3 cycleColor = phase3 < 0.5 ? _ThroneGem1.rgb
                       : (phase3 < 1.5 ? _ThroneGem2.rgb
                       : _ThroneGem3.rgb);

    DrawGem(color, alpha, px, c + float2(-2, 6),
            lerp(_ThroneGem2.rgb, cycleColor, active), _ThroneGlow.rgb, inside);
    DrawGem(color, alpha, px, c + float2( 0, 7),
            lerp(_ThroneGem1.rgb, cycleColor, active), _ThroneGlow.rgb, inside);
    DrawGem(color, alpha, px, c + float2( 2, 6),
            lerp(_ThroneGem3.rgb, cycleColor, active), _ThroneGlow.rgb, inside);

    // Twin brazier flames flanking the dais.
    DrawTorchFlame(color, alpha, px, c + float2(-6, -2),
                   _ThroneStone.rgb * 0.4, _ThroneGlow.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2( 6, -2),
                   _ThroneStone.rgb * 0.4, _ThroneGlow.rgb, active, inside);
}

#endif

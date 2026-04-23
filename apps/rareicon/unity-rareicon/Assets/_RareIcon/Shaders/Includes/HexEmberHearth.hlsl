#ifndef RAREICON_HEX_EMBER_HEARTH_INCLUDED
#define RAREICON_HEX_EMBER_HEARTH_INCLUDED

// Ember Hearth — shrine. Circular stone ring around a bed of glowing
// embers with a perpetual flame column rising from the centre.
void DrawEmberHearth(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Stone ring (outer annulus).
    float d = length(px - c);
    float ring = step(d, 9.0) * step(7.0, d) * inside;
    if (ring > 0.5)
    {
        float variance = (hash21(px + float2(17, 31)) - 0.5) * 0.12;
        color = saturate(_HearthStone.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    // Ember bed inside the ring.
    float bed = step(d, 6.0) * inside;
    if (bed > 0.5) { color = _HearthEmber.rgb * 0.55; alpha = 1.0; }

    // Bright ember pixels — randomly placed.
    float e1 = rectMask(px, c + float2(-3, -2), float2(1, 1)) * inside;
    float e2 = rectMask(px, c + float2( 2, -3), float2(1, 1)) * inside;
    float e3 = rectMask(px, c + float2(-1,  1), float2(1, 1)) * inside;
    float e4 = rectMask(px, c + float2( 3,  2), float2(1, 1)) * inside;
    float embers = max(max(e1, e2), max(e3, e4));
    if (embers > 0.5)
    {
        float tick = floor(_Time.y * 2.0);
        float phase = tick - floor(tick * 0.5) * 2.0;
        color = lerp(_HearthEmber.rgb, _HearthFlame.rgb, phase);
        alpha = 1.0;
    }

    // Central flame column — wider base, narrow top.
    float flameA = rectMask(px, c + float2(-1, 0), float2(3, 3)) * inside * active;
    if (flameA > 0.5) { color = _HearthFlame.rgb; alpha = 1.0; }
    float flameB = rectMask(px, c + float2( 0, 3), float2(1, 3)) * inside * active;
    if (flameB > 0.5) { color = _HearthFlameTip.rgb; alpha = 1.0; }

    // Small rune markers at 4 cardinal points on the stone ring.
    DrawTorchFlame(color, alpha, px, c + float2( 0, 8),
                   _HearthStone.rgb * 0.4, _HearthFlameTip.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2( 0, -8),
                   _HearthStone.rgb * 0.4, _HearthFlameTip.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2( 8,  0),
                   _HearthStone.rgb * 0.4, _HearthFlameTip.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2(-8,  0),
                   _HearthStone.rgb * 0.4, _HearthFlameTip.rgb, active, inside);
}

#endif

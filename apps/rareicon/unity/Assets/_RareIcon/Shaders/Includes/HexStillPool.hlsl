#ifndef RAREICON_HEX_STILL_POOL_INCLUDED
#define RAREICON_HEX_STILL_POOL_INCLUDED

// The Still Pool — circular reflective pond with animated ripple.
void DrawStillPool(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Outer stone rim.
    float d = length(px - c);
    float rim = step(d, 11.0) * step(10.0, d) * inside;
    if (rim > 0.5) { color = _PoolStone.rgb; alpha = 1.0; }

    DrawPool(color, alpha, px, c, 10.0, _PoolWater.rgb, _PoolRim.rgb, inside);

    // Static highlight crescent on NE quadrant.
    float dInner = length(px - (c + float2(-2, 2)));
    float crest = step(dInner, 6.0) * step(5.0, dInner) * inside;
    if (crest > 0.5) { color = _PoolHighlight.rgb; alpha = 1.0; }

    // Animated ripple ring.
    DrawPoolRipple(color, alpha, px, c, 3.0, _PoolRim.rgb, active, inside);
    DrawPoolRipple(color, alpha, px, c + float2(2, -1), 1.0, _PoolHighlight.rgb, active, inside);

    // Four small lotus lily pads at cardinal offsets.
    float lilyN = rectMask(px, c + float2(-1, 6), float2(2, 1)) * inside;
    float lilyS = rectMask(px, c + float2(-1, -7), float2(2, 1)) * inside;
    float lilyE = rectMask(px, c + float2( 6, -1), float2(1, 2)) * inside;
    float lilyW = rectMask(px, c + float2(-7, -1), float2(1, 2)) * inside;
    float lilies = max(max(lilyN, lilyS), max(lilyE, lilyW));
    if (lilies > 0.5) { color = _PoolLily.rgb; alpha = 1.0; }
}

#endif

#ifndef RAREICON_HEX_BUILDING_SHARED_INCLUDED
#define RAREICON_HEX_BUILDING_SHARED_INCLUDED

float InsideHexMask(float2 px, float grid)
{
    float2 center = float2(grid * 0.5, grid * 0.5);
    float2 p      = abs(px - center);

    float d   = dot(p, normalize(float2(1.0, 1.732)));
    float sdf = max(d, p.x) - grid * 0.25;

    return step(sdf, 0.0);
}

#endif

#ifndef RAREICON_HEX_SHARED_INCLUDED
#define RAREICON_HEX_SHARED_INCLUDED

// Common HLSL helpers for the hex tile shaders. Pure functions only — no
// CBUFFER access here, so any shader can include this without coupling.
// Tile pixel grid + per-tile seed live in the parent shader.

// SDF for a flat pointy-top hexagon centred at origin.
// d < 0 → inside, d == 0 → edge, d > 0 → outside.
float hexSDF(float2 p, float size)
{
    p = abs(p);
    float d = dot(p, normalize(float2(1.0, 1.732)));
    return max(d, p.x) - size;
}

// Cheap deterministic 2D hash → [0, 1].
float hash21(float2 p)
{
    p = frac(p * float2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return frac(p.x * p.y);
}

// Smooth value noise via bilinear interpolation of corner hashes.
float valueNoise(float2 p)
{
    float2 i = floor(p);
    float2 f = frac(p);
    float2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + float2(1, 0));
    float c = hash21(i + float2(0, 1));
    float d = hash21(i + float2(1, 1));
    return lerp(lerp(a, b, u.x), lerp(c, d, u.x), u.y);
}

// Hard pixel-grid masks used by every decoration (1 inside, 0 outside).
float rectMask(float2 p, float2 origin, float2 size)
{
    float2 lo = step(origin, p);
    float2 hi = step(p, origin + size - 1.0);
    return lo.x * lo.y * hi.x * hi.y;
}

float circleMask(float2 p, float2 c, float r)
{
    return step(length(p - c), r);
}

#endif // RAREICON_HEX_SHARED_INCLUDED

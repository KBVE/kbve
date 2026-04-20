#ifndef RAREICON_HEX_BUILDING_SHARED_INCLUDED
#define RAREICON_HEX_BUILDING_SHARED_INCLUDED

// Shared helpers for every HexBuilding decoration. Lives on the 48-grid
// quad that HexBuilding.shader samples: all coords below are in pixel
// space and every building's `Draw*` function can gate its composite
// through InsideHexMask so structures never punch past the tile outline.

// 1 inside the single hex the building occupies, 0 outside.
//
// The building quad is 1.5 world units wide so it can host the Capital's
// 7-hex flower footprint. Single-hex buildings (Farm, Barracks, Furnace)
// only occupy the CENTER hex of that area — roughly the inner third of
// the quad. Clipping to `grid * 0.46` would target the full quad, which
// lets art paint into neighbouring tiles; `grid * 0.25` gives a hex ~24
// px flat-to-flat at grid=48, tight enough that single-hex compositions
// stay inside the tile they're placed on while still leaving room for
// the Barracks foundation (±9 px) and other trim the art pushes out to.
//
// Use like: `float inside = InsideHexMask(px, grid);` at the top of a
// DrawX function, then multiply every shape mask by `inside` before the
// alpha gate.
float InsideHexMask(float2 px, float grid)
{
    float2 center = float2(grid * 0.5, grid * 0.5);
    float2 p      = abs(px - center);

    // Pointy-top hex SDF in pixel space. 1.732 ≈ sqrt(3).
    float d   = dot(p, normalize(float2(1.0, 1.732)));
    float sdf = max(d, p.x) - grid * 0.25;

    return step(sdf, 0.0);
}

#endif // RAREICON_HEX_BUILDING_SHARED_INCLUDED

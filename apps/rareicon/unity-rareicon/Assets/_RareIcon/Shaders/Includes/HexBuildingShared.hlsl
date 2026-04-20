#ifndef RAREICON_HEX_BUILDING_SHARED_INCLUDED
#define RAREICON_HEX_BUILDING_SHARED_INCLUDED

// Shared helpers for every HexBuilding decoration. Lives on the 48-grid
// quad that HexBuilding.shader samples: all coords below are in pixel
// space and every building's `Draw*` function can gate its composite
// through InsideHexMask so structures never punch past the tile outline.

// 1 inside the single hex the building occupies, 0 outside.
// The inset (grid * 0.46) is tight enough to cap runaway silhouettes
// but leaves a 2-pixel safety margin so the outer rim of the draw
// doesn't alias against the hex border line drawn by the tile shader.
//
// Use like: `float inside = InsideHexMask(px, grid);` at the top of a
// DrawX function, then multiply every shape mask by `inside` before the
// alpha gate. One-line gate per shape keeps the existing rectMask /
// circleMask calls readable while guaranteeing hex-respecting output.
float InsideHexMask(float2 px, float grid)
{
    float2 center = float2(grid * 0.5, grid * 0.5);
    float2 p      = abs(px - center);

    // Flat-top hex SDF in pixel space. 1.732 ≈ sqrt(3).
    float d   = dot(p, normalize(float2(1.0, 1.732)));
    float sdf = max(d, p.x) - grid * 0.46;

    return step(sdf, 0.0);
}

#endif // RAREICON_HEX_BUILDING_SHARED_INCLUDED

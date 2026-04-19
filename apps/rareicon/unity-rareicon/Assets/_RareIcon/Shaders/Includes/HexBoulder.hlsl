#ifndef RAREICON_HEX_BOULDER_INCLUDED
#define RAREICON_HEX_BOULDER_INCLUDED

// Per-hex procedural boulder. Each tile rolls its own silhouette from the
// shared seed: main mass radius, 2-4 lumps at varied positions/sizes, an
// optional companion pebble, a small per-tile color jitter, and a single
// highlight pixel on the lit side. Reads as natural rock variation across
// adjacent hexes rather than the same stamp everywhere.
//
// Uniforms: _StoneColor, _StoneShade
// Helpers: circleMask, hash21 (from HexShared.hlsl).
float3 ApplyBoulder(float3 ground, float2 px, float grid, float seed)
{
    // Per-tile palette jitter — keeps boulders in the family but not identical.
    float colorJit = (hash21(float2(seed, 88.0)) - 0.5) * 0.18;
    float3 lit   = saturate(_StoneColor.rgb * (1.0 + colorJit));
    float3 shade = saturate(_StoneShade.rgb * (1.0 + colorJit));

    // === Main boulder ===
    float2 c1 = float2(grid * 0.5, grid * 0.4) + float2(
        floor((hash21(float2(seed, 71.0)) - 0.5) * 4.0),
        floor((hash21(float2(seed, 72.0)) - 0.5) * 3.0));

    // Main mass radius varies 2.4–3.4 — small pebble vs chunky boulder.
    float r1 = 2.4 + hash21(float2(seed, 73.0)) * 1.0;
    float boulder = circleMask(px, c1, r1);

    // Lump 1 (always present) — adds asymmetry.
    float2 lo1 = float2(
        (hash21(float2(seed, 74.0)) - 0.5) * 4.0,
        (hash21(float2(seed, 75.0)) - 0.5) * 3.0);
    boulder = max(boulder,
        circleMask(px, c1 + lo1, 1.5 + hash21(float2(seed, 76.0)) * 0.9));

    // Lump 2 (~70% chance).
    if (hash21(float2(seed, 77.0)) > 0.30)
    {
        float2 lo2 = float2(
            (hash21(float2(seed, 78.0)) - 0.5) * 4.5,
            (hash21(float2(seed, 79.0)) - 0.5) * 2.5);
        boulder = max(boulder,
            circleMask(px, c1 + lo2, 1.3 + hash21(float2(seed, 80.0)) * 0.8));
    }

    // Lump 3 (~50% chance, biased downward → "rests on the ground" feel).
    if (hash21(float2(seed, 81.0)) > 0.50)
    {
        float2 lo3 = float2(
            (hash21(float2(seed, 82.0)) - 0.5) * 4.0,
            (hash21(float2(seed, 83.0)) - 0.5) * 2.0 - 0.5);
        boulder = max(boulder,
            circleMask(px, c1 + lo3, 1.4 + hash21(float2(seed, 84.0)) * 0.7));
    }

    // Top-half lit / bottom-half shaded — keeps the volume read.
    float3 stoneCol = (px.y > c1.y - 0.5) ? lit : shade;
    float3 result = lerp(ground, stoneCol, boulder);

    // Single highlight pixel on the upper lit side — reads as a sun catch.
    float2 hp = c1 + float2(0.0, r1 - 1.0)
                   + float2(floor((hash21(float2(seed, 85.0)) - 0.5) * 2.0), 0.0);
    float highlight = step(length(px - hp), 0.6) * boulder;
    result = lerp(result, lit * 1.25, highlight);

    // === Companion pebble (~40% chance) ===
    if (hash21(float2(seed, 89.0)) > 0.60)
    {
        float side = (hash21(float2(seed, 90.0)) > 0.5) ? 1.0 : -1.0;
        float2 c2 = c1 + float2(
            side * (r1 + 1.5 + hash21(float2(seed, 91.0)) * 1.5),
            (hash21(float2(seed, 92.0)) - 0.5) * 2.0 - 0.5);

        float pebble = circleMask(px, c2, 1.0 + hash21(float2(seed, 93.0)) * 0.9);

        // Optional small lump on the pebble itself.
        if (hash21(float2(seed, 94.0)) > 0.5)
        {
            float2 plo = c2 + float2(
                (hash21(float2(seed, 95.0)) - 0.5) * 2.0,
                (hash21(float2(seed, 96.0)) - 0.5) * 1.5);
            pebble = max(pebble, circleMask(px, plo, 1.0));
        }

        float3 pebbleCol = (px.y > c2.y - 0.5) ? lit : shade;
        result = lerp(result, pebbleCol, pebble);
    }

    return result;
}

#endif // RAREICON_HEX_BOULDER_INCLUDED

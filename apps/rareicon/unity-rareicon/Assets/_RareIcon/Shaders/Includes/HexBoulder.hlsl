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
//
// `amount` is the per-instance _FloorAmounts.x (HexResources.Stone /
// 100): main boulder always renders when called, but the optional
// companion pebble is gated on amount > 0.5 so a heavily-mined hex
// reads as a single weathered rock instead of a full outcrop.
float3 ApplyBoulder(float3 ground, float2 px, float grid, float seed, float amount)
{
    // Per-tile palette jitter — keeps boulders in the family but not identical.
    float colorJit = (hash21(float2(seed, 88.0)) - 0.5) * 0.18;
    float3 lit   = saturate(_StoneColor.rgb * (1.0 + colorJit));
    float3 shade = saturate(_StoneShade.rgb * (1.0 + colorJit));

    // Pixel-space scale. 1.0 at legacy 16-grid, 2.0 at the 32-grid bump.
    // Raw pixel radii / offsets multiply by s so the boulder silhouette
    // stays the same on-screen size; grid-relative coords auto-track.
    float s = grid * 0.0625;

    // === Main boulder ===
    float2 c1 = float2(grid * 0.5, grid * 0.4) + float2(
        floor((hash21(float2(seed, 71.0)) - 0.5) * 4.0 * s),
        floor((hash21(float2(seed, 72.0)) - 0.5) * 3.0 * s));

    // Main mass radius varies 2.4–3.4 — small pebble vs chunky boulder.
    float r1 = (2.4 + hash21(float2(seed, 73.0)) * 1.0) * s;
    float boulder = circleMask(px, c1, r1);

    // Lump 1 (always present) — adds asymmetry.
    float2 lo1 = float2(
        (hash21(float2(seed, 74.0)) - 0.5) * 4.0 * s,
        (hash21(float2(seed, 75.0)) - 0.5) * 3.0 * s);
    boulder = max(boulder,
        circleMask(px, c1 + lo1, (1.5 + hash21(float2(seed, 76.0)) * 0.9) * s));

    // Lump 2 (~70% chance).
    if (hash21(float2(seed, 77.0)) > 0.30)
    {
        float2 lo2 = float2(
            (hash21(float2(seed, 78.0)) - 0.5) * 4.5 * s,
            (hash21(float2(seed, 79.0)) - 0.5) * 2.5 * s);
        boulder = max(boulder,
            circleMask(px, c1 + lo2, (1.3 + hash21(float2(seed, 80.0)) * 0.8) * s));
    }

    // Lump 3 (~50% chance, biased downward → "rests on the ground" feel).
    if (hash21(float2(seed, 81.0)) > 0.50)
    {
        float2 lo3 = float2(
            (hash21(float2(seed, 82.0)) - 0.5) * 4.0 * s,
            (hash21(float2(seed, 83.0)) - 0.5) * 2.0 * s - 0.5 * s);
        boulder = max(boulder,
            circleMask(px, c1 + lo3, (1.4 + hash21(float2(seed, 84.0)) * 0.7) * s));
    }

    // Top-half lit / bottom-half shaded — keeps the volume read.
    float3 stoneCol = (px.y > c1.y - 0.5 * s) ? lit : shade;
    float3 result = lerp(ground, stoneCol, boulder);

    // Single highlight pixel on the upper lit side — reads as a sun catch.
    float2 hp = c1 + float2(0.0, r1 - 1.0 * s)
                   + float2(floor((hash21(float2(seed, 85.0)) - 0.5) * 2.0 * s), 0.0);
    float highlight = step(length(px - hp), 0.6 * s) * boulder;
    result = lerp(result, lit * 1.25, highlight);

    // === Companion pebble (~40% chance, gated on full-stone hexes) ===
    if (amount > 0.5 && hash21(float2(seed, 89.0)) > 0.60)
    {
        float side = (hash21(float2(seed, 90.0)) > 0.5) ? 1.0 : -1.0;
        float2 c2 = c1 + float2(
            side * (r1 + 1.5 * s + hash21(float2(seed, 91.0)) * 1.5 * s),
            (hash21(float2(seed, 92.0)) - 0.5) * 2.0 * s - 0.5 * s);

        float pebble = circleMask(px, c2, (1.0 + hash21(float2(seed, 93.0)) * 0.9) * s);

        // Optional small lump on the pebble itself.
        if (hash21(float2(seed, 94.0)) > 0.5)
        {
            float2 plo = c2 + float2(
                (hash21(float2(seed, 95.0)) - 0.5) * 2.0 * s,
                (hash21(float2(seed, 96.0)) - 0.5) * 1.5 * s);
            pebble = max(pebble, circleMask(px, plo, 1.0 * s));
        }

        float3 pebbleCol = (px.y > c2.y - 0.5 * s) ? lit : shade;
        result = lerp(result, pebbleCol, pebble);
    }

    return result;
}

#endif // RAREICON_HEX_BOULDER_INCLUDED

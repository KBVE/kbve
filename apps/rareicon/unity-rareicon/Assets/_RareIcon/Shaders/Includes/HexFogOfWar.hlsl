#ifndef RAREICON_HEX_FOG_OF_WAR_INCLUDED
#define RAREICON_HEX_FOG_OF_WAR_INCLUDED

// Top-down fog-of-war wash. Dimensional companion to HexTerritoryEdge.hlsl —
// reads the per-instance _Fog float written by FogBakeSystem:
//
//   fog == 0 → clear (player-visible), no-op
//   fog == 1 → explored-stale (dimmed but readable)
//   fog == 2 → unexplored (heavy fog with voronoi-noise edge)
//
// Voronoi noise math ported from the Godot smoke-billboard shader the user
// shared; we keep the noise but skip the vertex displacement / cull_front
// outline pass — those are 3D-billboard tricks that don't fit our flat
// instanced hex quads. Edge between visible and fogged hexes uses the same
// noise to break up the otherwise-perfect hex silhouette.
//
// Uniforms (declared in the calling shader):
//   _Fog                       per-instance MaterialProperty
//   _FogColor                  base fog tint (dark blue / charcoal)
//   _FogExploredColor          mid-state tint
//   _FogNoiseDensity / Speed   voronoi animation tuning

float2 RareiconFogVoronoiRandom(float2 uv, float offset)
{
    float2x2 m = float2x2(15.27, 47.63, 99.41, 89.98);
    uv = frac(sin(mul(m, uv)) * 46839.32);
    return float2(sin(uv.y * offset) * 0.5 + 0.5,
                  cos(uv.x * offset) * 0.5 + 0.5);
}

// Returns the distance to the nearest voronoi cell point in [0,~1].
float RareiconFogVoronoi(float2 uv, float angleOffset, float density)
{
    float2 g = floor(uv * density);
    float2 f = frac(uv * density);
    float bestD = 8.0;
    [unroll]
    for (int y = -1; y <= 1; y++)
    {
        [unroll]
        for (int x = -1; x <= 1; x++)
        {
            float2 lattice = float2(x, y);
            float2 offset  = RareiconFogVoronoiRandom(lattice + g, angleOffset);
            float  d       = distance(lattice + offset, f);
            bestD = min(bestD, d);
        }
    }
    return bestD;
}

// Sample animated voronoi noise at a world-space point. Output is in [0,1]
// with high values inside cells and low values along cell borders, so we
// can use (1 - noise) for "edge mask" or noise directly for a wispy fill.
float RareiconFogNoise(float2 worldPos, float speed, float density)
{
    float t = _Time.y * speed;
    float a = pow(saturate(RareiconFogVoronoi(worldPos        + t,  2.0, density)), 0.9);
    float b = pow(saturate(RareiconFogVoronoi(worldPos.yx * 0.93 + t, 2.0, density * 0.6)), 0.9);
    return saturate(a * 0.6 + b * 0.4);
}

// Apply the fog wash on top of an already-shaded ground colour. `fog` is
// continuous in [0, 2]: 0 = clear, 1 = explored-stale, 2 = unexplored.
// FogBakeSystem hands us the smooth distance-falloff so vision-radius
// edges fade gradually instead of snapping between buckets — we lerp
// across both stage transitions so that gradient survives to the screen.
// `worldPos` is the tile's world-space xy; `d` is the hex SDF used for
// rim softening on the heaviest fog band.
float3 ApplyFog(float3 ground, float2 worldPos, float d, float fog)
{
    if (fog < 0.001) return ground;

    float noise = RareiconFogNoise(worldPos, _FogNoiseSpeed, _FogNoiseDensity);

    // Stage 1 (fog 0..1): clear → explored-stale. Linear fade toward the
    // explored tint scaled by noise so the falloff has motion at its edge.
    float clearMix = saturate(fog) * (0.70 + 0.15 * noise);
    float3 mid     = lerp(ground, _FogExploredColor.rgb, clearMix);

    if (fog < 1.001) return mid;

    // Stage 2 (fog 1..2): explored-stale → unexplored. Voronoi noise
    // modulates the fog *colour* so the canopy reads as moving cloud
    // volume; ground stays hidden at full fog except for a narrow rim
    // bleed that prevents the hex silhouette from looking like a stamped
    // disc.
    float3 fogTint = lerp(_FogColor.rgb, _FogColor.rgb * 1.35, noise);
    float interior = 1.0 - saturate(smoothstep(-0.005, 0.005, d));
    float reveal   = (1.0 - interior) * 0.10;
    float3 heavy   = lerp(fogTint, ground, reveal);

    float stage2Mix = saturate(fog - 1.0);
    return lerp(mid, heavy, stage2Mix);
}

#endif // RAREICON_HEX_FOG_OF_WAR_INCLUDED

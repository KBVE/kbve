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

// Apply the fog wash on top of an already-shaded ground colour. `worldPos`
// is the tile's world-space xy (we pass in `IN.worldPos` from the vertex
// stage); `d` is the hex SDF used for the territory edge so we can soften
// the fog along the rim instead of clipping hard.
float3 ApplyFog(float3 ground, float2 worldPos, float d, float fog)
{
    if (fog < 0.5) return ground;

    float noise = RareiconFogNoise(worldPos, _FogNoiseSpeed, _FogNoiseDensity);

    if (fog < 1.5)
    {
        // Explored-stale: dim toward fog tint but keep biome readable. Noise
        // adds a soft moving haze instead of a flat wash.
        float k = 0.45 + 0.20 * noise;
        return lerp(ground, _FogExploredColor.rgb, k);
    }

    // Unexplored: near-opaque fog, with the voronoi noise pushing brightness
    // around the cell so the canopy reads as cloud volumes rather than a
    // dead mask. Edge softening uses the hex SDF so adjacent visible tiles
    // don't expose a hard hex silhouette through the fog.
    float fogStrength = saturate(0.85 + 0.15 * noise);
    float3 fogged = lerp(_FogColor.rgb, ground, 0.05 + 0.10 * noise);
    float edgeMask = saturate(smoothstep(-0.02, 0.02, d));
    return lerp(fogged, ground, (1.0 - fogStrength) * (1.0 - edgeMask));
}

#endif // RAREICON_HEX_FOG_OF_WAR_INCLUDED

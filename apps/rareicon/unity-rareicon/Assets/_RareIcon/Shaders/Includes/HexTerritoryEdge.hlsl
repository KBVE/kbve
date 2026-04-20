#ifndef RAREICON_HEX_TERRITORY_EDGE_INCLUDED
#define RAREICON_HEX_TERRITORY_EDGE_INCLUDED

// Gold empire border drawn along the outer rim of any tile flagged
// as "edge" by TerritoryBakeSystem. Interior tiles get a warm-tinted
// wash so the claimed area reads at a glance even without the border.
//
//   territory == 0 → no-op (outside any empire)
//   territory == 1 → interior: soft tint multiplier
//   territory == 2 → edge:     tint + stroke along the hex rim
//
// Uniforms: _Territory (per-instance), _TerritoryEdge, _TerritoryTint
// `d` is the hex SDF in local-space (negative inside, zero at the edge).
float3 ApplyTerritory(float3 ground, float d, float territory)
{
    // Branchless classify — kills the interior pass for tiles with
    // territory < 0.5 and the stroke pass for tiles with territory < 1.5.
    float inside = step(0.5, territory);
    float edge   = step(1.5, territory);
    if (inside < 0.5) return ground;

    // Interior wash — lerp by a small factor so the biome base still
    // dominates and the territory feels like a claim, not a paint job.
    float3 tinted = lerp(ground, ground * _TerritoryTint.rgb, 0.18);
    ground = lerp(ground, tinted, inside);

    if (edge < 0.5) return ground;

    // Edge stroke — band just inside the hex rim. d is negative inside,
    // so -d gives distance-from-edge; narrow window draws the gold line.
    float strokeInner = 0.018;
    float strokeOuter = 0.040;
    float t = smoothstep(strokeOuter, strokeInner, -d);
    return lerp(ground, _TerritoryEdge.rgb, t * _TerritoryEdge.a);
}

#endif // RAREICON_HEX_TERRITORY_EDGE_INCLUDED

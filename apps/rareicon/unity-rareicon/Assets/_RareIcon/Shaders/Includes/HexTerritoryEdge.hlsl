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
    // territory == 0 → not owned, no-op. Branchless early-out.
    if (territory < 0.5) return ground;

    // Interior wash — blend toward the tint colour directly instead of
    // modulating the ground (a multiply by a near-white colour is
    // effectively invisible). 25% lerp reads as "claimed" at a glance
    // without overpowering the biome base underneath.
    ground = lerp(ground, _TerritoryTint.rgb, 0.25);

    // Edge classify — any tile with at least one neighbour outside the
    // empire (set to 2 by TerritoryBakeSystem) gets the gold stroke.
    if (territory < 1.5) return ground;

    // Stroke band — sits INSIDE the main border line (which lives at
    // -d ∈ [0.018, 0.06]). We paint between 0.060 and 0.020 so the gold
    // extends slightly past the dark border inward + is wide enough to
    // read at camera height. Caller draws the main border AFTER this
    // include, so the dark line settles over the outer rim and the gold
    // sits just inside it — reads as a framed claim, not a fight.
    float t = smoothstep(0.090, 0.030, -d);
    return lerp(ground, _TerritoryEdge.rgb, t * _TerritoryEdge.a);
}

#endif // RAREICON_HEX_TERRITORY_EDGE_INCLUDED

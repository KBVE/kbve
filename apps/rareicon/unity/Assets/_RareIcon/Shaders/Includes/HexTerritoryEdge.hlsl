#ifndef RAREICON_HEX_TERRITORY_EDGE_INCLUDED
#define RAREICON_HEX_TERRITORY_EDGE_INCLUDED

// Faction-aware territory wash. TerritoryBakeSystem encodes the owning
// faction in the integer bucket of the per-tile float so the shader can
// pick the right tint/edge palette without a second material property:
//
//   territory == 0     → no-op (outside any empire)
//   territory == 1     → player interior — gold tint
//   territory == 2     → player edge     — gold stroke
//   territory == 4     → hostile interior — red tint
//   territory == 5     → hostile edge     — red stroke
//
// Uniforms: _Territory (per-instance), _TerritoryEdge / _TerritoryTint
// (player), _HostileTerritoryEdge / _HostileTerritoryTint (hostile).
// `d` is the hex SDF in local-space (negative inside, zero at the edge).
float3 ApplyTerritory(float3 ground, float d, float territory)
{
    // territory == 0 → not owned, no-op. Branchless early-out.
    if (territory < 0.5) return ground;

    bool   hostile = territory > 2.5;
    float3 tint    = hostile ? _HostileTerritoryTint.rgb : _TerritoryTint.rgb;
    float4 edgeRGBA = hostile ? _HostileTerritoryEdge   : _TerritoryEdge;

    // Interior wash — 25% lerp reads as "claimed" at a glance without
    // overpowering the biome base underneath.
    ground = lerp(ground, tint, 0.25);

    // Edge classify — player edge sits at 2, hostile edge at 5; everything
    // else is interior so we early-out before the stroke pass.
    bool isEdge = (!hostile && territory > 1.5) || (hostile && territory > 4.5);
    if (!isEdge) return ground;

    // Stroke band — sits INSIDE the main border line (which lives at
    // -d ∈ [0.018, 0.06]). Paint between 0.090 and 0.030 so the colour
    // extends slightly past the dark border inward + is wide enough to
    // read at camera height. Caller draws the main border AFTER this
    // include, so the dark line settles over the outer rim and the
    // territory stroke sits just inside it.
    float t = smoothstep(0.090, 0.030, -d);
    return lerp(ground, edgeRGBA.rgb, t * edgeRGBA.a);
}

#endif // RAREICON_HEX_TERRITORY_EDGE_INCLUDED

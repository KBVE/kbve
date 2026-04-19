using System.Collections.Generic;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Greedy steepest-descent river routing over BiomeGenerator's elevation
    /// field. Picks high-elevation source hexes on a regular grid, walks
    /// downhill via 6-neighbor lookup, terminates at lake/ocean banks (or as
    /// a tributary into an existing river, or stalls in a basin).
    ///
    /// Deterministic from BiomeGenerator's seed — same world → same rivers.
    /// Roads will follow the same emit-polyline pattern via a separate
    /// RoadRouter (A* between cities) when that lands.
    /// </summary>
    public sealed class RiverRouter
    {
        const float HexSize = 0.25f;

        // Routing tuning.
        const float SourceMinElevation = 0.42f;     // only highlands seed rivers
        const int   SourceGridSpacing  = 12;        // hex spacing between candidates
        const int   MaxStepsPerRiver   = 400;       // safety cap on walk length
        const int   MinRiverHexes      = 6;         // discard trickles
        const float StartWidth         = 0.10f;
        const float EndWidth           = 0.40f;
        const int   SmoothSubdivisions = 8;

        // Pointy-top axial neighbour offsets.
        static readonly int2[] HexNeighbors = new[]
        {
            new int2( 1,  0), new int2( 1, -1), new int2( 0, -1),
            new int2(-1,  0), new int2(-1,  1), new int2( 0,  1),
        };

        readonly BiomeGenerator _biomes;

        public RiverRouter(BiomeGenerator biomes)
        {
            _biomes = biomes;
        }

        public List<RiverDefinition> RouteRegion(int2 centerHex, int radiusHexes)
        {
            var rivers = new List<RiverDefinition>();
            var occupied = new HashSet<long>(); // hexes already part of an emitted river

            int min = -radiusHexes;
            int max = radiusHexes;

            for (int r = min; r <= max; r += SourceGridSpacing)
            {
                for (int q = min; q <= max; q += SourceGridSpacing)
                {
                    int2 candidate = new int2(centerHex.x + q, centerHex.y + r);
                    var route = TryRouteFrom(candidate, occupied);
                    if (route != null) rivers.Add(route);
                }
            }

            Debug.Log($"[RiverRouter] Routed {rivers.Count} rivers in region " +
                      $"(center=({centerHex.x},{centerHex.y}), radius={radiusHexes})");
            return rivers;
        }

        RiverDefinition TryRouteFrom(int2 sourceHex, HashSet<long> occupied)
        {
            var sourceWorld = HexMeshUtil.HexToWorld(sourceHex.x, sourceHex.y, HexSize);
            var sourceSample = _biomes.SampleAll(sourceWorld.x, sourceWorld.y);

            if (sourceSample.LandHeight < SourceMinElevation) return null;
            if (IsWater(sourceSample.Biome)) return null;
            if (occupied.Contains(Pack(sourceHex))) return null; // overlapping headwater

            var hexPath = new List<int2>(64);
            var localVisited = new HashSet<long>();
            int2 current = sourceHex;
            float currentElev = sourceSample.LandHeight;

            hexPath.Add(current);
            localVisited.Add(Pack(current));

            bool terminatedAtWater = false;
            int2 mouth = current;

            for (int step = 0; step < MaxStepsPerRiver; step++)
            {
                int2 best = current;
                float bestElev = currentElev;
                bool seesWater = false;
                bool seesTributary = false;
                int2 tributaryHex = default;

                for (int i = 0; i < 6; i++)
                {
                    int2 n = current + HexNeighbors[i];
                    if (localVisited.Contains(Pack(n))) continue;

                    // Walking into an already-routed river → tributary join.
                    // Take the first one we see and stop after this step.
                    if (occupied.Contains(Pack(n)))
                    {
                        seesTributary = true;
                        tributaryHex = n;
                        continue;
                    }

                    var nWorld = HexMeshUtil.HexToWorld(n.x, n.y, HexSize);
                    var nSample = _biomes.SampleAll(nWorld.x, nWorld.y);

                    // Reaching water terminates the river — but we DON'T add the
                    // water hex; the river's mouth stays on the last land hex
                    // so the strip ends at the lake/ocean bank, not inside it.
                    if (IsWater(nSample.Biome))
                    {
                        seesWater = true;
                        continue;
                    }

                    if (nSample.LandHeight < bestElev)
                    {
                        bestElev = nSample.LandHeight;
                        best = n;
                    }
                }

                if (seesWater)
                {
                    mouth = current;
                    terminatedAtWater = true;
                    break;
                }
                if (seesTributary)
                {
                    // Include the join hex so meshes touch visibly.
                    hexPath.Add(tributaryHex);
                    mouth = tributaryHex;
                    terminatedAtWater = true;
                    break;
                }

                // No downhill neighbour — basin. Stop here.
                if (best.Equals(current)) { mouth = current; break; }

                current = best;
                currentElev = bestElev;
                hexPath.Add(current);
                localVisited.Add(Pack(current));
                mouth = current;
            }

            if (hexPath.Count < MinRiverHexes) return null;

            // Reserve the path so future candidates find a tributary join here.
            for (int i = 0; i < hexPath.Count; i++)
                occupied.Add(Pack(hexPath[i]));

            // Hex centers → world points.
            var raw = new List<float2>(hexPath.Count);
            for (int i = 0; i < hexPath.Count; i++)
            {
                var w = HexMeshUtil.HexToWorld(hexPath[i].x, hexPath[i].y, HexSize);
                raw.Add(new float2(w.x, w.y));
            }

            // Catmull-Rom smooth, then trim against water — covers the case
            // where the smoothed curve overshoots into a lake/ocean even
            // though every hex center on the walked path is dry.
            var smooth = PolylineDecalMeshUtil.Smooth(raw, SmoothSubdivisions);
            smooth = TrimAtWater(smooth);
            if (smooth.Count < 2) return null;

            // Per-vertex linear width taper across the (possibly trimmed) length.
            var widths = new List<float>(smooth.Count);
            for (int i = 0; i < smooth.Count; i++)
            {
                float t = smooth.Count == 1 ? 0f : (float)i / (smooth.Count - 1);
                widths.Add(math.lerp(StartWidth, EndWidth, t));
            }

            return new RiverDefinition
            {
                Points = smooth,
                Widths = widths,
                SourceHex = sourceHex,
                MouthHex = mouth,
                TerminatesAtWater = terminatedAtWater,
            };
        }

        // Walk the smoothed polyline forward; cut at the first point whose
        // world position falls inside a water biome. Catches Catmull-Rom
        // overshoot into lakes that don't appear on the walked-hex path.
        List<float2> TrimAtWater(List<float2> points)
        {
            var result = new List<float2>(points.Count);
            for (int i = 0; i < points.Count; i++)
            {
                var p = points[i];
                byte b = _biomes.Sample(p.x, p.y);
                if (IsWater(b)) break;
                result.Add(p);
            }
            return result;
        }

        static bool IsWater(byte biome) =>
            biome == BiomeGenerator.BIOME_OCEAN || biome == BiomeGenerator.BIOME_LAKE;

        static long Pack(int2 v) => ((long)v.x << 32) | (uint)v.y;
    }
}

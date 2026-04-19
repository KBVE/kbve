using System.Collections.Generic;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Greedy steepest-descent river routing over BiomeGenerator's elevation
    /// field. Picks high-elevation source hexes on a regular grid, walks
    /// downhill via 6-neighbor lookup with a small deterministic jitter so
    /// near-flat areas don't produce monotonic straight-line rivers, terminates
    /// at lake/ocean banks (river ends on the last land hex, never inside the
    /// water body) or merges into an existing river as a tributary.
    ///
    /// Deterministic from BiomeGenerator's seed — same world → same rivers.
    /// </summary>
    public sealed class RiverRouter
    {
        const float HexSize = 0.25f;

        // Routing tuning.
        const float SourceMinElevation = 0.48f;     // only true highlands seed rivers
        const int   SourceGridSpacing  = 12;
        const int   MaxStepsPerRiver   = 80;        // ~20 world units; longer feels artificial
        const int   MinRiverHexes      = 12;        // drop trivial fragments
        const float StartWidth         = 0.10f;
        const float EndWidth           = 0.30f;     // smaller cap → less lateral spillover
        const int   SmoothSubdivisions = 8;

        // Per-hex elevation jitter — breaks ties and forces meandering on
        // near-flat slopes. Small enough not to override real elevation drops.
        const float ElevationJitter    = 0.015f;

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
            var occupied = new HashSet<long>();

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
            if (occupied.Contains(Pack(sourceHex))) return null;

            var hexPath = new List<int2>(64);
            var localVisited = new HashSet<long>();
            int2 current = sourceHex;
            float currentElev = sourceSample.LandHeight + Jitter(sourceHex);

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

                    if (occupied.Contains(Pack(n)))
                    {
                        seesTributary = true;
                        tributaryHex = n;
                        continue;
                    }

                    var nWorld = HexMeshUtil.HexToWorld(n.x, n.y, HexSize);
                    var nSample = _biomes.SampleAll(nWorld.x, nWorld.y);

                    if (IsWater(nSample.Biome))
                    {
                        seesWater = true;
                        continue;
                    }

                    // Per-hex jitter forces variation when neighbours are
                    // nearly equal in elevation (which is most of an FBm field).
                    float effectiveElev = nSample.LandHeight + Jitter(n);
                    if (effectiveElev < bestElev)
                    {
                        bestElev = effectiveElev;
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
                    hexPath.Add(tributaryHex);
                    mouth = tributaryHex;
                    terminatedAtWater = true;
                    break;
                }

                if (best.Equals(current)) { mouth = current; break; }

                current = best;
                currentElev = bestElev;
                hexPath.Add(current);
                localVisited.Add(Pack(current));
                mouth = current;
            }

            if (hexPath.Count < MinRiverHexes) return null;

            for (int i = 0; i < hexPath.Count; i++)
                occupied.Add(Pack(hexPath[i]));

            var raw = new List<float2>(hexPath.Count);
            for (int i = 0; i < hexPath.Count; i++)
            {
                var w = HexMeshUtil.HexToWorld(hexPath[i].x, hexPath[i].y, HexSize);
                raw.Add(new float2(w.x, w.y));
            }

            var smooth = PolylineDecalMeshUtil.Smooth(raw, SmoothSubdivisions);

            // Width profile (computed against the FULL smoothed length so
            // clipped rivers stay narrow at their cut end).
            var widths = new List<float>(smooth.Count);
            for (int i = 0; i < smooth.Count; i++)
            {
                float t = smooth.Count == 1 ? 0f : (float)i / (smooth.Count - 1);
                widths.Add(math.lerp(StartWidth, EndWidth, t));
            }

            var (trimmedPoints, trimmedWidths) = TrimAtWater(smooth, widths);
            if (trimmedPoints.Count < 2) return null;

            return new RiverDefinition
            {
                Points = trimmedPoints,
                Widths = trimmedWidths,
                SourceHex = sourceHex,
                MouthHex = mouth,
                TerminatesAtWater = terminatedAtWater,
            };
        }

        // Trim the smoothed polyline at the first sample whose biome is water
        // — sampling not just the centerline but also two lateral points at
        // the strip's half-width, so the visible mesh edges never poke into
        // ocean or lake hexes.
        (List<float2>, List<float>) TrimAtWater(List<float2> points, List<float> widths)
        {
            var resultPoints = new List<float2>(points.Count);
            var resultWidths = new List<float>(points.Count);

            for (int i = 0; i < points.Count; i++)
            {
                var p = points[i];

                // Centerline check.
                if (IsWater(_biomes.Sample(p.x, p.y))) break;

                // Lateral checks — perpendicular to flow direction at the
                // strip's half-width on each side.
                float2 tangent = i + 1 < points.Count
                    ? math.normalizesafe(points[i + 1] - p, new float2(1f, 0f))
                    : (i > 0 ? math.normalizesafe(p - points[i - 1], new float2(1f, 0f))
                             : new float2(1f, 0f));
                float2 perp = new float2(-tangent.y, tangent.x);
                float halfW = widths[i] * 0.5f;

                if (IsWater(_biomes.Sample(p.x + perp.x * halfW, p.y + perp.y * halfW))) break;
                if (IsWater(_biomes.Sample(p.x - perp.x * halfW, p.y - perp.y * halfW))) break;

                resultPoints.Add(p);
                resultWidths.Add(widths[i]);
            }
            return (resultPoints, resultWidths);
        }

        // Deterministic per-hex jitter in [-amount, +amount]. Same hex coord
        // always produces the same offset → reproducible rivers.
        static float Jitter(int2 hex)
        {
            // Cheap integer hash — inlined so we don't allocate.
            uint h = (uint)hex.x * 0x9E3779B1u ^ (uint)hex.y * 0x85EBCA77u;
            h ^= h >> 13;
            h *= 0xC2B2AE3Du;
            h ^= h >> 16;
            float u01 = (h & 0xFFFFFF) / (float)0xFFFFFF;
            return (u01 - 0.5f) * 2f * ElevationJitter;
        }

        // Decal creeks terminate at any "water already here" — ocean OR a major
        // river hex. So small rivers naturally merge into the BIOME_RIVER spine.
        static bool IsWater(byte biome) =>
            biome == BiomeGenerator.BIOME_OCEAN || biome == BiomeGenerator.BIOME_RIVER;

        static long Pack(int2 v) => ((long)v.x << 32) | (uint)v.y;
    }
}

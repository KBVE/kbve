using System.Collections.Generic;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Builds a quad-strip mesh from a polyline of world points.
    /// Shared by river + road decal layers — only the assigned material differs.
    ///
    /// UV layout:
    ///   u (0 → 1) — cross-section across the strip width
    ///   v (0 → totalLength) — distance along the polyline (in world units)
    /// Shaders use v for flow scroll and u for soft edge fade.
    /// </summary>
    public static class PolylineDecalMeshUtil
    {
        /// <summary>
        /// Catmull-Rom subdivide a control polyline into a smooth curve.
        /// `subdivisions` is the number of interpolated points per input segment
        /// (subdivisions=1 returns the input unchanged). End-tangents are
        /// extrapolated by mirroring the first/last segment.
        /// </summary>
        public static List<float2> Smooth(IReadOnlyList<float2> control, int subdivisions)
        {
            if (control == null || control.Count < 2) return new List<float2>();
            if (subdivisions <= 1) return new List<float2>(control);

            int n = control.Count;
            var result = new List<float2>((n - 1) * subdivisions + 1);

            for (int i = 0; i < n - 1; i++)
            {
                // Phantom endpoints for proper tangents at boundaries.
                float2 p0 = i == 0           ? control[0] + (control[0] - control[1])
                                             : control[i - 1];
                float2 p1 = control[i];
                float2 p2 = control[i + 1];
                float2 p3 = i + 2 >= n       ? control[n - 1] + (control[n - 1] - control[n - 2])
                                             : control[i + 2];

                int steps = i == n - 2 ? subdivisions + 1 : subdivisions;
                for (int s = 0; s < steps; s++)
                {
                    float t = (float)s / subdivisions;
                    result.Add(CatmullRom(p0, p1, p2, p3, t));
                }
            }
            return result;
        }

        static float2 CatmullRom(float2 p0, float2 p1, float2 p2, float2 p3, float t)
        {
            float t2 = t * t;
            float t3 = t2 * t;
            return 0.5f * (
                2f * p1
                + (-p0 + p2) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (-p0 + 3f * p1 - 3f * p2 + p3) * t3
            );
        }

        /// <summary>Convenience overload — uniform width along the strip.</summary>
        public static Mesh Build(IReadOnlyList<float2> points, float width)
            => Build(points, width, width);

        /// <summary>
        /// Convenience overload — linear width taper from start to end. Useful
        /// for rivers (thin source → wide mouth) where flow accumulates.
        /// </summary>
        public static Mesh Build(IReadOnlyList<float2> points, float startWidth, float endWidth)
        {
            if (points == null || points.Count < 2) return new Mesh();
            var widths = new float[points.Count];
            for (int i = 0; i < widths.Length; i++)
            {
                float t = points.Count == 1 ? 0f : (float)i / (points.Count - 1);
                widths[i] = math.lerp(startWidth, endWidth, t);
            }
            return Build(points, widths);
        }

        /// <summary>
        /// Build a flat quad-strip mesh (z = 0) from a polyline. Width is
        /// per-vertex so the strip can taper. Each interior vertex sits on
        /// the angle bisector between adjacent segments. End caps are square.
        /// </summary>
        public static Mesh Build(IReadOnlyList<float2> points, IReadOnlyList<float> widths)
        {
            if (points == null || points.Count < 2)
                return new Mesh();
            if (widths == null || widths.Count != points.Count)
                throw new System.ArgumentException("widths must match points count");

            int n = points.Count;

            var vertices = new Vector3[n * 2];
            var uvs = new Vector2[n * 2];
            var triangles = new int[(n - 1) * 6];

            float vDist = 0f;

            for (int i = 0; i < n; i++)
            {
                float halfW = widths[i] * 0.5f;

                // Tangent at vertex i — average of incoming + outgoing segment.
                float2 tangent;
                if (i == 0)
                {
                    tangent = math.normalize(points[1] - points[0]);
                }
                else if (i == n - 1)
                {
                    tangent = math.normalize(points[n - 1] - points[n - 2]);
                }
                else
                {
                    var inDir = math.normalize(points[i] - points[i - 1]);
                    var outDir = math.normalize(points[i + 1] - points[i]);
                    var avg = inDir + outDir;
                    tangent = math.lengthsq(avg) > 1e-6f
                        ? math.normalize(avg)
                        : outDir;
                }

                // Perpendicular in 2D — rotate tangent 90°.
                float2 normal = new float2(-tangent.y, tangent.x);

                // Miter scale: at sharp corners the bisector overshoots width.
                // Project onto outgoing segment normal for correct extrusion.
                float miter = 1f;
                if (i > 0 && i < n - 1)
                {
                    var outNormal = new float2(
                        -math.normalize(points[i + 1] - points[i]).y,
                         math.normalize(points[i + 1] - points[i]).x);
                    float dot = math.dot(normal, outNormal);
                    miter = math.abs(dot) > 1e-3f ? 1f / dot : 1f;
                    miter = math.clamp(miter, 1f, 4f); // cap to avoid spikes
                }

                float2 left = points[i] + normal * halfW * miter;
                float2 right = points[i] - normal * halfW * miter;

                if (i > 0)
                    vDist += math.length(points[i] - points[i - 1]);

                vertices[i * 2 + 0] = new Vector3(left.x, left.y, 0f);
                vertices[i * 2 + 1] = new Vector3(right.x, right.y, 0f);
                uvs[i * 2 + 0] = new Vector2(0f, vDist);
                uvs[i * 2 + 1] = new Vector2(1f, vDist);
            }

            for (int i = 0; i < n - 1; i++)
            {
                int v0 = i * 2;
                int v1 = i * 2 + 1;
                int v2 = (i + 1) * 2;
                int v3 = (i + 1) * 2 + 1;

                int t = i * 6;
                // Two triangles per segment (CCW).
                triangles[t + 0] = v0;
                triangles[t + 1] = v2;
                triangles[t + 2] = v1;
                triangles[t + 3] = v1;
                triangles[t + 4] = v2;
                triangles[t + 5] = v3;
            }

            var mesh = new Mesh
            {
                vertices = vertices,
                uv = uvs,
                triangles = triangles,
            };
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}

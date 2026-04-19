using Unity.Mathematics;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Utility for creating hex meshes and biome color lookups.
    /// </summary>
    public static class HexMeshUtil
    {
        /// <summary>
        /// Creates a flat pointy-top hex mesh with the given outer radius.
        /// </summary>
        public static Mesh CreateHexMesh(float outerRadius)
        {
            float innerRadius = outerRadius * 0.866025f; // sqrt(3)/2

            var vertices = new Vector3[7];
            vertices[0] = Vector3.zero; // center

            for (int i = 0; i < 6; i++)
            {
                float angle = 60f * i - 30f; // pointy-top starts at -30 degrees
                float rad = angle * Mathf.Deg2Rad;
                vertices[i + 1] = new Vector3(
                    outerRadius * Mathf.Cos(rad),
                    outerRadius * Mathf.Sin(rad),
                    0f
                );
            }

            // Double-sided — both windings so it's visible from either direction
            var triangles = new int[]
            {
                0, 1, 2,
                0, 2, 3,
                0, 3, 4,
                0, 4, 5,
                0, 5, 6,
                0, 6, 1,
                // Back face
                0, 2, 1,
                0, 3, 2,
                0, 4, 3,
                0, 5, 4,
                0, 6, 5,
                0, 1, 6,
            };

            var mesh = new Mesh
            {
                vertices = vertices,
                triangles = triangles,
            };
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Convert axial hex coords (q, r) to world position (x, y).
        /// Pointy-top layout.
        /// </summary>
        public static float3 HexToWorld(int q, int r, float size)
        {
            float x = size * (math.sqrt(3f) * q + math.sqrt(3f) / 2f * r);
            float y = size * (3f / 2f * r);
            return new float3(x, y, 0f);
        }

        /// <summary>
        /// Inverse of HexToWorld — round a world XY back to the nearest axial hex.
        /// </summary>
        public static int2 WorldToHex(float worldX, float worldY, float size)
        {
            float q = (math.sqrt(3f) / 3f * worldX - 1f / 3f * worldY) / size;
            float r = (2f / 3f * worldY) / size;

            float3 cube = new float3(q, -q - r, r);
            float3 rounded = math.round(cube);
            float3 diff = math.abs(rounded - cube);

            if (diff.x > diff.y && diff.x > diff.z)
                rounded.x = -rounded.y - rounded.z;
            else if (diff.y > diff.z)
                rounded.y = -rounded.x - rounded.z;
            else
                rounded.z = -rounded.x - rounded.y;

            return new int2((int)rounded.x, (int)rounded.z);
        }

        /// <summary>Cube/axial distance between two pointy-top hex coords.</summary>
        public static int HexDistance(int2 a, int2 b)
        {
            int dq = a.x - b.x;
            int dr = a.y - b.y;
            return (math.abs(dq) + math.abs(dr) + math.abs(dq + dr)) / 2;
        }

        // Six axial direction vectors for ring traversal (pointy-top).
        static readonly int2[] HexDirections = new[]
        {
            new int2( 1,  0),
            new int2( 1, -1),
            new int2( 0, -1),
            new int2(-1,  0),
            new int2(-1,  1),
            new int2( 0,  1),
        };

        /// <summary>
        /// Spiral outward from `center` up to and including ring `maxRadius`,
        /// nearest first. Caller iterates the result lazily — useful for early
        /// termination when searching for the nearest hex matching a predicate.
        /// </summary>
        public static System.Collections.Generic.IEnumerable<int2> Spiral(int2 center, int maxRadius)
        {
            yield return center;
            for (int k = 1; k <= maxRadius; k++)
            {
                // Walk to the start of ring k, then trace its 6 sides.
                int2 hex = center + HexDirections[4] * k;
                for (int side = 0; side < 6; side++)
                {
                    for (int step = 0; step < k; step++)
                    {
                        yield return hex;
                        hex += HexDirections[side];
                    }
                }
            }
        }

        /// <summary>
        /// Get biome color as float4.
        /// </summary>
        public static float4 BiomeColor(byte biomeId)
        {
            return biomeId switch
            {
                BiomeGenerator.BIOME_GRASS  => new float4(0.30f, 0.65f, 0.20f, 1f),
                BiomeGenerator.BIOME_FOREST => new float4(0.15f, 0.42f, 0.12f, 1f),
                BiomeGenerator.BIOME_SAND   => new float4(0.85f, 0.78f, 0.55f, 1f),
                BiomeGenerator.BIOME_DIRT   => new float4(0.50f, 0.38f, 0.22f, 1f),
                BiomeGenerator.BIOME_SNOW   => new float4(0.92f, 0.94f, 0.96f, 1f),
                BiomeGenerator.BIOME_STONE  => new float4(0.50f, 0.50f, 0.48f, 1f),
                BiomeGenerator.BIOME_LAKE   => new float4(0.05f, 0.32f, 0.58f, 1f),
                _ => new float4(0f, 0f, 0f, 0f), // ocean = no entity
            };
        }
    }
}

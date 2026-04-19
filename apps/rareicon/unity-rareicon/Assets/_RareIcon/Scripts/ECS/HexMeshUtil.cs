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
                _ => new float4(0f, 0f, 0f, 0f), // ocean = no entity
            };
        }
    }
}

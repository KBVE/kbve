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
            float innerRadius = outerRadius * 0.866025f;

            var vertices = new Vector3[7];
            vertices[0] = Vector3.zero;

            for (int i = 0; i < 6; i++)
            {
                float angle = 60f * i;
                float rad = angle * Mathf.Deg2Rad;
                vertices[i + 1] = new Vector3(
                    outerRadius * Mathf.Cos(rad),
                    outerRadius * Mathf.Sin(rad),
                    0f
                );
            }

            var triangles = new int[]
            {
                0, 1, 2,
                0, 2, 3,
                0, 3, 4,
                0, 4, 5,
                0, 5, 6,
                0, 6, 1,

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

        /// <summary>Upright quad for 2.5D atlas tiles: width × height with the cap centered on the hex and the skirt hanging below by yOffset. UV 0..1 maps the full atlas tile (cap+skirt). Double-sided to match the hex mesh Cull Off.</summary>
        public static Mesh CreateQuadMesh(float width, float height, float yOffset)
        {
            float hw = width * 0.5f;
            float bottom = yOffset;
            float top = yOffset + height;

            var vertices = new Vector3[4]
            {
                new Vector3(-hw, bottom, 0f),
                new Vector3( hw, bottom, 0f),
                new Vector3( hw, top,    0f),
                new Vector3(-hw, top,    0f),
            };
            var uv = new Vector2[4]
            {
                new Vector2(0f, 0f),
                new Vector2(1f, 0f),
                new Vector2(1f, 1f),
                new Vector2(0f, 1f),
            };
            var triangles = new int[] { 0, 1, 2, 0, 2, 3 };

            var mesh = new Mesh
            {
                vertices = vertices,
                uv = uv,
                triangles = triangles,
            };
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Convert axial hex coords (q, r) to world position (x, y).
        /// Flat-top layout.
        /// </summary>
        public static float3 HexToWorld(int q, int r, float size)
        {
            float x = size * (3f / 2f * q);
            float y = size * (math.sqrt(3f) * (r + q / 2f));
            return new float3(x, y, 0f);
        }

        /// <summary>
        /// Inverse of HexToWorld — round a world XY back to the nearest axial hex.
        /// </summary>
        public static int2 WorldToHex(float worldX, float worldY, float size)
        {
            float q = (2f / 3f * worldX) / size;
            float r = (-1f / 3f * worldX + math.sqrt(3f) / 3f * worldY) / size;

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
        /// Offset vector for axial direction 0..5 (E, NE, NW, W, SW, SE).
        /// Shared between pathfinding, movement, behavior systems so a
        /// single table defines the hex topology.
        /// </summary>
        public static int2 HexNeighbor(int dir)
        {

            int d = ((dir % 6) + 6) % 6;
            return HexDirections[d];
        }

        /// <summary>
        /// Greedy one-step path: picks the neighbor of <paramref name="from"/>
        /// that most reduces hex distance to <paramref name="to"/>. Returns
        /// the direction index (0..5). Good enough for open-field movement;
        /// swap for proper BFS / A* once walls / water / mountains block
        /// tiles. Deterministic tie-break: the first direction scanned wins,
        /// which is stable for FFI round-trips and replay.
        /// </summary>
        public static int HexStepToward(int2 from, int2 to)
        {
            int bestDir = 0;
            int bestDist = int.MaxValue;
            for (int d = 0; d < 6; d++)
            {
                int2 n = from + HexDirections[d];
                int dist = HexDistance(n, to);
                if (dist < bestDist)
                {
                    bestDist = dist;
                    bestDir  = d;
                }
            }
            return bestDir;
        }

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
                BiomeGenerator.BIOME_RIVER  => new float4(0.10f, 0.38f, 0.62f, 1f),
                _ => new float4(0f, 0f, 0f, 0f),
            };
        }
    }
}

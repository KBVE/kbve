using Unity.Burst;
using Unity.Collections;
using Unity.Jobs;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Generates biome data using Burst-compiled jobs on Unity's job scheduler.
    /// Output is a NativeArray where each element = biome ID for that pixel.
    ///
    /// TODO: Replace with Rust FFI (uniti_biome_generate) for shared logic with server
    /// TODO: Chunk-based generation for infinite world streaming
    /// TODO: Seed from server/save state
    /// </summary>
    public class BiomeGenerator
    {
        public const int BIOME_OCEAN = 0;
        public const int BIOME_GRASS = 1;
        public const int BIOME_FOREST = 2;
        public const int BIOME_SAND = 3;
        public const int BIOME_DIRT = 4;
        public const int BIOME_SNOW = 5;
        public const int BIOME_STONE = 6;

        readonly int _size;
        readonly int _seed;

        public BiomeGenerator(int size = 256, int seed = 1337)
        {
            _size = size;
            _seed = seed;
        }

        /// <summary>
        /// Schedule a Burst-compiled job to generate biome data.
        /// Call Complete() on the returned handle before reading the output.
        /// Caller owns the NativeArray and must Dispose it.
        /// </summary>
        public JobHandle Schedule(out NativeArray<byte> output)
        {
            output = new NativeArray<byte>(_size * _size * 4, Allocator.TempJob);

            var job = new BiomeGenerateJob
            {
                Size = _size,
                Seed = _seed,
                Pixels = output,
            };

            return job.Schedule(_size * _size, 64);
        }

        [BurstCompile]
        struct BiomeGenerateJob : IJobParallelFor
        {
            public int Size;
            public int Seed;

            [NativeDisableParallelForRestriction]
            public NativeArray<byte> Pixels;

            public void Execute(int index)
            {
                int x = index % Size;
                int y = index / Size;
                float half = Size / 2f;
                float nx = x - half;
                float ny = y - half;

                // Island falloff
                float dist = math.sqrt(nx * nx + ny * ny) / half;
                float falloff = 1f - math.saturate(dist * 1.2f);

                // Noise layers using math.noise (simplex-like via hash)
                float e = Fbm(nx * 0.02f, ny * 0.02f, Seed, 5) * falloff;
                float m = Fbm(nx * 0.03f, ny * 0.03f, Seed + 100, 4);
                float t = Fbm(nx * 0.015f, ny * 0.015f, Seed + 200, 3);

                int biome = GetBiome(e, m, t);

                int idx = index * 4;
                Pixels[idx + 0] = (byte)biome;
                Pixels[idx + 1] = (byte)(math.saturate(e) * 255);
                Pixels[idx + 2] = (byte)(math.saturate(m * 0.5f + 0.5f) * 255);
                Pixels[idx + 3] = 255;
            }

            static float Fbm(float x, float y, int seed, int octaves)
            {
                float value = 0f;
                float amplitude = 0.5f;
                float frequency = 1f;

                for (int i = 0; i < octaves; i++)
                {
                    value += amplitude * Noise(x * frequency, y * frequency, seed + i * 31);
                    amplitude *= 0.5f;
                    frequency *= 2f;
                }
                return value;
            }

            // Simple value noise — Burst-compatible, no managed allocations
            static float Noise(float x, float y, int seed)
            {
                int ix = (int)math.floor(x);
                int iy = (int)math.floor(y);
                float fx = x - ix;
                float fy = y - iy;

                fx = fx * fx * (3f - 2f * fx);
                fy = fy * fy * (3f - 2f * fy);

                float a = Hash(ix, iy, seed);
                float b = Hash(ix + 1, iy, seed);
                float c = Hash(ix, iy + 1, seed);
                float d = Hash(ix + 1, iy + 1, seed);

                return math.lerp(math.lerp(a, b, fx), math.lerp(c, d, fx), fy);
            }

            static float Hash(int x, int y, int seed)
            {
                int h = seed;
                h ^= x * 374761393;
                h ^= y * 668265263;
                h = (h ^ (h >> 13)) * 1274126177;
                return (h & 0x7FFFFFFF) / (float)0x7FFFFFFF;
            }

            static int GetBiome(float elevation, float moisture, float temperature)
            {
                if (elevation < 0.12f) return BIOME_OCEAN;
                if (elevation < 0.15f) return BIOME_SAND;

                float m = moisture * 0.5f + 0.5f;
                float t = temperature * 0.5f + 0.5f;

                if (t > 0.7f)
                {
                    if (m > 0.5f) return BIOME_FOREST;
                    return BIOME_GRASS;
                }

                if (t < 0.3f)
                {
                    if (elevation > 0.35f) return BIOME_SNOW;
                    return BIOME_STONE;
                }

                if (m > 0.6f) return BIOME_FOREST;
                if (m < 0.3f) return BIOME_DIRT;

                return BIOME_GRASS;
            }
        }
    }
}

using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Generates world biome data using FastNoiseLite. Noise sources are
    /// instance-owned so a single coord can be sampled cheaply via Sample()
    /// without re-creating the full noise stack — used by the world search
    /// tool and any other on-demand biome lookups.
    ///
    /// TODO: Replace with Rust FFI for shared logic with server
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
        public const int BIOME_LAKE = 7;
        public const int BIOME_COUNT = 8;

        readonly int _size;
        readonly int _seed;

        readonly FastNoiseLite _continental;
        readonly FastNoiseLite _elevation;
        readonly FastNoiseLite _islands;
        readonly FastNoiseLite _moisture;
        readonly FastNoiseLite _temperature;
        readonly FastNoiseLite _warp;
        readonly FastNoiseLite _lake;

        public BiomeGenerator(int size = 256, int seed = 1337)
        {
            _size = size;
            _seed = seed;

            _continental = new FastNoiseLite(seed);
            _continental.SetNoiseType(FastNoiseLite.NoiseType.Cellular);
            _continental.SetCellularDistanceFunction(FastNoiseLite.CellularDistanceFunction.Hybrid);
            _continental.SetCellularReturnType(FastNoiseLite.CellularReturnType.Distance2Div);
            _continental.SetFrequency(0.006f);
            _continental.SetFractalType(FastNoiseLite.FractalType.None);

            _elevation = new FastNoiseLite(seed + 1);
            _elevation.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2S);
            _elevation.SetFrequency(0.008f);
            _elevation.SetFractalType(FastNoiseLite.FractalType.FBm);
            _elevation.SetFractalOctaves(6);
            _elevation.SetFractalLacunarity(2.0f);
            _elevation.SetFractalGain(0.5f);

            _islands = new FastNoiseLite(seed + 2);
            _islands.SetNoiseType(FastNoiseLite.NoiseType.Cellular);
            _islands.SetCellularDistanceFunction(FastNoiseLite.CellularDistanceFunction.EuclideanSq);
            _islands.SetCellularReturnType(FastNoiseLite.CellularReturnType.Distance);
            _islands.SetFrequency(0.015f);
            _islands.SetFractalType(FastNoiseLite.FractalType.None);

            _moisture = new FastNoiseLite(seed + 100);
            _moisture.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2S);
            _moisture.SetFrequency(0.006f);
            _moisture.SetFractalType(FastNoiseLite.FractalType.FBm);
            _moisture.SetFractalOctaves(4);
            _moisture.SetFractalLacunarity(2.0f);
            _moisture.SetFractalGain(0.5f);

            _temperature = new FastNoiseLite(seed + 200);
            _temperature.SetNoiseType(FastNoiseLite.NoiseType.Perlin);
            _temperature.SetFrequency(0.004f);
            _temperature.SetFractalType(FastNoiseLite.FractalType.FBm);
            _temperature.SetFractalOctaves(3);

            _warp = new FastNoiseLite(seed + 300);
            _warp.SetDomainWarpType(FastNoiseLite.DomainWarpType.OpenSimplex2);
            _warp.SetDomainWarpAmp(40f);
            _warp.SetFrequency(0.005f);

            // Higher frequency = smaller Voronoi cells = smaller lake blobs.
            _lake = new FastNoiseLite(seed + 400);
            _lake.SetNoiseType(FastNoiseLite.NoiseType.Cellular);
            _lake.SetCellularDistanceFunction(FastNoiseLite.CellularDistanceFunction.EuclideanSq);
            _lake.SetCellularReturnType(FastNoiseLite.CellularReturnType.Distance);
            _lake.SetFrequency(0.045f);
        }

        /// <summary>
        /// Per-coord sample carrying everything the routing layer + biome
        /// classifier needs. Computed in one pass so callers (e.g., RiverRouter)
        /// don't pay for two warp + noise read sequences.
        /// </summary>
        public readonly struct Sampled
        {
            public readonly byte Biome;
            public readonly float LandHeight;
            public readonly float Moisture;
            public readonly float Temperature;

            public Sampled(byte biome, float landHeight, float moisture, float temperature)
            {
                Biome = biome;
                LandHeight = landHeight;
                Moisture = moisture;
                Temperature = temperature;
            }
        }

        /// <summary>
        /// Sample the biome at a single world coordinate. Deterministic from
        /// the seed; safe to call from any thread (FastNoiseLite is read-only
        /// per noise source after configuration).
        /// </summary>
        public byte Sample(float worldX, float worldY) => SampleAll(worldX, worldY).Biome;

        /// <summary>
        /// Like Sample but returns the full underlying field set (elevation
        /// and moisture especially) — used by RiverRouter for downhill walks
        /// and any future routing/erosion logic.
        /// </summary>
        public Sampled SampleAll(float worldX, float worldY)
        {
            float wx = worldX;
            float wy = worldY;
            _warp.DomainWarp(ref wx, ref wy);

            float cont = (_continental.GetNoise(wx, wy) + 1f) * 0.5f;
            float elev = (_elevation.GetNoise(wx, wy) + 1f) * 0.5f;
            float isle = 1f - (_islands.GetNoise(wx, wy) + 1f) * 0.5f;
            // Same weight mix the chunk generator used historically.
            float landHeight = cont * 0.4f + isle * 0.2f + elev * 0.15f;

            float moist = (_moisture.GetNoise(wx, wy) + 1f) * 0.5f;
            float temp = math.saturate(0.5f + _temperature.GetNoise(wx, wy) * 0.4f);
            float lakeNoise = _lake.GetNoise(wx, wy);

            byte biome = (byte)GetBiome(landHeight, moist, temp, lakeNoise);
            return new Sampled(biome, landHeight, moist, temp);
        }

        /// <summary>
        /// Generate biome data on a worker thread via FastNoiseLite.
        /// Returns RGBA32 byte array (R = biome ID, G = elevation, B = moisture, A = 255).
        /// </summary>
        public async UniTask<byte[]> GenerateAsync(CancellationToken ct)
        {
            return await UniTask.RunOnThreadPool(() => Generate(_size), cancellationToken: ct);
        }

        byte[] Generate(int size)
        {
            var pixels = new byte[size * size * 4];

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float wx = (float)x;
                    float wy = (float)y;
                    _warp.DomainWarp(ref wx, ref wy);

                    float cont = (_continental.GetNoise(wx, wy) + 1f) * 0.5f;
                    float elev = (_elevation.GetNoise(wx, wy) + 1f) * 0.5f;
                    float isle = 1f - (_islands.GetNoise(wx, wy) + 1f) * 0.5f;
                    float landHeight = cont * 0.4f + isle * 0.2f + elev * 0.15f;

                    float moist = (_moisture.GetNoise(wx, wy) + 1f) * 0.5f;
                    float temp = math.saturate(0.5f + _temperature.GetNoise(wx, wy) * 0.4f);
                    float lakeNoise = _lake.GetNoise(wx, wy);

                    int biome = GetBiome(landHeight, moist, temp, lakeNoise);

                    int idx = (y * size + x) * 4;
                    pixels[idx + 0] = (byte)biome;
                    pixels[idx + 1] = (byte)(math.saturate(landHeight) * 255);
                    pixels[idx + 2] = (byte)(moist * 255);
                    pixels[idx + 3] = 255;
                }
            }

            return pixels;
        }

        static int GetBiome(float height, float moisture, float temperature, float lakeNoise)
        {
            // Deep ocean
            if (height < 0.32f) return BIOME_OCEAN;

            // Beach / shore
            if (height < 0.36f) return BIOME_SAND;

            // Lake gate — lowland or midland, wet enough, sitting in a Voronoi
            // cell center (low cellular distance). Skips highlands so lakes
            // don't perch on mountaintops. Threshold tightened so only the
            // deepest cell centers qualify → fewer, smaller lakes.
            if (height < 0.60f
                && moisture > 0.50f
                && temperature > 0.30f
                && lakeNoise < -0.78f)
            {
                return BIOME_LAKE;
            }

            // Highlands
            if (height > 0.75f)
            {
                if (temperature < 0.35f) return BIOME_SNOW;
                return BIOME_STONE;
            }

            // Mountains
            if (height > 0.65f)
            {
                if (temperature < 0.3f) return BIOME_SNOW;
                if (moisture > 0.5f) return BIOME_FOREST;
                return BIOME_STONE;
            }

            // Lowlands — biome from moisture + temperature
            if (temperature < 0.25f)
                return BIOME_SNOW;

            if (temperature > 0.7f && moisture < 0.35f)
                return BIOME_SAND;

            if (moisture > 0.6f)
                return BIOME_FOREST;

            if (moisture < 0.3f)
                return BIOME_DIRT;

            return BIOME_GRASS;
        }
    }
}

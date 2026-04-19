using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Generates world biome data using FastNoiseLite on a worker thread.
    /// Produces continental landmasses, islands, and biome distribution
    /// from layered noise (elevation, moisture, temperature).
    ///
    /// TODO: Replace with Rust FFI for shared logic with server
    /// TODO: Chunk-based streaming for infinite world
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
        /// Generate biome data on a worker thread via FastNoiseLite.
        /// Returns RGBA32 byte array (R = biome ID, G = elevation, B = moisture, A = 255).
        /// </summary>
        public async UniTask<byte[]> GenerateAsync(CancellationToken ct)
        {
            var size = _size;
            var seed = _seed;
            return await UniTask.RunOnThreadPool(() => Generate(size, seed), cancellationToken: ct);
        }

        static byte[] Generate(int size, int seed)
        {
            // -- Continental shape: large landmasses --
            var continental = new FastNoiseLite(seed);
            continental.SetNoiseType(FastNoiseLite.NoiseType.Cellular);
            continental.SetCellularDistanceFunction(FastNoiseLite.CellularDistanceFunction.Hybrid);
            continental.SetCellularReturnType(FastNoiseLite.CellularReturnType.Distance2Div);
            continental.SetFrequency(0.003f);
            continental.SetFractalType(FastNoiseLite.FractalType.None);

            // -- Elevation: terrain height detail --
            var elevation = new FastNoiseLite(seed + 1);
            elevation.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2S);
            elevation.SetFrequency(0.008f);
            elevation.SetFractalType(FastNoiseLite.FractalType.FBm);
            elevation.SetFractalOctaves(6);
            elevation.SetFractalLacunarity(2.0f);
            elevation.SetFractalGain(0.5f);

            // -- Island noise: creates smaller islands around continents --
            var islands = new FastNoiseLite(seed + 2);
            islands.SetNoiseType(FastNoiseLite.NoiseType.Cellular);
            islands.SetCellularDistanceFunction(FastNoiseLite.CellularDistanceFunction.EuclideanSq);
            islands.SetCellularReturnType(FastNoiseLite.CellularReturnType.Distance);
            islands.SetFrequency(0.015f);
            islands.SetFractalType(FastNoiseLite.FractalType.None);

            // -- Moisture: controls biome wetness --
            var moisture = new FastNoiseLite(seed + 100);
            moisture.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2S);
            moisture.SetFrequency(0.006f);
            moisture.SetFractalType(FastNoiseLite.FractalType.FBm);
            moisture.SetFractalOctaves(4);
            moisture.SetFractalLacunarity(2.0f);
            moisture.SetFractalGain(0.5f);

            // -- Temperature: latitude-like gradient with noise --
            var temperature = new FastNoiseLite(seed + 200);
            temperature.SetNoiseType(FastNoiseLite.NoiseType.Perlin);
            temperature.SetFrequency(0.004f);
            temperature.SetFractalType(FastNoiseLite.FractalType.FBm);
            temperature.SetFractalOctaves(3);

            // -- Warp: domain warping for organic coastlines --
            var warp = new FastNoiseLite(seed + 300);
            warp.SetDomainWarpType(FastNoiseLite.DomainWarpType.OpenSimplex2);
            warp.SetDomainWarpAmp(40f);
            warp.SetFrequency(0.005f);

            var pixels = new byte[size * size * 4];
            float half = size / 2f;

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    // Warp coordinates for organic shapes
                    float wx = (float)x;
                    float wy = (float)y;
                    warp.DomainWarp(ref wx, ref wy);

                    // Continental value — large landmass shapes
                    float cont = continental.GetNoise(wx, wy);
                    cont = (cont + 1f) * 0.5f; // normalize to 0-1

                    // Elevation detail
                    float elev = elevation.GetNoise(wx, wy);
                    elev = (elev + 1f) * 0.5f;

                    // Island bonus — small landmasses
                    float isle = islands.GetNoise(wx, wy);
                    isle = (isle + 1f) * 0.5f;
                    isle = 1f - isle; // invert so cell centers are high

                    // Combined land height
                    // Continental shape drives major landmasses
                    // Islands add smaller land patches
                    // Elevation adds detail
                    float landHeight = cont * 0.5f + isle * 0.25f + elev * 0.25f;

                    // No edge falloff — infinite world
                    float moist = (moisture.GetNoise(wx, wy) + 1f) * 0.5f;
                    float tempNoise = temperature.GetNoise(wx, wy);
                    float temp = math.saturate(0.5f + tempNoise * 0.4f);

                    // Determine biome
                    int biome = GetBiome(landHeight, moist, temp);

                    int idx = (y * size + x) * 4;
                    pixels[idx + 0] = (byte)biome;
                    pixels[idx + 1] = (byte)(math.saturate(landHeight) * 255);
                    pixels[idx + 2] = (byte)(moist * 255);
                    pixels[idx + 3] = 255;
                }
            }

            return pixels;
        }

        static int GetBiome(float height, float moisture, float temperature)
        {
            // Deep ocean
            if (height < 0.32f) return BIOME_OCEAN;

            // Beach / shore
            if (height < 0.36f) return BIOME_SAND;

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

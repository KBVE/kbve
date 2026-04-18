using System;
using System.Collections.Concurrent;
using System.Threading;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>
    /// Off-thread chunk biome generation. Main thread queues chunk coords,
    /// worker thread generates biome data, main thread reads results.
    /// Thread-safe via ConcurrentQueues — zero locks on main thread.
    ///
    /// TODO: Replace with Rust FFI + SQLite cache
    /// </summary>
    public class ChunkGeneratorService : IDisposable
    {
        public struct ChunkResult
        {
            public int2 ChunkCoord;
            public byte[] Biomes; // ChunkSize * ChunkSize, one byte per hex
        }

        const int ChunkSize = 32;
        const int Seed = 1337;

        readonly ConcurrentQueue<int2> _requestQueue = new();
        readonly ConcurrentQueue<ChunkResult> _resultQueue = new();
        readonly Thread _workerThread;
        volatile bool _running = true;

        // Noise generators — owned by worker thread only
        FastNoiseLite _continental, _elevation, _islands, _moisture, _temperature, _warp;

        public ChunkGeneratorService()
        {
            _workerThread = new Thread(WorkerLoop)
            {
                Name = "ChunkGenerator",
                IsBackground = true,
            };
            _workerThread.Start();
        }

        /// <summary>
        /// Queue a chunk for generation. Non-blocking, called from main thread.
        /// </summary>
        public void RequestChunk(int2 chunkCoord)
        {
            _requestQueue.Enqueue(chunkCoord);
        }

        /// <summary>
        /// Dequeue a completed chunk. Non-blocking, called from main thread.
        /// Returns false if no results ready.
        /// </summary>
        public bool TryGetResult(out ChunkResult result)
        {
            return _resultQueue.TryDequeue(out result);
        }

        /// <summary>
        /// Number of pending results ready to consume.
        /// </summary>
        public int ResultCount => _resultQueue.Count;

        void WorkerLoop()
        {
            InitNoise();

            while (_running)
            {
                if (_requestQueue.TryDequeue(out int2 chunkCoord))
                {
                    var biomes = GenerateChunk(chunkCoord);
                    _resultQueue.Enqueue(new ChunkResult
                    {
                        ChunkCoord = chunkCoord,
                        Biomes = biomes,
                    });
                }
                else
                {
                    Thread.Sleep(1); // yield when idle
                }
            }
        }

        byte[] GenerateChunk(int2 chunkCoord)
        {
            var biomes = new byte[ChunkSize * ChunkSize];
            int startX = chunkCoord.x * ChunkSize;
            int startY = chunkCoord.y * ChunkSize;

            for (int ly = 0; ly < ChunkSize; ly++)
            {
                for (int lx = 0; lx < ChunkSize; lx++)
                {
                    int gx = startX + lx;
                    int gy = startY + ly;

                    float wx = (float)gx;
                    float wy = (float)gy;
                    _warp.DomainWarp(ref wx, ref wy);

                    float cont = (_continental.GetNoise(wx, wy) + 1f) * 0.5f;
                    float elev = (_elevation.GetNoise(wx, wy) + 1f) * 0.5f;
                    float isle = 1f - (_islands.GetNoise(wx, wy) + 1f) * 0.5f;
                    float landHeight = cont * 0.4f + isle * 0.2f + elev * 0.15f;

                    float moist = (_moisture.GetNoise(wx, wy) + 1f) * 0.5f;
                    float tempNoise = _temperature.GetNoise(wx, wy);
                    float temp = 0.5f + tempNoise * 0.4f;
                    if (temp < 0f) temp = 0f;
                    if (temp > 1f) temp = 1f;

                    biomes[ly * ChunkSize + lx] = GetBiome(landHeight, moist, temp);
                }
            }

            return biomes;
        }

        static byte GetBiome(float h, float m, float t)
        {
            if (h < 0.32f) return BiomeGenerator.BIOME_OCEAN;
            if (h < 0.36f) return BiomeGenerator.BIOME_SAND;
            if (h > 0.75f) return (byte)(t < 0.35f ? BiomeGenerator.BIOME_SNOW : BiomeGenerator.BIOME_STONE);
            if (h > 0.65f)
            {
                if (t < 0.3f) return BiomeGenerator.BIOME_SNOW;
                return (byte)(m > 0.5f ? BiomeGenerator.BIOME_FOREST : BiomeGenerator.BIOME_STONE);
            }
            if (t < 0.25f) return BiomeGenerator.BIOME_SNOW;
            if (t > 0.7f && m < 0.35f) return BiomeGenerator.BIOME_SAND;
            if (m > 0.6f) return BiomeGenerator.BIOME_FOREST;
            if (m < 0.3f) return BiomeGenerator.BIOME_DIRT;
            return BiomeGenerator.BIOME_GRASS;
        }

        void InitNoise()
        {
            _continental = new FastNoiseLite(Seed);
            _continental.SetNoiseType(FastNoiseLite.NoiseType.Cellular);
            _continental.SetCellularDistanceFunction(FastNoiseLite.CellularDistanceFunction.Hybrid);
            _continental.SetCellularReturnType(FastNoiseLite.CellularReturnType.Distance2Div);
            _continental.SetFrequency(0.006f);

            _elevation = new FastNoiseLite(Seed + 1);
            _elevation.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2S);
            _elevation.SetFrequency(0.008f);
            _elevation.SetFractalType(FastNoiseLite.FractalType.FBm);
            _elevation.SetFractalOctaves(6);
            _elevation.SetFractalLacunarity(2.0f);
            _elevation.SetFractalGain(0.5f);

            _islands = new FastNoiseLite(Seed + 2);
            _islands.SetNoiseType(FastNoiseLite.NoiseType.Cellular);
            _islands.SetCellularDistanceFunction(FastNoiseLite.CellularDistanceFunction.EuclideanSq);
            _islands.SetCellularReturnType(FastNoiseLite.CellularReturnType.Distance);
            _islands.SetFrequency(0.015f);

            _moisture = new FastNoiseLite(Seed + 100);
            _moisture.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2S);
            _moisture.SetFrequency(0.006f);
            _moisture.SetFractalType(FastNoiseLite.FractalType.FBm);
            _moisture.SetFractalOctaves(4);

            _temperature = new FastNoiseLite(Seed + 200);
            _temperature.SetNoiseType(FastNoiseLite.NoiseType.Perlin);
            _temperature.SetFrequency(0.004f);
            _temperature.SetFractalType(FastNoiseLite.FractalType.FBm);
            _temperature.SetFractalOctaves(3);

            _warp = new FastNoiseLite(Seed + 300);
            _warp.SetDomainWarpType(FastNoiseLite.DomainWarpType.OpenSimplex2);
            _warp.SetDomainWarpAmp(40f);
            _warp.SetFrequency(0.005f);
        }

        public void Dispose()
        {
            _running = false;
            _workerThread?.Join(1000);
        }
    }
}

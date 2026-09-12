using System;
using System.Collections.Concurrent;
using System.Threading;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Off-thread chunk biome generation; worker thread produces, main thread consumes via ConcurrentQueues.</summary>

    public class ChunkGeneratorService : IDisposable
    {
        public struct ChunkResult
        {
            public int2 ChunkCoord;
            public byte[] Biomes;
        }

        const int ChunkSize = 32;

        readonly BiomeGenerator _biomes;
        readonly ConcurrentQueue<int2> _requestQueue = new();
        readonly ConcurrentQueue<ChunkResult> _resultQueue = new();
        readonly Thread _workerThread;
        volatile bool _running = true;

        public ChunkGeneratorService(BiomeGenerator biomes)
        {
            _biomes = biomes;
            _workerThread = new Thread(WorkerLoop)
            {
                Name = "ChunkGenerator",
                IsBackground = true,
            };
            _workerThread.Start();
        }

        public void RequestChunk(int2 chunkCoord) => _requestQueue.Enqueue(chunkCoord);

        public bool TryGetResult(out ChunkResult result) => _resultQueue.TryDequeue(out result);

        public int ResultCount => _resultQueue.Count;

        void WorkerLoop()
        {
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
                    Thread.Sleep(1);
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
                    biomes[ly * ChunkSize + lx] = _biomes.Sample(startX + lx, startY + ly);
                }
            }

            return biomes;
        }

        public void Dispose()
        {
            _running = false;
            _workerThread?.Join(1000);
        }
    }
}

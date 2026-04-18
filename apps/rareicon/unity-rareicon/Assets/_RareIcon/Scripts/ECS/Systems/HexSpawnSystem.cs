using System;
using System.Collections.Generic;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;
using MessagePipe;

namespace RareIcon
{
    /// <summary>
    /// Chunk-based hex tile streaming. Generates chunks around the camera.
    /// Subscribes to CameraService.Zoom via R3 for zoom-aware loading.
    /// Limits spawning per frame to prevent hitching.
    ///
    /// TODO: Move generation to worker thread
    /// TODO: Biome data from Rust FFI + SQLite cache
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class HexChunkSystem : SystemBase
    {
        const int ChunkSize = 32;
        const float HexSize = 0.25f;
        const int Seed = 1337;
        const int BaseLoadRadius = 4;
        const int MaxChunksPerFrame = 10;

        readonly Dictionary<int2, List<Entity>> _loadedChunks = new();
        readonly Queue<int2> _spawnQueue = new();
        int2 _lastCameraChunk = new(int.MinValue, int.MinValue);
        int _currentLoadRadius;
        bool _needsRequeue;

        FastNoiseLite _continental, _elevation, _islands, _moisture, _temperature, _warp;
        Mesh _hexMesh;
        Material[] _biomeMaterials;
        RenderMeshDescription _renderMeshDesc;
        RenderMeshArray _renderMeshArray;

        protected override void OnCreate()
        {
            InitNoise();
            InitRendering();
            _currentLoadRadius = BaseLoadRadius;
            _needsRequeue = true;
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

        void InitRendering()
        {
            _hexMesh = HexMeshUtil.CreateHexMesh(HexSize);
            _biomeMaterials = new Material[7];
            var hexShader = Shader.Find("RareIcon/HexTile");
            if (hexShader == null) hexShader = Shader.Find("Universal Render Pipeline/Unlit");

            for (int i = 0; i < 7; i++)
            {
                _biomeMaterials[i] = new Material(hexShader);
                _biomeMaterials[i].enableInstancing = true;
                var c = HexMeshUtil.BiomeColor((byte)i);
                _biomeMaterials[i].SetColor("_BaseColor", new Color(c.x, c.y, c.z, c.w));
            }

            _renderMeshDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false
            );
            _renderMeshArray = new RenderMeshArray(_biomeMaterials, new[] { _hexMesh });
        }

        protected override void OnUpdate()
        {
            var cam = Camera.main;
            if (cam == null) return;

            var camPos = cam.transform.position;
            int2 cameraChunk = WorldToChunk(camPos.x, camPos.y);

            // Calculate load radius from zoom
            float orthoSize = cam.orthographic ? cam.orthographicSize : 12f;
            int loadRadius = math.max(BaseLoadRadius, (int)(orthoSize / (ChunkSize * HexSize * 0.8f)) + 2);
            int unloadRadius = loadRadius + 3;

            // Detect changes
            bool chunkMoved = !cameraChunk.Equals(_lastCameraChunk);
            bool radiusChanged = loadRadius != _currentLoadRadius;

            if (chunkMoved || radiusChanged || _needsRequeue)
            {
                _lastCameraChunk = cameraChunk;
                _currentLoadRadius = loadRadius;
                _needsRequeue = false;

                QueueMissingChunks(cameraChunk, loadRadius);
                UnloadDistantChunks(cameraChunk, unloadRadius);
            }

            // Process spawn queue — limited per frame
            int spawned = 0;
            while (_spawnQueue.Count > 0 && spawned < MaxChunksPerFrame)
            {
                var coord = _spawnQueue.Dequeue();
                if (!_loadedChunks.ContainsKey(coord))
                {
                    SpawnChunk(coord);
                    spawned++;
                }
            }
        }

        void QueueMissingChunks(int2 center, int radius)
        {
            var needed = new List<(int2 coord, int dist)>();

            for (int cy = -radius; cy <= radius; cy++)
            {
                for (int cx = -radius; cx <= radius; cx++)
                {
                    int2 coord = new int2(center.x + cx, center.y + cy);
                    if (!_loadedChunks.ContainsKey(coord))
                        needed.Add((coord, math.abs(cx) + math.abs(cy)));
                }
            }

            needed.Sort((a, b) => a.dist.CompareTo(b.dist));
            _spawnQueue.Clear();
            foreach (var n in needed)
                _spawnQueue.Enqueue(n.coord);
        }

        void UnloadDistantChunks(int2 center, int radius)
        {
            var toRemove = new List<int2>();
            foreach (var kvp in _loadedChunks)
            {
                int dist = math.max(math.abs(kvp.Key.x - center.x), math.abs(kvp.Key.y - center.y));
                if (dist > radius)
                    toRemove.Add(kvp.Key);
            }
            foreach (var key in toRemove)
                DespawnChunk(key);
        }

        void SpawnChunk(int2 chunkCoord)
        {
            var entities = new List<Entity>();
            var em = EntityManager;
            int startX = chunkCoord.x * ChunkSize;
            int startY = chunkCoord.y * ChunkSize;

            for (int ly = 0; ly < ChunkSize; ly++)
            {
                for (int lx = 0; lx < ChunkSize; lx++)
                {
                    int gx = startX + lx;
                    int gy = startY + ly;

                    byte biome = GenerateBiome(gx, gy);
                    if (biome == BiomeGenerator.BIOME_OCEAN) continue;

                    float3 worldPos = HexMeshUtil.HexToWorld(gx, gy, HexSize);
                    var entity = em.CreateEntity();
                    em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
                    em.AddComponentData(entity, new HexCoord { Q = gx, R = gy });
                    em.AddComponentData(entity, new BiomeType { Value = biome });
                    em.AddComponentData(entity, new ChunkCoord { Value = chunkCoord });
                    em.AddComponent<HexTileTag>(entity);

                    RenderMeshUtility.AddComponents(
                        entity, em, _renderMeshDesc, _renderMeshArray,
                        MaterialMeshInfo.FromRenderMeshArrayIndices(biome, 0)
                    );
                    entities.Add(entity);
                }
            }

            _loadedChunks[chunkCoord] = entities;
        }

        void DespawnChunk(int2 chunkCoord)
        {
            if (!_loadedChunks.TryGetValue(chunkCoord, out var entities)) return;
            foreach (var entity in entities)
                if (EntityManager.Exists(entity))
                    EntityManager.DestroyEntity(entity);
            _loadedChunks.Remove(chunkCoord);
        }

        int2 WorldToChunk(float worldX, float worldY)
        {
            float q = worldX / (HexSize * math.sqrt(3f));
            float r = worldY / (HexSize * 1.5f);
            return new int2((int)math.floor(q / ChunkSize), (int)math.floor(r / ChunkSize));
        }

        byte GenerateBiome(int gx, int gy)
        {
            float wx = (float)gx;
            float wy = (float)gy;
            _warp.DomainWarp(ref wx, ref wy);

            float cont = (_continental.GetNoise(wx, wy) + 1f) * 0.5f;
            float elev = (_elevation.GetNoise(wx, wy) + 1f) * 0.5f;
            float isle = 1f - (_islands.GetNoise(wx, wy) + 1f) * 0.5f;
            float landHeight = cont * 0.4f + isle * 0.2f + elev * 0.15f;

            float moist = (_moisture.GetNoise(wx, wy) + 1f) * 0.5f;
            float tempNoise = _temperature.GetNoise(wx, wy);
            float temp = math.saturate(0.5f + tempNoise * 0.4f);

            if (landHeight < 0.32f) return BiomeGenerator.BIOME_OCEAN;
            if (landHeight < 0.36f) return BiomeGenerator.BIOME_SAND;
            if (landHeight > 0.75f) return (byte)(temp < 0.35f ? BiomeGenerator.BIOME_SNOW : BiomeGenerator.BIOME_STONE);
            if (landHeight > 0.65f)
            {
                if (temp < 0.3f) return BiomeGenerator.BIOME_SNOW;
                return (byte)(moist > 0.5f ? BiomeGenerator.BIOME_FOREST : BiomeGenerator.BIOME_STONE);
            }
            if (temp < 0.25f) return BiomeGenerator.BIOME_SNOW;
            if (temp > 0.7f && moist < 0.35f) return BiomeGenerator.BIOME_SAND;
            if (moist > 0.6f) return BiomeGenerator.BIOME_FOREST;
            if (moist < 0.3f) return BiomeGenerator.BIOME_DIRT;
            return BiomeGenerator.BIOME_GRASS;
        }
    }
}

using System.Collections.Generic;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Chunk-based hex tile streaming. Biome generation runs on a worker thread
    /// via ChunkGeneratorService. Main thread only spawns entities from results.
    /// Zero noise computation on the main thread.
    ///
    /// TODO: Rust FFI + SQLite chunk cache
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class HexChunkSystem : SystemBase
    {
        const int ChunkSize = 32;
        const float HexSize = 0.25f;
        const int BaseLoadRadius = 4;
        const int MaxSpawnsPerFrame = 6;

        readonly Dictionary<int2, List<Entity>> _loadedChunks = new();
        readonly HashSet<int2> _pendingChunks = new(); // requested but not yet generated
        int2 _lastCameraChunk = new(int.MinValue, int.MinValue);
        int _currentLoadRadius;

        Mesh _hexMesh;
        Material[] _biomeMaterials;
        RenderMeshDescription _renderMeshDesc;
        RenderMeshArray _renderMeshArray;

        // Resolved from VContainer via static — ECS can't inject
        static ChunkGeneratorService _generator;

        public static void SetGenerator(ChunkGeneratorService gen) => _generator = gen;

        protected override void OnCreate()
        {
            InitRendering();
            _currentLoadRadius = BaseLoadRadius;
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
            if (_generator == null) return;

            var cam = Camera.main;
            if (cam == null) return;

            var camPos = cam.transform.position;
            int2 cameraChunk = WorldToChunk(camPos.x, camPos.y);

            float orthoSize = cam.orthographic ? cam.orthographicSize : 12f;
            int loadRadius = math.max(BaseLoadRadius, (int)(orthoSize / (ChunkSize * HexSize * 0.8f)) + 2);
            int unloadRadius = loadRadius + 3;

            bool chunkMoved = !cameraChunk.Equals(_lastCameraChunk);
            bool radiusChanged = loadRadius != _currentLoadRadius;

            if (chunkMoved || radiusChanged)
            {
                _lastCameraChunk = cameraChunk;
                _currentLoadRadius = loadRadius;

                // Queue needed chunks to worker thread
                RequestMissingChunks(cameraChunk, loadRadius);
                UnloadDistantChunks(cameraChunk, unloadRadius);
            }

            // Consume results from worker thread — entity spawning only
            int spawned = 0;
            while (spawned < MaxSpawnsPerFrame && _generator.TryGetResult(out var result))
            {
                _pendingChunks.Remove(result.ChunkCoord);

                if (!_loadedChunks.ContainsKey(result.ChunkCoord))
                {
                    SpawnChunkFromData(result.ChunkCoord, result.Biomes);
                    spawned++;
                }
            }
        }

        void RequestMissingChunks(int2 center, int radius)
        {
            // Request closest chunks first
            var needed = new List<(int2 coord, int dist)>();

            for (int cy = -radius; cy <= radius; cy++)
            {
                for (int cx = -radius; cx <= radius; cx++)
                {
                    int2 coord = new int2(center.x + cx, center.y + cy);
                    if (!_loadedChunks.ContainsKey(coord) && !_pendingChunks.Contains(coord))
                    {
                        needed.Add((coord, math.abs(cx) + math.abs(cy)));
                    }
                }
            }

            needed.Sort((a, b) => a.dist.CompareTo(b.dist));

            foreach (var n in needed)
            {
                _pendingChunks.Add(n.coord);
                _generator.RequestChunk(n.coord);
            }
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

        void SpawnChunkFromData(int2 chunkCoord, byte[] biomes)
        {
            var entities = new List<Entity>();
            var em = EntityManager;
            int startX = chunkCoord.x * ChunkSize;
            int startY = chunkCoord.y * ChunkSize;

            for (int ly = 0; ly < ChunkSize; ly++)
            {
                for (int lx = 0; lx < ChunkSize; lx++)
                {
                    byte biome = biomes[ly * ChunkSize + lx];
                    if (biome == BiomeGenerator.BIOME_OCEAN) continue;

                    int gx = startX + lx;
                    int gy = startY + ly;
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
                    HexHoverSystem.AddHex(new int2(gx, gy), entity);
                    entities.Add(entity);
                }
            }

            _loadedChunks[chunkCoord] = entities;
        }

        void DespawnChunk(int2 chunkCoord)
        {
            if (!_loadedChunks.TryGetValue(chunkCoord, out var entities)) return;
            int startX = chunkCoord.x * ChunkSize;
            int startY = chunkCoord.y * ChunkSize;

            // Remove from hover lookup
            for (int ly = 0; ly < ChunkSize; ly++)
                for (int lx = 0; lx < ChunkSize; lx++)
                    HexHoverSystem.RemoveHex(new int2(startX + lx, startY + ly));

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
    }
}

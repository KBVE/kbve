using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Chunk streaming system. Worker thread generates biome data,
    /// this system consumes results and spawns entities.
    /// Entity creation uses archetype + ECB for minimal main thread impact.
    ///
    /// TODO: Rust FFI + SQLite chunk cache
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class HexChunkSystem : SystemBase
    {
        const int ChunkSize = 32;
        const float HexSize = 0.25f;
        const int BaseLoadRadius = 5;
        const int MaxSpawnsPerFrame = 3;

        readonly Dictionary<int2, NativeList<Entity>> _loadedChunks = new();
        readonly HashSet<int2> _pendingChunks = new();
        int2 _lastCameraChunk = new(int.MinValue, int.MinValue);
        int _currentLoadRadius;
        bool _initialLoad;

        Mesh _hexMesh;
        Material[] _biomeMaterials;
        RenderMeshDescription _renderMeshDesc;
        RenderMeshArray _renderMeshArray;

        static ChunkGeneratorService _generator;
        public static void SetGenerator(ChunkGeneratorService gen) => _generator = gen;

        protected override void OnCreate()
        {
            InitRendering();
            _currentLoadRadius = BaseLoadRadius;
            _initialLoad = true;
        }

        protected override void OnDestroy()
        {
            // Destroy entities and free per-chunk native lists
            foreach (var kvp in _loadedChunks)
            {
                if (kvp.Value.IsCreated)
                {
                    for (int i = 0; i < kvp.Value.Length; i++)
                        if (EntityManager.Exists(kvp.Value[i]))
                            EntityManager.DestroyEntity(kvp.Value[i]);
                    kvp.Value.Dispose();
                }
            }
            _loadedChunks.Clear();
            _pendingChunks.Clear();
            Debug.Log("[HexChunkSystem] Disposed");
        }

        void InitRendering()
        {
            _hexMesh = HexMeshUtil.CreateHexMesh(HexSize);
            _biomeMaterials = new Material[BiomeGenerator.BIOME_COUNT];

            var hexShader = Shader.Find("RareIcon/HexTile");
            if (hexShader == null) hexShader = Shader.Find("Universal Render Pipeline/Unlit");
            var lakeShader = Shader.Find("RareIcon/HexLake");

            for (int i = 0; i < BiomeGenerator.BIOME_COUNT; i++)
            {
                // Lakes get the dedicated water shader; everything else uses
                // the procedural ground shader with biome-specific colors.
                bool isLake = i == BiomeGenerator.BIOME_LAKE && lakeShader != null;
                _biomeMaterials[i] = new Material(isLake ? lakeShader : hexShader);
                _biomeMaterials[i].enableInstancing = true;

                var c = HexMeshUtil.BiomeColor((byte)i);
                var primary = new Color(c.x, c.y, c.z, c.w);
                _biomeMaterials[i].SetColor("_BaseColor", primary);

                if (isLake)
                {
                    // Lake material reads world-space water from OceanWater.hlsl;
                    // _BaseColor just nudges the regional palette.
                    continue;
                }

                if (i == BiomeGenerator.BIOME_GRASS)
                {
                    // Two greens: dark (shadow) and bright (highlight) — noise
                    // blends between them in world space across all grass hexes.
                    _biomeMaterials[i].SetColor("_BaseColor2", new Color(0.42f, 0.72f, 0.28f, 1f));
                }
                else
                {
                    _biomeMaterials[i].SetColor("_BaseColor2", primary);
                }
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
                RequestMissingChunks(cameraChunk, loadRadius);
                UnloadDistantChunks(cameraChunk, unloadRadius);
            }

            // Consume worker thread results
            int budget = _initialLoad ? 50 : MaxSpawnsPerFrame;
            int spawned = 0;

            while (spawned < budget && _generator.TryGetResult(out var result))
            {
                _pendingChunks.Remove(result.ChunkCoord);
                if (!_loadedChunks.ContainsKey(result.ChunkCoord))
                {
                    SpawnChunk(result.ChunkCoord, result.Biomes);
                    spawned++;
                }
            }

            if (_initialLoad && _pendingChunks.Count == 0 && _generator.ResultCount == 0)
                _initialLoad = false;
        }

        void RequestMissingChunks(int2 center, int radius)
        {
            var needed = new List<(int2 coord, int dist)>();
            int r2 = radius * radius;

            for (int cy = -radius; cy <= radius; cy++)
            {
                for (int cx = -radius; cx <= radius; cx++)
                {
                    int dist = cx * cx + cy * cy;
                    if (dist > r2) continue;

                    int2 coord = new int2(center.x + cx, center.y + cy);
                    if (!_loadedChunks.ContainsKey(coord) && !_pendingChunks.Contains(coord))
                        needed.Add((coord, dist));
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
            int r2 = radius * radius;

            foreach (var kvp in _loadedChunks)
            {
                int dx = kvp.Key.x - center.x;
                int dy = kvp.Key.y - center.y;
                if (dx * dx + dy * dy > r2)
                    toRemove.Add(kvp.Key);
            }

            foreach (var key in toRemove)
                DespawnChunk(key);
        }

        void SpawnChunk(int2 chunkCoord, byte[] biomes)
        {
            var entities = new NativeList<Entity>(ChunkSize * ChunkSize, Allocator.Persistent);
            var em = EntityManager;
            int startX = chunkCoord.x * ChunkSize;
            int startY = chunkCoord.y * ChunkSize;

            // Pre-count land tiles for ECB capacity
            int landCount = 0;
            for (int i = 0; i < biomes.Length; i++)
                if (biomes[i] != BiomeGenerator.BIOME_OCEAN) landCount++;

            if (landCount == 0)
            {
                entities.Dispose();
                _loadedChunks[chunkCoord] = new NativeList<Entity>(0, Allocator.Persistent);
                return;
            }

            // Batch create all entities at once with NativeArray
            var archetype = em.CreateArchetype(
                typeof(LocalTransform),
                typeof(LocalToWorld),
                typeof(HexCoord),
                typeof(BiomeType),
                typeof(ChunkCoord),
                typeof(HexTileTag)
            );

            var batchEntities = em.CreateEntity(archetype, landCount, Allocator.Temp);
            int idx = 0;

            for (int ly = 0; ly < ChunkSize; ly++)
            {
                for (int lx = 0; lx < ChunkSize; lx++)
                {
                    byte biome = biomes[ly * ChunkSize + lx];
                    if (biome == BiomeGenerator.BIOME_OCEAN) continue;

                    int gx = startX + lx;
                    int gy = startY + ly;
                    float3 worldPos = HexMeshUtil.HexToWorld(gx, gy, HexSize);

                    var entity = batchEntities[idx++];
                    em.SetComponentData(entity, LocalTransform.FromPosition(worldPos));
                    em.SetComponentData(entity, new HexCoord { Q = gx, R = gy });
                    em.SetComponentData(entity, new BiomeType { Value = biome });
                    em.SetComponentData(entity, new ChunkCoord { Value = chunkCoord });

                    // Rendering — must be on main thread (managed shared component)
                    RenderMeshUtility.AddComponents(
                        entity, em, _renderMeshDesc, _renderMeshArray,
                        MaterialMeshInfo.FromRenderMeshArrayIndices(biome, 0)
                    );

                    HexHoverSystem.AddHex(new int2(gx, gy), entity);
                    entities.Add(entity);
                }
            }

            batchEntities.Dispose();
            _loadedChunks[chunkCoord] = entities;
        }

        void DespawnChunk(int2 chunkCoord)
        {
            if (!_loadedChunks.TryGetValue(chunkCoord, out var entities)) return;

            int startX = chunkCoord.x * ChunkSize;
            int startY = chunkCoord.y * ChunkSize;
            for (int ly = 0; ly < ChunkSize; ly++)
                for (int lx = 0; lx < ChunkSize; lx++)
                    HexHoverSystem.RemoveHex(new int2(startX + lx, startY + ly));

            for (int i = 0; i < entities.Length; i++)
                if (EntityManager.Exists(entities[i]))
                    EntityManager.DestroyEntity(entities[i]);

            entities.Dispose();
            _loadedChunks.Remove(chunkCoord);
        }

        int2 WorldToChunk(float worldX, float worldY)
        {
            float r = worldY / (HexSize * 1.5f);
            float q = worldX / (HexSize * math.sqrt(3f)) - r * 0.5f;
            return new int2((int)math.floor(q / ChunkSize), (int)math.floor(r / ChunkSize));
        }
    }
}

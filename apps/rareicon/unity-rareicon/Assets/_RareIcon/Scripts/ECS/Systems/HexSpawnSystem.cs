using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;
using RareIcon.Native;

namespace RareIcon
{
    /// <summary>
    /// Chunk streaming system. Worker thread generates biome data,
    /// this system consumes results and spawns entities.
    /// Entity creation uses archetype + ECB for minimal main thread impact.
    ///
    /// TODO: Rust FFI + SQLite chunk cache
    /// </summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class HexChunkSystem : SystemBase
    {
        const int ChunkSize = 32;
        const float HexSize = 0.25f;
        const int BaseLoadRadius = 5;
        const int MaxSpawnsPerFrame = 3;

        readonly Dictionary<int2, NativeList<Entity>> _loadedChunks = new();
        readonly HashSet<int2> _pendingChunks = new();

        /// <summary>True if the chunk at the given chunk-coord is currently in the loaded set. Hex-coord callers should derive the chunk first via <c>floor(hex / ChunkSize)</c>.</summary>
        public bool IsChunkLoaded(int2 chunkCoord) => _loadedChunks.ContainsKey(chunkCoord);

        /// <summary>Total number of chunks currently spawned in the live world. Used by the title screen to gate the Start button on having streamed enough chunks to drop into.</summary>
        public int LoadedChunkCount => _loadedChunks.Count;

        /// <summary>Resolve <see cref="LoadedChunkCount"/> via <see cref="GameplayWorld.Resolve"/>; returns 0 before the world is created. Static so callers (title screen, save service) don't need an entity-world ref.</summary>
        public static int LoadedChunkCountStatic
        {
            get
            {
                var world = GameplayWorld.Resolve();
                if (world == null || !world.IsCreated) return 0;
                var sys = world.GetExistingSystemManaged<HexChunkSystem>();
                return sys != null ? sys.LoadedChunkCount : 0;
            }
        }

        /// <summary>True when the hex coord falls inside any currently-loaded chunk. Cheap O(1) — converts hex to chunk and dictionary-tests.</summary>
        public bool IsHexLoaded(int2 hex)
        {
            int cx = (int)System.Math.Floor((float)hex.x / ChunkSize);
            int cy = (int)System.Math.Floor((float)hex.y / ChunkSize);
            return _loadedChunks.ContainsKey(new int2(cx, cy));
        }
        int2 _lastCameraChunk = new(int.MinValue, int.MinValue);
        int _currentLoadRadius;
        bool _initialLoad;

        Mesh _hexMesh;
        Material[] _biomeMaterials;
        RenderMeshDescription _renderMeshDesc;
        RenderMeshArray _renderMeshArray;

        static ChunkGeneratorService _generator;
        public static void SetGenerator(ChunkGeneratorService gen) => _generator = gen;

        EntityQuery _buildingSnapshotQuery;

        protected override void OnCreate()
        {
            InitRendering();
            _currentLoadRadius = BaseLoadRadius;
            _initialLoad = true;
            _buildingSnapshotQuery = GetEntityQuery(typeof(Building), typeof(BuildingHealth));
        }

        protected override void OnDestroy()
        {

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
            var riverTileShader = Shader.Find("RareIcon/HexRiverTile");

            for (int i = 0; i < BiomeGenerator.BIOME_COUNT; i++)
            {

                bool isRiver = i == BiomeGenerator.BIOME_RIVER && riverTileShader != null;
                _biomeMaterials[i] = new Material(isRiver ? riverTileShader : hexShader);
                _biomeMaterials[i].enableInstancing = true;

                var c = HexMeshUtil.BiomeColor((byte)i);
                var primary = new Color(c.x, c.y, c.z, c.w);
                _biomeMaterials[i].SetColor("_BaseColor", primary);

                if (isRiver)
                {

                    continue;
                }

                if (i == BiomeGenerator.BIOME_GRASS)
                {

                    _biomeMaterials[i].SetColor("_BaseColor2", new Color(0.42f, 0.72f, 0.28f, 1f));
                }
                else
                {
                    _biomeMaterials[i].SetColor("_BaseColor2", primary);
                }

                if (i == BiomeGenerator.BIOME_FOREST)
                {
                    _biomeMaterials[i].SetFloat("_TreeDensity", 0.6f);

                    _biomeMaterials[i].SetColor("_BaseColor2", new Color(0.20f, 0.50f, 0.15f, 1f));
                }

                if (i == BiomeGenerator.BIOME_FOREST)
                {
                    _biomeMaterials[i].SetFloat("_FloorDensity", 0.85f);
                }
                else if (i == BiomeGenerator.BIOME_GRASS
                      || i == BiomeGenerator.BIOME_DIRT
                      || i == BiomeGenerator.BIOME_STONE)
                {
                    _biomeMaterials[i].SetFloat("_FloorDensity", 0.55f);
                }
                else if (i == BiomeGenerator.BIOME_SAND)
                {

                    _biomeMaterials[i].SetFloat("_FloorDensity", 0.95f);
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

            int landCount = 0;
            for (int i = 0; i < biomes.Length; i++)
                if (biomes[i] != BiomeGenerator.BIOME_OCEAN) landCount++;

            if (landCount == 0)
            {
                entities.Dispose();
                _loadedChunks[chunkCoord] = new NativeList<Entity>(0, Allocator.Persistent);
                return;
            }

            var archetype = em.CreateArchetype(
                typeof(LocalTransform),
                typeof(LocalToWorld),
                typeof(HexCoord),
                typeof(BiomeType),
                typeof(ChunkCoord),
                typeof(HexTileTag),
                typeof(HexResources),
                typeof(HexResourceVisual),
                typeof(HexTreeVisual),
                typeof(HexFloorAmounts),
                typeof(HexCactusVisual),
                typeof(ItemDrop),
                typeof(TerritoryVisual),
                typeof(FogVisibility),
                typeof(FogExplored),
                typeof(AuraHighlightVisual)
            );

            var batchEntities = em.CreateEntity(archetype, landCount, Allocator.Temp);
            int idx = 0;

            var world = WorldStoreSystem.Instance;
            bool hasGhost = world != null && world.IsValid &&
                            world.HasChunk(chunkCoord.x, chunkCoord.y);

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

                    var (res, mask) = HexResourceTable.Roll(biome, gx, gy);

                    if (hasGhost && world.TryGetHex(gx, gy, out var stored))
                    {
                        res = new HexResources
                        {
                            Wood          = stored.wood,
                            Stone         = stored.stone,
                            Berries       = stored.berries,
                            Mushrooms     = stored.mushrooms,
                            Herbs         = stored.herbs,
                            Cactus        = stored.cactus,
                            CactusVariant = stored.cactus_variant,
                        };
                        mask = HexResourceTable.ComputeVisualMask(in res);
                    }
                    em.SetComponentData(entity, res);
                    em.SetComponentData(entity, new HexResourceVisual { Value = (float)mask });
                    em.SetComponentData(entity, new HexTreeVisual
                    {
                        Value = HexResourceTable.ComputeTreeAmount(in res)
                    });
                    em.SetComponentData(entity, new HexFloorAmounts
                    {
                        Value = HexResourceTable.ComputeFloorAmounts(in res)
                    });
                    em.SetComponentData(entity, new HexCactusVisual
                    {
                        Value = HexResourceTable.ComputeCactusAmount(in res)
                    });

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

            LandmarkChunkSpawner.RollForChunk(chunkCoord, biomes, startX, startY);
            WaterResourceInjector.InjectForChunk(EntityManager, biomes, startX, startY);

            if (SystemAPI.HasSingleton<UnitsDBSingleton>())
            {
                ref var udb = ref SystemAPI.GetSingletonRW<UnitsDBSingleton>().ValueRW;
                if (udb.Unloaded.IsCreated)
                {
                    int chunkX0 = startX;
                    int chunkY0 = startY;
                    int chunkX1 = startX + ChunkSize;
                    int chunkY1 = startY + ChunkSize;
                    UnitColdStoreOps.DrainChunk(udb.Unloaded, new int2(chunkX0, chunkY0), new int2(chunkX1, chunkY1));
                }
            }
            if (hasGhost)
            {
                int unitCount = (int)world.UnitCountInChunk(chunkCoord.x, chunkCoord.y);
                if (unitCount > 0)
                {
                    var ghostBuf = new FfiGhostUnit[unitCount];
                    var taken = world.TakeUnitsInChunk(chunkCoord.x, chunkCoord.y, ghostBuf);
                    for (int i = 0; i < taken; i++)
                    {
                        var g = ghostBuf[i];
                        var hex = new int2(g.q, g.r);
                        var state = new UnitSpawnState
                        {
                            Health    = g.health,
                            MaxHealth = g.max_health,
                            Inv0Id = g.inv0_id, Inv0Qty = g.inv0_qty,
                            Inv1Id = g.inv1_id, Inv1Qty = g.inv1_qty,
                            Inv2Id = g.inv2_id, Inv2Qty = g.inv2_qty,
                            Inv3Id = g.inv3_id, Inv3Qty = g.inv3_qty,
                        };

                        uint rng = (uint)g.q * 0x9E3779B1u
                                 ^ (uint)g.r * 0x85EBCA77u
                                 ^ ((uint)i + 1u);
                        rng |= 1u;
                        if (g.unit_type == UnitType.King)
                        {
                            UnitSpawnSystem.SpawnKingAt(em, hex, state);
                        }
                        else if (g.unit_type == UnitType.Chicken
                              || g.unit_type == UnitType.Sheep
                              || g.unit_type == UnitType.Cow)
                        {
                            UnitSpawnSystem.SpawnAnimalAt(em, hex, rng, g.unit_type, state);
                        }
                        else
                        {
                            UnitSpawnSystem.SpawnGoblinAt(em, hex, rng, state);
                        }
                    }
                }
            }
            else
            {

                for (int ly = 0; ly < ChunkSize; ly++)
                {
                    for (int lx = 0; lx < ChunkSize; lx++)
                    {
                        byte biome = biomes[ly * ChunkSize + lx];
                        if (biome == BiomeGenerator.BIOME_OCEAN) continue;
                        TryRollAnimal(em, biome, startX + lx, startY + ly);
                    }
                }
            }

            HydrateUnloadedBuildings(chunkCoord);
        }

        /// <summary>Respawns offloaded buildings into the live world as their chunk streams back in. Reads accumulated ghost-sim deltas from the UnloadedBuildingRecord and applies them to BuildingHealth + (future) ledger state. Lean v0: instantiates the shared building prefab, sets Building identity + health + tier + visual; per-type production + service components are NOT rebuilt here — that lands when the ghost-sim layer preserves full ledger state too.</summary>
        void HydrateUnloadedBuildings(int2 chunkCoord)
        {
            if (!SystemAPI.HasSingleton<BuildingsDBSingleton>()) return;
            if (!SystemAPI.HasSingleton<BuildingPrefabSingleton>()) return;

            var dbRW = SystemAPI.GetSingletonRW<BuildingsDBSingleton>();
            dbRW.ValueRW.EventsWriteHandle.Complete();
            dbRW.ValueRW.EventsWriteHandle = default;
            var unloaded = dbRW.ValueRW.Unloaded;
            var events   = dbRW.ValueRW.Events;
            if (!unloaded.IsCreated) return;

            var nativeWorld = WorldStoreSystem.Instance;
            if (nativeWorld != null && nativeWorld.IsValid)
            {
                uint count = nativeWorld.BuildingCountInChunk(chunkCoord.x, chunkCoord.y);
                if (count > 0)
                {
                    var discard = new FfiUnloadedBuilding[count];
                    nativeWorld.TakeBuildingsInChunk(chunkCoord.x, chunkCoord.y, discard);
                }
            }

            if (unloaded.Length == 0) return;

            var prefab = SystemAPI.GetSingleton<BuildingPrefabSingleton>().Prefab;
            if (prefab == Entity.Null) return;

            var em = EntityManager;
            int startX = chunkCoord.x * ChunkSize;
            int startY = chunkCoord.y * ChunkSize;
            int endX   = startX + ChunkSize;
            int endY   = startY + ChunkSize;

            for (int i = unloaded.Length - 1; i >= 0; i--)
            {
                var rec = unloaded[i];
                if (rec.RootHex.x < startX || rec.RootHex.x >= endX ||
                    rec.RootHex.y < startY || rec.RootHex.y >= endY) continue;

                var entity = em.Instantiate(prefab);
                var pos = HexMeshUtil.HexToWorld(rec.RootHex.x, rec.RootHex.y, HexSize);
                pos.z = -0.6f;
                float scale = BuildingDB.GetVisualScale(rec.Type);
                em.SetComponentData(entity, LocalTransform.FromPositionRotationScale(pos, quaternion.identity, scale));
                em.SetComponentData(entity, new Building
                {
                    Type         = rec.Type,
                    RootHex      = rec.RootHex,
                    OwnerFaction = rec.OwnerFaction,
                });
                byte visualId = BuildingDB.GetTieredVisualId(rec.Type, rec.Tier);
                if (visualId == 0) visualId = rec.Type;
                em.SetComponentData(entity, new BuildingVisual { Value = visualId });
                em.SetComponentData(entity, new BuildingActiveVisual { Value = 1f });
                em.SetComponentData(entity, new ConstructionProgressVisual { Value = 1f });

                if (em.HasComponent<BuildingHealth>(entity))
                    em.SetComponentData(entity, new BuildingHealth { Value = rec.Health, Max = rec.HealthMax });
                else
                    em.AddComponentData(entity, new BuildingHealth { Value = rec.Health, Max = rec.HealthMax });

                if (rec.Tier > 0)
                {
                    if (em.HasComponent<BuildingTier>(entity))
                        em.SetComponentData(entity, new BuildingTier { Value = rec.Tier });
                    else
                        em.AddComponentData(entity, new BuildingTier { Value = rec.Tier });
                }

                DrainAccruedToCapital(rec);

                RehydratePerTypeComponents(entity, rec.Type, rec.RootHex, rec.OwnerFaction);

                RestoreLedgerSlots(entity, rec);

                if ((rec.Flags & UnloadedBuildingFlags.HadRecipe) != 0 && rec.RecipeCycleRemaining > 0f)
                {
                    if (em.HasBuffer<ProductionRecipe>(entity) && SystemAPI.HasSingleton<WorldClock>())
                    {
                        float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
                        var recipes = em.GetBuffer<ProductionRecipe>(entity);
                        if (recipes.Length > 0)
                        {
                            var r = recipes[0];
                            r.CycleEndsAt = now + rec.RecipeCycleRemaining;
                            recipes[0] = r;
                        }
                    }
                }

                ReclaimFootprint(entity, rec.Type, rec.RootHex);

                if (events.IsCreated)
                {
                    events.Add(new BuildingEvent
                    {
                        Kind         = BuildingEventKind.Spawned,
                        Entity       = entity,
                        Type         = rec.Type,
                        RootHex      = rec.RootHex,
                        OwnerFaction = rec.OwnerFaction,
                    });
                }

                unloaded.RemoveAtSwapBack(i);
            }
        }

        /// <summary>Per-type primary output. 0 = no item output on hydrate (Barracks / GoblinCave produce units, not items; Capital / Inn / Market / Outpost / Tower / Wall have no recipe). Keep in sync with BuildingsGhostSimSystem.AdvanceJob.ProductionRate.</summary>
        static ushort OfflineOutputItemId(byte buildingType)
        {
            switch (buildingType)
            {
                case BuildingType.Farm:       return (ushort)ItemId.Carrot;
                case BuildingType.Village:    return (ushort)ItemId.Carrot;
                case BuildingType.Lumbercamp: return (ushort)ItemId.Log;
                case BuildingType.MiningPit:  return (ushort)ItemId.Stone;
                case BuildingType.Furnace:    return (ushort)ItemId.Coal;
                case BuildingType.Dock:       return (ushort)ItemId.Meat;
                default:                      return 0;
            }
        }

        void DrainAccruedToCapital(in UnloadedBuildingRecord rec)
        {
            if (rec.AccruedProduction < 1f) return;
            ushort itemId = OfflineOutputItemId(rec.Type);
            if (itemId == 0) return;
            int yield = (int)math.floor(rec.AccruedProduction);
            if (yield <= 0) return;

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var cap)) return;
            var em = EntityManager;
            if (!em.HasBuffer<CapitalLedger>(cap)) return;

            var treasury = em.GetBuffer<CapitalLedger>(cap).Reinterpret<BankLedgerBase>();
            ushort clamped = (ushort)math.min(yield, ushort.MaxValue);
            BankLedgerOps.AddItem(ref treasury, itemId, clamped, UlidFactory.NewUid());
        }

        /// <summary>Writes the preserved ledger slots back into the per-type ledger buffer on hydrate. Creates the buffer if the prefab archetype didn't already include it. Mirrors the per-type dispatch in <see cref="SnapshotLedgerSlots"/>.</summary>
        void RestoreLedgerSlots(Entity entity, in UnloadedBuildingRecord rec)
        {
            var em = EntityManager;
            byte type = rec.Type;

            DynamicBuffer<BankLedgerBase> target = default;
            switch (type)
            {
                case BuildingType.Capital:
                    if (em.HasBuffer<CapitalLedger>(entity))
                        target = em.GetBuffer<CapitalLedger>(entity).Reinterpret<BankLedgerBase>();
                    break;
                case BuildingType.Farm:
                    if (!em.HasBuffer<FarmLedger>(entity)) em.AddBuffer<FarmLedger>(entity);
                    target = em.GetBuffer<FarmLedger>(entity).Reinterpret<BankLedgerBase>();
                    break;
                case BuildingType.Barracks:
                    if (!em.HasBuffer<BarracksLedger>(entity)) em.AddBuffer<BarracksLedger>(entity);
                    target = em.GetBuffer<BarracksLedger>(entity).Reinterpret<BankLedgerBase>();
                    break;
                case BuildingType.Furnace:
                    if (!em.HasBuffer<FurnaceLedger>(entity)) em.AddBuffer<FurnaceLedger>(entity);
                    target = em.GetBuffer<FurnaceLedger>(entity).Reinterpret<BankLedgerBase>();
                    break;
                case BuildingType.Inn:
                    if (!em.HasBuffer<InnLedger>(entity)) em.AddBuffer<InnLedger>(entity);
                    target = em.GetBuffer<InnLedger>(entity).Reinterpret<BankLedgerBase>();
                    break;
                case BuildingType.Market:
                    if (!em.HasBuffer<MarketLedger>(entity)) em.AddBuffer<MarketLedger>(entity);
                    target = em.GetBuffer<MarketLedger>(entity).Reinterpret<BankLedgerBase>();
                    break;
                case BuildingType.Outpost:
                    if (!em.HasBuffer<OutpostLedger>(entity)) em.AddBuffer<OutpostLedger>(entity);
                    target = em.GetBuffer<OutpostLedger>(entity).Reinterpret<BankLedgerBase>();
                    break;
                case BuildingType.Lumbercamp:
                    if (!em.HasBuffer<LumbercampLedger>(entity)) em.AddBuffer<LumbercampLedger>(entity);
                    target = em.GetBuffer<LumbercampLedger>(entity).Reinterpret<BankLedgerBase>();
                    break;
                case BuildingType.MiningPit:
                    if (!em.HasBuffer<MiningPitLedger>(entity)) em.AddBuffer<MiningPitLedger>(entity);
                    target = em.GetBuffer<MiningPitLedger>(entity).Reinterpret<BankLedgerBase>();
                    break;
                case BuildingType.GoblinCave:
                    if (!em.HasBuffer<GoblinCaveLedger>(entity)) em.AddBuffer<GoblinCaveLedger>(entity);
                    target = em.GetBuffer<GoblinCaveLedger>(entity).Reinterpret<BankLedgerBase>();
                    break;
            }
            if (!target.IsCreated) return;

            target.Clear();
            if (rec.Slot0Id != 0 && rec.Slot0Count != 0) target.Add(new BankLedgerBase { Uid = UlidFactory.NewUid(), ItemId = rec.Slot0Id, Count = rec.Slot0Count });
            if (rec.Slot1Id != 0 && rec.Slot1Count != 0) target.Add(new BankLedgerBase { Uid = UlidFactory.NewUid(), ItemId = rec.Slot1Id, Count = rec.Slot1Count });
            if (rec.Slot2Id != 0 && rec.Slot2Count != 0) target.Add(new BankLedgerBase { Uid = UlidFactory.NewUid(), ItemId = rec.Slot2Id, Count = rec.Slot2Count });
            if (rec.Slot3Id != 0 && rec.Slot3Count != 0) target.Add(new BankLedgerBase { Uid = UlidFactory.NewUid(), ItemId = rec.Slot3Id, Count = rec.Slot3Count });
        }

        /// <summary>Re-establishes <see cref="HexOccupant"/> on every hex the building claims. Capital is the only multi-hex footprint today (7-hex flower); all others are single-hex. Skips hexes whose tile entities aren't live yet — re-entry is a natural no-op when a neighbouring chunk hasn't loaded.</summary>
        void ReclaimFootprint(Entity building, byte type, int2 rootHex)
        {
            var em = EntityManager;
            ClaimHex(em, building, rootHex);
            if (type == BuildingType.Capital)
            {
                ClaimHex(em, building, rootHex + new int2( 1,  0));
                ClaimHex(em, building, rootHex + new int2(-1,  0));
                ClaimHex(em, building, rootHex + new int2( 0,  1));
                ClaimHex(em, building, rootHex + new int2( 0, -1));
                ClaimHex(em, building, rootHex + new int2( 1, -1));
                ClaimHex(em, building, rootHex + new int2(-1,  1));
            }
        }

        static void ClaimHex(EntityManager em, Entity building, int2 hex)
        {
            if (!HexHoverSystem.TryGetHexEntity(hex, out var tile)) return;
            if (!em.Exists(tile)) return;
            if (em.HasComponent<HexOccupant>(tile))
                em.SetComponentData(tile, new HexOccupant { Building = building });
            else
                em.AddComponentData(tile, new HexOccupant { Building = building });
        }

        /// <summary>Rebuilds the per-type tags + production components that the original ConstructionCompleteSystem attaches on construction finish, so a hydrated building ticks correctly instead of being a visual-only shell. Kept deliberately light — only the tags + baseline production/service components; bespoke per-type state (Outpost arrow pool, Barracks recruit cadence) gets its default values from the authoring site, not the record.</summary>
        void RehydratePerTypeComponents(Entity entity, byte type, int2 rootHex, byte ownerFaction)
        {
            var em = EntityManager;
            switch (type)
            {
                case BuildingType.Farm:
                    if (!em.HasComponent<FarmTag>(entity)) em.AddComponent<FarmTag>(entity);
                    break;
                case BuildingType.Barracks:
                    if (!em.HasComponent<BarracksTag>(entity)) em.AddComponent<BarracksTag>(entity);
                    break;
                case BuildingType.Furnace:
                    if (!em.HasComponent<FurnaceTag>(entity)) em.AddComponent<FurnaceTag>(entity);
                    break;
                case BuildingType.GoblinCave:
                    if (!em.HasComponent<GoblinCaveTag>(entity)) em.AddComponent<GoblinCaveTag>(entity);
                    break;
                case BuildingType.Inn:
                    if (!em.HasComponent<InnTag>(entity)) em.AddComponent<InnTag>(entity);
                    break;
                case BuildingType.Market:
                    if (!em.HasComponent<MarketTag>(entity)) em.AddComponent<MarketTag>(entity);
                    break;
                case BuildingType.Outpost:
                    if (!em.HasComponent<OutpostTag>(entity)) em.AddComponent<OutpostTag>(entity);
                    if (!em.HasComponent<TerritoryEmitter>(entity))
                        em.AddComponentData(entity, new TerritoryEmitter
                        {
                            Center       = rootHex,
                            Radius       = 5,
                            OwnerFaction = ownerFaction,
                        });
                    break;
                case BuildingType.Lumbercamp:
                    if (!em.HasComponent<LumbercampTag>(entity)) em.AddComponent<LumbercampTag>(entity);
                    break;
                case BuildingType.MiningPit:
                    if (!em.HasComponent<MiningPitTag>(entity)) em.AddComponent<MiningPitTag>(entity);
                    break;
                case BuildingType.Dock:
                    if (!em.HasComponent<DockTag>(entity)) em.AddComponent<DockTag>(entity);
                    break;
                case BuildingType.Tower:
                    if (!em.HasComponent<TowerTag>(entity)) em.AddComponent<TowerTag>(entity);
                    if (!em.HasComponent<TerritoryEmitter>(entity))
                        em.AddComponentData(entity, new TerritoryEmitter
                        {
                            Center       = rootHex,
                            Radius       = 3,
                            OwnerFaction = ownerFaction,
                        });
                    break;
                case BuildingType.Wall:
                    if (!em.HasComponent<WallTag>(entity)) em.AddComponent<WallTag>(entity);
                    break;
            }
        }

        /// <summary>Deterministic per-hex animal spawn roll. Low biome-gated chance; no-ops for most hexes.</summary>
        static void TryRollAnimal(EntityManager em, byte biome, int gx, int gy)
        {

            uint h = (uint)gx * 0x27D4EB2Fu ^ (uint)gy * 0xC2B2AE3Du;
            h ^= h >> 13;
            h *= 0x85EBCA77u;
            h ^= h >> 16;
            float roll = (h & 0xFFFFu) / 65535f;

            byte species = UnitType.None;
            bool isBeast  = false;
            switch (biome)
            {
                case BiomeGenerator.BIOME_GRASS:
                    if      (roll < 0.010f) species = UnitType.Chicken;
                    else if (roll < 0.018f) species = UnitType.Sheep;
                    else if (roll < 0.024f) species = UnitType.Cow;
                    break;
                case BiomeGenerator.BIOME_SAND:
                    if (roll < 0.008f) species = UnitType.Chicken;
                    break;
                case BiomeGenerator.BIOME_DIRT:
                    if (roll < 0.006f) species = UnitType.Cow;
                    break;
                case BiomeGenerator.BIOME_FOREST:

                    if (roll < 0.006f) { species = UnitType.Wolf; isBeast = true; }
                    break;
            }

            if (species == UnitType.None) return;

            uint rng = (h * 0x9E3779B1u) | 1u;
            if (isBeast)
                UnitSpawnSystem.SpawnBeastAt(em, new int2(gx, gy), rng, species);
            else
                UnitSpawnSystem.SpawnAnimalAt(em, new int2(gx, gy), rng, species);
        }

        void DespawnChunk(int2 chunkCoord)
        {
            if (!_loadedChunks.TryGetValue(chunkCoord, out var entities)) return;

            int startX = chunkCoord.x * ChunkSize;
            int startY = chunkCoord.y * ChunkSize;
            for (int ly = 0; ly < ChunkSize; ly++)
                for (int lx = 0; lx < ChunkSize; lx++)
                    HexHoverSystem.RemoveHex(new int2(startX + lx, startY + ly));

            var world = WorldStoreSystem.Instance;
            bool canSave = world != null && world.IsValid;

            SnapshotBuildingsInChunk(startX, startY, startX + ChunkSize, startY + ChunkSize);

            {
                int chunkX0 = startX;
                int chunkY0 = startY;
                int chunkX1 = startX + ChunkSize;
                int chunkY1 = startY + ChunkSize;

                bool hasUnitsDb = SystemAPI.HasSingleton<UnitsDBSingleton>();
                NativeList<UnloadedUnitRecord> unloaded = default;
                if (hasUnitsDb)
                    unloaded = SystemAPI.GetSingletonRW<UnitsDBSingleton>().ValueRW.Unloaded;

                float nowSecs = SystemAPI.HasSingleton<WorldClock>()
                    ? SystemAPI.GetSingleton<WorldClock>().AbsSeconds
                    : 0f;

                var unitQuery = GetEntityQuery(typeof(Unit), typeof(UnitMovement));
                var unitArr = unitQuery.ToEntityArray(Allocator.Temp);
                for (int u = 0; u < unitArr.Length; u++)
                {
                    var unitEntity = unitArr[u];
                    var mov = EntityManager.GetComponentData<UnitMovement>(unitEntity);
                    var hex = mov.CurrentHex;
                    if (hex.x < chunkX0 || hex.x >= chunkX1 ||
                        hex.y < chunkY0 || hex.y >= chunkY1) continue;

                    var rec = UnitColdStoreOps.Snapshot(EntityManager, unitEntity, nowSecs);
                    if (hasUnitsDb && unloaded.IsCreated) unloaded.Add(rec);
                    if (canSave) world.SaveUnit(UnitColdStoreOps.ToFfi(rec));
                    EntityManager.DestroyEntity(unitEntity);
                }
                unitArr.Dispose();
            }

            for (int i = 0; i < entities.Length; i++)
            {
                var entity = entities[i];
                if (!EntityManager.Exists(entity)) continue;

                if (canSave &&
                    EntityManager.HasComponent<HexResources>(entity) &&
                    EntityManager.HasComponent<HexCoord>(entity) &&
                    EntityManager.HasComponent<BiomeType>(entity))
                {
                    var coord   = EntityManager.GetComponentData<HexCoord>(entity);
                    var biome   = EntityManager.GetComponentData<BiomeType>(entity);
                    var current = EntityManager.GetComponentData<HexResources>(entity);
                    var (gen, _) = HexResourceTable.Roll(biome.Value, coord.Q, coord.R);

                    if (current.Wood          != gen.Wood          ||
                        current.Stone         != gen.Stone         ||
                        current.Berries       != gen.Berries       ||
                        current.Mushrooms     != gen.Mushrooms     ||
                        current.Herbs         != gen.Herbs         ||
                        current.Cactus        != gen.Cactus        ||
                        current.CactusVariant != gen.CactusVariant)
                    {
                        world.SaveHex(coord.Q, coord.R, new FfiHexResources
                        {
                            wood           = current.Wood,
                            stone          = current.Stone,
                            berries        = current.Berries,
                            mushrooms      = current.Mushrooms,
                            herbs          = current.Herbs,
                            cactus         = current.Cactus,
                            cactus_variant = current.CactusVariant,
                        });
                    }
                }

                EntityManager.DestroyEntity(entity);
            }

            entities.Dispose();
            _loadedChunks.Remove(chunkCoord);
        }

        int2 WorldToChunk(float worldX, float worldY)
        {
            float r = worldY / (HexSize * 1.5f);
            float q = worldX / (HexSize * math.sqrt(3f)) - r * 0.5f;
            return new int2((int)math.floor(q / ChunkSize), (int)math.floor(r / ChunkSize));
        }

        /// <summary>Walks every Building whose RootHex falls inside the provided chunk bounds and serialises its identity + health + tier into BuildingsDBSingleton.Unloaded. Called immediately before DespawnChunk destroys the chunk's entities; BuildingsGhostSimSystem then advances these records at low cadence on a worker thread while the chunk is offline.</summary>
        void SnapshotBuildingsInChunk(int chunkX0, int chunkY0, int chunkX1, int chunkY1)
        {
            if (!SystemAPI.HasSingleton<BuildingsDBSingleton>()) return;

            var dbRW = SystemAPI.GetSingletonRW<BuildingsDBSingleton>();
            ref var unloaded = ref dbRW.ValueRW.Unloaded;
            if (!unloaded.IsCreated) return;

            var em = EntityManager;
            var buildingArr = _buildingSnapshotQuery.ToEntityArray(Allocator.Temp);

            for (int b = 0; b < buildingArr.Length; b++)
            {
                var entity = buildingArr[b];
                var building = em.GetComponentData<Building>(entity);
                if (building.RootHex.x < chunkX0 || building.RootHex.x >= chunkX1 ||
                    building.RootHex.y < chunkY0 || building.RootHex.y >= chunkY1) continue;

                var health = em.GetComponentData<BuildingHealth>(entity);
                byte tier  = em.HasComponent<BuildingTier>(entity)
                    ? em.GetComponentData<BuildingTier>(entity).Value
                    : (byte)0;

                var rec = new UnloadedBuildingRecord
                {
                    Type              = building.Type,
                    RootHex           = building.RootHex,
                    OwnerFaction      = building.OwnerFaction,
                    Health            = health.Value,
                    HealthMax         = health.Max,
                    Tier              = tier,
                    LastTickTurn      = SystemAPI.HasSingleton<WorldClock>() ? SystemAPI.GetSingleton<WorldClock>().TurnIndex : 0u,
                    AccruedProduction = 0f,
                    AccruedInput      = 0f,
                    Flags             = building.OwnerFaction == FactionType.Hostile
                                        ? UnloadedBuildingFlags.InHostileTerritory : (byte)0,
                };

                var nativeWorld = WorldStoreSystem.Instance;
                bool canFfi = nativeWorld != null && nativeWorld.IsValid;

                if (em.HasBuffer<ProductionRecipe>(entity))
                {
                    var recipes = em.GetBuffer<ProductionRecipe>(entity);
                    if (recipes.Length > 0 && SystemAPI.HasSingleton<WorldClock>())
                    {
                        float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
                        float remaining = recipes[0].CycleEndsAt - now;
                        if (remaining > 0f) rec.RecipeCycleRemaining = remaining;
                        rec.Flags |= UnloadedBuildingFlags.HadRecipe;
                    }
                }

                BuildingColdStoreOps.SnapshotLedgerSlots(em, entity, building.Type, ref rec);
                BuildingColdStoreOps.SnapshotAttack(em, entity, ref rec);

                unloaded.Add(rec);
                if (canFfi) nativeWorld.SaveBuilding(ToFfi(rec));

                em.DestroyEntity(entity);
            }
            buildingArr.Dispose();
        }

        /// <summary>UnloadedBuildingRecord → FfiUnloadedBuilding. Field order + shapes match the Rust repr(C) struct byte-for-byte so csbindgen + ECS agree on layout.</summary>
        static FfiUnloadedBuilding ToFfi(in UnloadedBuildingRecord rec) => new FfiUnloadedBuilding
        {
            building_type          = rec.Type,
            root_q                 = rec.RootHex.x,
            root_r                 = rec.RootHex.y,
            owner_faction          = rec.OwnerFaction,
            health                 = rec.Health,
            health_max             = rec.HealthMax,
            tier                   = rec.Tier,
            last_tick_turn         = rec.LastTickTurn,
            accrued_production     = rec.AccruedProduction,
            accrued_input          = rec.AccruedInput,
            flags                  = rec.Flags,
            recipe_cycle_remaining = rec.RecipeCycleRemaining,
            slot0_id    = rec.Slot0Id,
            slot0_count = rec.Slot0Count,
            slot1_id    = rec.Slot1Id,
            slot1_count = rec.Slot1Count,
            slot2_id    = rec.Slot2Id,
            slot2_count = rec.Slot2Count,
            slot3_id    = rec.Slot3Id,
            slot3_count = rec.Slot3Count,
        };

        /// <summary>FfiUnloadedBuilding → UnloadedBuildingRecord.</summary>
        static UnloadedBuildingRecord FromFfi(in FfiUnloadedBuilding f) => new UnloadedBuildingRecord
        {
            Type              = f.building_type,
            RootHex           = new int2(f.root_q, f.root_r),
            OwnerFaction      = f.owner_faction,
            Health            = f.health,
            HealthMax         = f.health_max,
            Tier              = f.tier,
            LastTickTurn      = f.last_tick_turn,
            AccruedProduction = f.accrued_production,
            AccruedInput      = f.accrued_input,
            Flags             = f.flags,
            RecipeCycleRemaining = f.recipe_cycle_remaining,
            Slot0Id    = f.slot0_id,    Slot0Count = f.slot0_count,
            Slot1Id    = f.slot1_id,    Slot1Count = f.slot1_count,
            Slot2Id    = f.slot2_id,    Slot2Count = f.slot2_count,
            Slot3Id    = f.slot3_id,    Slot3Count = f.slot3_count,
        };

    }
}

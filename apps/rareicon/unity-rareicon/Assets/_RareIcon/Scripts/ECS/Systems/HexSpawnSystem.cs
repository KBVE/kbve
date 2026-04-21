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
            var riverTileShader = Shader.Find("RareIcon/HexRiverTile");

            for (int i = 0; i < BiomeGenerator.BIOME_COUNT; i++)
            {
                // Major-river hexes get the dedicated water shader; everything
                // else uses the procedural ground shader.
                bool isRiver = i == BiomeGenerator.BIOME_RIVER && riverTileShader != null;
                _biomeMaterials[i] = new Material(isRiver ? riverTileShader : hexShader);
                _biomeMaterials[i].enableInstancing = true;

                var c = HexMeshUtil.BiomeColor((byte)i);
                var primary = new Color(c.x, c.y, c.z, c.w);
                _biomeMaterials[i].SetColor("_BaseColor", primary);

                if (isRiver)
                {
                    // River-tile material reads world-space water from
                    // OceanWater.hlsl; _BaseColor nudges the regional palette.
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

                // Procedural pixel trees — only forest opts in. The shader
                // gates on _TreeDensity so other biomes never run the tree path.
                if (i == BiomeGenerator.BIOME_FOREST)
                {
                    _biomeMaterials[i].SetFloat("_TreeDensity", 0.6f);
                    // A second darker green pair makes the canopy read against
                    // the forest base.
                    _biomeMaterials[i].SetColor("_BaseColor2", new Color(0.20f, 0.50f, 0.15f, 1f));
                }

                // Forest-floor decorations — opt in for biomes whose hexes
                // carry resources. Shader picks the icon from _ResourceType.
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
                    // Sand is sparse but cacti want to read clearly when they
                    // do appear — high density gates nothing out on a 5% roll.
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
                typeof(HexTileTag),
                typeof(HexResources),
                typeof(HexResourceVisual),
                typeof(HexTreeVisual),
                typeof(HexFloorAmounts),
                typeof(HexCactusVisual),
                typeof(ItemDrop),
                typeof(TerritoryVisual)
            );

            var batchEntities = em.CreateEntity(archetype, landCount, Allocator.Temp);
            int idx = 0;

            // Cheap fast-path: only call into the Rust store if this chunk
            // ever diverged from gen. Pristine chunks (the common case)
            // skip the per-hex FFI hop entirely.
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
                    // Override with stored ghost-chunk state if this hex
                    // was harvested before the chunk previously unloaded.
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

            // Re-materialize any ghost units that were saved when this chunk
            // last unloaded. Has to come AFTER the hex loop so the units land
            // on top of restored hex state (otherwise their CurrentHex lookup
            // races the chunk entity creation).
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

                        // Dispatch by unit_type so a saved King restores as
                        // a King (KingTag, no auto-wander) rather than a
                        // generic goblin. Future creature types add cases
                        // here; default falls through to Goblin.
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
                // Fresh chunks (no ghost state) roll for ambient wildlife.
                // Ghost-bearing chunks skip this — any animals that existed
                // are restored above, and a fresh roll would double-populate.
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
        }

        /// <summary>Deterministic per-hex animal spawn roll. Low biome-gated chance; no-ops for most hexes.</summary>
        static void TryRollAnimal(EntityManager em, byte biome, int gx, int gy)
        {
            // Hash distinct from HexResourceTable's so cactus and animal
            // rolls don't collide on the same draw.
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
                    // Wolves are rarer than wildlife rolls and use a
                    // separate spawn helper because they're hostile, not
                    // passive. Rate kept low so the forest reads as "risky"
                    // rather than impassable.
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

            // Save any hex whose resources have diverged from the gen-time
            // roll. Pristine hexes (the common case) skip the FFI hop —
            // saving them would just bloat the Rust store.
            var world = WorldStoreSystem.Instance;
            bool canSave = world != null && world.IsValid;

            // Save + destroy any units whose CurrentHex falls inside this
            // chunk. Has to happen BEFORE the hex entity cleanup below so
            // the units are still fully queryable when we read their state.
            if (canSave)
            {
                int chunkX0 = startX;
                int chunkY0 = startY;
                int chunkX1 = startX + ChunkSize;
                int chunkY1 = startY + ChunkSize;

                var unitQuery = GetEntityQuery(typeof(Unit), typeof(UnitMovement));
                var unitArr = unitQuery.ToEntityArray(Allocator.Temp);
                for (int u = 0; u < unitArr.Length; u++)
                {
                    var unitEntity = unitArr[u];
                    var mov = EntityManager.GetComponentData<UnitMovement>(unitEntity);
                    var hex = mov.CurrentHex;
                    if (hex.x < chunkX0 || hex.x >= chunkX1 ||
                        hex.y < chunkY0 || hex.y >= chunkY1) continue;

                    world.SaveUnit(MakeGhostUnit(unitEntity, mov));
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

        // Snapshots a unit entity into the flat FFI struct so the Rust store
        // can hold it across chunk reloads. Mirrors the per-unit data the
        // hover sweep already reads (first 4 inventory slots + health).
        // Energy/Mana/RandomState are NOT preserved in v1 — they reseed on
        // restore, which is acceptable since regen fills stats and the unit
        // only loses RNG continuity (next direction pick is fresh).
        FfiGhostUnit MakeGhostUnit(Entity e, in UnitMovement mov)
        {
            var unit = EntityManager.GetComponentData<Unit>(e);

            float health = 0f, maxHealth = 0f;
            if (EntityManager.HasComponent<Health>(e))
            {
                var h = EntityManager.GetComponentData<Health>(e);
                health = h.Value; maxHealth = h.Max;
            }

            ushort i0 = 0, c0 = 0, i1 = 0, c1 = 0, i2 = 0, c2 = 0, i3 = 0, c3 = 0;
            if (EntityManager.HasBuffer<PackSlot>(e))
            {
                var inv = EntityManager.GetBuffer<PackSlot>(e);
                if (inv.Length > 0) { i0 = inv[0].ItemId; c0 = inv[0].Count; }
                if (inv.Length > 1) { i1 = inv[1].ItemId; c1 = inv[1].Count; }
                if (inv.Length > 2) { i2 = inv[2].ItemId; c2 = inv[2].Count; }
                if (inv.Length > 3) { i3 = inv[3].ItemId; c3 = inv[3].Count; }
            }

            return new FfiGhostUnit
            {
                unit_type  = unit.Type,
                q          = mov.CurrentHex.x,
                r          = mov.CurrentHex.y,
                health     = health,
                max_health = maxHealth,
                inv0_id    = i0, inv0_qty = c0,
                inv1_id    = i1, inv1_qty = c1,
                inv2_id    = i2, inv2_qty = c2,
                inv3_id    = i3, inv3_qty = c3,
            };
        }
    }
}

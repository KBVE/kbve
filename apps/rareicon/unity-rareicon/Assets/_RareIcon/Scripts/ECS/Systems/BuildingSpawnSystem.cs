using Cysharp.Text;
using MessagePipe;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Consumes <see cref="BuildRequest"/> message entities and spawns the
    /// requested building from a shared prefab. Validates per-type
    /// footprint, biome eligibility, and cost (per <see cref="BuildingDB"/>)
    /// before anything is created — if any check fails the request is
    /// dropped and no resources / inventory items are consumed.
    ///
    /// One prefab is shared across all building types — HexBuilding.shader
    /// dispatches by per-instance BuildingVisual, so the same mesh +
    /// material renders Capital / Farm / Barracks / Furnace correctly.
    /// </summary>
    [UpdateInGroup(typeof(MovementSystemGroup))]
    public partial class BuildingSpawnSystem : SystemBase
    {
        const float HexSize      = 0.25f;
        const float BuildingSize = 1.5f;    // quad covers the 7-hex Capital flower; smaller buildings render inside
        const float BuildingZ    = -0.6f;   // between tiles and units

        Entity _buildingPrefab;
        bool _initialized;

        protected override void OnCreate()
        {
            RequireForUpdate<BuildRequest>();
        }

        protected override void OnUpdate()
        {
            if (!_initialized)
            {
                Init();
                if (!_initialized) return;
            }

            var em  = EntityManager;
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(World.Unmanaged);

            // GlobalMessagePipe lazily — provider is set by RootLifetimeScope.Awake
            // which fires after our OnCreate but before any player click could
            // produce a BuildRequest, so by the time we have something to
            // toast about the publisher exists.
            IPublisher<ToastMessage> toast = null;
            try { toast = GlobalMessagePipe.GetPublisher<ToastMessage>(); }
            catch { /* provider not ready yet — silent skip, very early frames */ }

            foreach (var (reqRef, reqEntity) in
                SystemAPI.Query<RefRO<BuildRequest>>().WithEntityAccess())
            {
                var req = reqRef.ValueRO;
                if (TrySpawn(em, ecb, req, out var reason))
                {
                    toast?.Publish(new ToastMessage(
                        ZString.Format("{0} placed", BuildingTypeName(req.BuildingType)),
                        ToastKind.Success));
                }
                else
                {
                    toast?.Publish(new ToastMessage(
                        ZString.Format("Cannot build {0}: {1}", BuildingTypeName(req.BuildingType), reason),
                        ToastKind.Error));
                }
                ecb.DestroyEntity(reqEntity);
            }
        }

        // Returns true on success (footprint claimed, building entity
        // queued, cost deducted). Rejection writes to `reason` and
        // makes NO mutations — partial validation never half-applies.
        bool TrySpawn(EntityManager em, EntityCommandBuffer ecb, BuildRequest req, out string reason)
        {
            // 1. Footprint validation — every claimed hex must exist on
            //    the loaded map, be unoccupied, and pass the per-type
            //    biome rule (Ocean / River refuse all builds).
            var footprint = BuildingDB.GetFootprint(req.BuildingType);
            for (int i = 0; i < footprint.Length; i++)
            {
                var hex = req.CenterHex + footprint[i];
                if (!HexHoverSystem.TryGetHexEntity(hex, out var tile))
                {
                    reason = "off-map or unloaded chunk"; return false;
                }
                if (em.HasComponent<HexOccupant>(tile))
                {
                    reason = "tile already occupied"; return false;
                }
                if (em.HasComponent<BiomeType>(tile))
                {
                    byte biome = em.GetComponentData<BiomeType>(tile).Value;
                    if (!BuildingDB.IsBuildable(req.BuildingType, biome))
                    {
                        reason = $"biome {biome} disallowed"; return false;
                    }
                }
            }

            if (req.BuildingType == BuildingType.Outpost)
            {
                if (!HasFriendlyEmitterWithin(em, req.CenterHex, BuildingDB.OutpostAnchorRadius, req.OwnerFaction))
                {
                    reason = "no friendly outpost or capital within range";
                    return false;
                }
            }
            else if (BuildingDB.RequiresInTerritory(req.BuildingType))
            {
                for (int i = 0; i < footprint.Length; i++)
                {
                    var hex = req.CenterHex + footprint[i];
                    if (!HexHoverSystem.TryGetHexEntity(hex, out var tile)) continue;
                    if (!em.HasComponent<TerritoryVisual>(tile)
                        || em.GetComponentData<TerritoryVisual>(tile).Value <= 0f)
                    {
                        reason = "outside empire territory";
                        return false;
                    }
                }
            }

            // 3. Cost validation — find the source inventory (King for
            //    Capital, Capital storage for everything else) and
            //    confirm every ingredient is in stock BEFORE deducting.
            if (!TryFindCostSource(em, req.BuildingType, out var sourceEntity, out reason))
                return false;

            var cost = BuildingDB.GetCost(req.BuildingType);
            var sourceInv = em.GetBuffer<InventorySlot>(sourceEntity);
            for (int i = 0; i < cost.Length; i++)
            {
                if (!HasItem(sourceInv, cost[i].ItemId, cost[i].Amount))
                {
                    reason = $"missing {cost[i].Amount}× item {cost[i].ItemId}";
                    return false;
                }
            }

            // 3. Commit — Capital draws its cost immediately from the King's
            //    pocket (magical land grant). Goblin Cave drains from the
            //    Capital upfront too, because its cost includes the AnyFood
            //    sentinel which can't be carried as a single item by a
            //    Builder. Everything else becomes a ConstructionSite;
            //    Builders haul the materials during the build, so nothing
            //    is deducted up front.
            if (BuildingDB.SpawnsFullyBuilt(req.BuildingType))
            {
                for (int i = 0; i < cost.Length; i++)
                    Consume(sourceInv, cost[i].ItemId, cost[i].Amount);
            }

            float3 pos = HexMeshUtil.HexToWorld(req.CenterHex.x, req.CenterHex.y, HexSize);
            pos.z = BuildingZ;

            var building = ecb.Instantiate(_buildingPrefab);
            ecb.SetComponent(building, LocalTransform.FromPosition(pos));
            ecb.SetComponent(building, new Building
            {
                Type         = req.BuildingType,
                RootHex      = req.CenterHex,
                OwnerFaction = req.OwnerFaction,
            });
            ecb.SetComponent(building, new BuildingVisual { Value = req.BuildingType });

            // Spawn at full HP regardless of construction state — the
            // ConstructionSite tag tracks "incomplete", BuildingHealth
            // tracks "damaged". Builders repair damage; construction
            // completion is a separate flow handled by ConstructionCompleteSystem.
            ushort maxHp = BuildingDB.GetMaxHealth(req.BuildingType);
            ecb.AddComponent(building, new BuildingHealth { Value = maxHp, Max = maxHp });

            // Per-type tag — production systems query on these so the
            // recipe components get auto-attached by the matching
            // *InitSystem (FarmInitSystem, FurnaceInitSystem, ...).
            // Capital is a magical grant — it lands fully functional at
            // placement. Everything else becomes a ConstructionSite and
            // waits for Builders to deliver materials before
            // ConstructionCompleteSystem wires up its tag + production.
            if (req.BuildingType == BuildingType.Capital)
            {
                ecb.AddComponent<CapitalTag>(building);
                ecb.AddComponent<NeedsStaffing>(building);
                ecb.AddComponent(building, new CapitalStatus { HasFood = 0 });

                // Two recipes run in parallel — Arrow craft pulls wood /
                // cacti / stone, Compost make pulls leaves + branches.
                // Both consume from + emit to the Capital's own storage
                // (PullsFromCapital = 0).
                var recipes = ecb.AddBuffer<ProductionRecipe>(building);
                recipes.Add(new ProductionRecipe
                {
                    Input1Id      = (ushort)ItemId.WoodLog,     Input1Amount = 1,
                    Input2Id      = (ushort)ItemId.CactiNeedle, Input2Amount = 1,
                    Input3Id      = (ushort)ItemId.Stone,       Input3Amount = 1,
                    Output1Id     = (ushort)ItemId.Arrow,       Output1Amount = 10,
                    CycleDuration = 18f,
                    CycleEndsAt   = 0f,
                });
                recipes.Add(new ProductionRecipe
                {
                    Input1Id      = (ushort)ItemId.Leaves,    Input1Amount = 2,
                    Input2Id      = (ushort)ItemId.Branches,  Input2Amount = 1,
                    Output1Id     = (ushort)ItemId.Compost,   Output1Amount = 1,
                    CycleDuration = 2f,
                    CycleEndsAt   = 0f,
                });
                // Capital claims radius 4 from its centre (7-hex footprint +
                // 3 rings of influence). Future Cities/Villages attach the
                // same component with smaller radii; TerritoryBakeSystem
                // unions all same-faction emitters.
                ecb.AddComponent(building, new TerritoryEmitter
                {
                    Center       = req.CenterHex,
                    Radius       = 4,
                    OwnerFaction = req.OwnerFaction,
                });

                ecb.AddComponent<EmpireConnected>(building);

                // Founding stockpile — arrows for immediate defence, enough
                // raw materials to keep the craft cycle running, and some
                // cooked food so goblins don't starve before Foragers/Farms
                // kick in. Tuned so the first night is survivable without
                // player micromanagement.
                var treasury = ecb.SetBuffer<InventorySlot>(building);
                treasury.Add(new InventorySlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Arrow,        Count = 1000 });
                treasury.Add(new InventorySlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.WoodLog,      Count = 300 });
                treasury.Add(new InventorySlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Stone,        Count = 200 });
                treasury.Add(new InventorySlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.CactiNeedle,  Count = 150 });
                treasury.Add(new InventorySlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Berry,        Count = 400 });
                treasury.Add(new InventorySlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Mushroom,     Count = 200 });
                treasury.Add(new InventorySlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.CookedBeef,   Count = 80 });
                treasury.Add(new InventorySlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.CookedChicken,Count = 40 });
                treasury.Add(new InventorySlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Egg,          Count = 60 });
                treasury.Add(new InventorySlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Milk,         Count = 40 });
                treasury.Add(new InventorySlot { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.BanditCoin,   Count = 120 });
            }
            else
            {
                ecb.AddComponent(building, new ConstructionSite
                {
                    RootHex      = req.CenterHex,
                    OwnerFaction = req.OwnerFaction,
                });
                ecb.SetComponent(building, new ConstructionProgressVisual { Value = 0f });
                var mats = ecb.AddBuffer<ConstructionMaterial>(building);
                var buildCost = BuildingDB.GetCost(req.BuildingType);
                for (int i = 0; i < buildCost.Length; i++)
                {
                    mats.Add(new ConstructionMaterial
                    {
                        ItemId    = buildCost[i].ItemId,
                        Needed    = (ushort)buildCost[i].Amount,
                        Delivered = 0,
                    });
                }
            }

            // Claim every hex in the footprint — HexOccupant on each tile
            // points back at the building so future queries can traverse
            // either way.
            for (int i = 0; i < footprint.Length; i++)
            {
                var hex = req.CenterHex + footprint[i];
                HexHoverSystem.TryGetHexEntity(hex, out var tile);
                ecb.AddComponent(tile, new HexOccupant { Building = building });
            }

            reason = null;
            return true;
        }

        // Resolves the entity whose InventorySlot buffer holds the cost
        // for this building type. Capital draws from the King's pocket
        // (founding act), everything else draws from the empire pool.
        bool TryFindCostSource(EntityManager em, byte buildingType, out Entity source, out string reason)
        {
            source = Entity.Null;
            reason = null;

            if (BuildingDB.GetCostSource(buildingType) == BuildingDB.CostSource.KingInventory)
            {
                foreach (var (tag, e) in
                    SystemAPI.Query<RefRO<KingTag>>().WithEntityAccess())
                {
                    source = e;
                    break;
                }
                if (source == Entity.Null) { reason = "no King in world"; return false; }
            }
            else
            {
                if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out source))
                {
                    reason = "no Capital — build one first";
                    return false;
                }
            }

            if (!em.HasBuffer<InventorySlot>(source))
            {
                reason = "cost source has no inventory buffer";
                return false;
            }
            return true;
        }

        static bool HasItem(DynamicBuffer<InventorySlot> inv, ushort itemId, ushort amount)
        {
            int total = 0;
            for (int i = 0; i < inv.Length; i++)
            {
                if (!MatchesCostItem(inv[i].ItemId, itemId)) continue;
                total += inv[i].Count;
            }
            return total >= amount;
        }

        // Walks slots and decrements until `amount` is satisfied. Caller
        // must have confirmed availability via HasItem first — this
        // function assumes the inventory holds enough. For the AnyFood
        // sentinel the walk pulls from any edible slot in buffer order;
        // which food gets spent first is arbitrary but stable.
        static void Consume(DynamicBuffer<InventorySlot> inv, ushort itemId, ushort amount)
        {
            int remaining = amount;
            for (int i = 0; i < inv.Length && remaining > 0; i++)
            {
                if (!MatchesCostItem(inv[i].ItemId, itemId)) continue;
                var slot = inv[i];
                int take = slot.Count < remaining ? slot.Count : remaining;
                slot.Count = (ushort)(slot.Count - take);
                inv[i] = slot;
                remaining -= take;
            }
        }

        // Matches a concrete inventory-slot ItemId against a cost-line ItemId.
        // Cost lines usually name a specific item, but BuildingDB.AnyFoodSentinel
        // means "any slot that holds an edible item" per ItemDB.RestoreEnergy.
        static bool MatchesCostItem(ushort slotId, ushort costId)
        {
            if (costId == BuildingDB.AnyFoodSentinel)
                return ItemDB.EnergyValue(slotId) > 0f;
            return slotId == costId;
        }

        static string BuildingTypeName(byte t) => t switch
        {
            BuildingType.Capital    => "Capital",
            BuildingType.Farm       => "Farm",
            BuildingType.Barracks   => "Barracks",
            BuildingType.Furnace    => "Furnace",
            BuildingType.GoblinCave => "Goblin Cave",
            BuildingType.Inn        => "Inn",
            BuildingType.Market     => "Market",
            BuildingType.Outpost    => "Outpost",
            _ => "Unknown",
        };

        bool HasFriendlyEmitterWithin(EntityManager em, int2 center, int radius, byte faction)
        {
            foreach (var e in SystemAPI.Query<RefRO<TerritoryEmitter>>())
            {
                var em_ = e.ValueRO;
                if (em_.OwnerFaction != faction) continue;
                if (em_.Radius == 0) continue;
                if (AxialDistance(em_.Center - center) <= radius) return true;
            }
            return false;
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }

        void Init()
        {
            var shader = Shader.Find("RareIcon/HexBuilding");
            if (shader == null)
            {
                Debug.LogError("[BuildingSpawnSystem] HexBuilding shader not found");
                return;
            }

            var mesh = CreateQuadMesh(BuildingSize);
            var material = new Material(shader) { enableInstancing = true };

            var em = EntityManager;
            _buildingPrefab = em.CreateEntity();
            em.AddComponentData(_buildingPrefab, LocalTransform.Identity);
            em.AddComponentData(_buildingPrefab, new Building());
            em.AddComponentData(_buildingPrefab, new BuildingVisual());
            // Inventory buffer on every building prefab — Capital uses it
            // as central storage, future per-building input/output buffers
            // (Farm output queue, Furnace fuel hopper) reuse the slot too.
            em.AddBuffer<InventorySlot>(_buildingPrefab);
            em.AddComponentData(_buildingPrefab, new BuildingActiveVisual());
            em.AddComponentData(_buildingPrefab, new ConstructionProgressVisual { Value = 1f });
            em.AddComponent<Prefab>(_buildingPrefab);

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });
            RenderMeshUtility.AddComponents(
                _buildingPrefab, em, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            _initialized = true;
        }

        static Mesh CreateQuadMesh(float size)
        {
            float half = size * 0.5f;
            var mesh = new Mesh
            {
                vertices = new[]
                {
                    new Vector3(-half, -half, 0f),
                    new Vector3( half, -half, 0f),
                    new Vector3( half,  half, 0f),
                    new Vector3(-half,  half, 0f),
                },
                uv = new[]
                {
                    new Vector2(0, 0), new Vector2(1, 0),
                    new Vector2(1, 1), new Vector2(0, 1),
                },
                triangles = new[] { 0, 2, 1, 0, 3, 2 },
            };
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}

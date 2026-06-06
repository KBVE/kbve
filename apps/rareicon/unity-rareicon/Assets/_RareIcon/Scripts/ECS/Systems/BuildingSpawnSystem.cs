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

    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(MovementSystemGroup))]
    public partial class BuildingSpawnSystem : SystemBase
    {
        const float HexSize      = 0.25f;
        const float BuildingSize = 1.5f;
        const float BuildingZ    = -0.6f;

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

            IPublisher<ToastMessage> toast = null;
            try { toast = GlobalMessagePipe.GetPublisher<ToastMessage>(); }
            catch {  }

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

        bool TrySpawn(EntityManager em, EntityCommandBuffer ecb, BuildRequest req, out string reason)
        {

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
                    if (!em.HasComponent<TerritoryVisual>(tile))
                    {
                        reason = "outside empire territory";
                        return false;
                    }
                    float tv = em.GetComponentData<TerritoryVisual>(tile).Value;
                    if (tv <= 0f || tv >= 3f)
                    {
                        reason = "outside empire territory";
                        return false;
                    }
                }
            }

            if (!TryFindCostSource(em, req.BuildingType, out var sourceEntity, out var sourceIsKing, out reason))
                return false;

            var cost = BuildingDB.GetCost(req.BuildingType);
            if (sourceIsKing)
            {
                var sourcePack = em.GetBuffer<PackSlot>(sourceEntity);
                for (int i = 0; i < cost.Length; i++)
                {
                    if (!ItemSlotOps.HasBuildCost(sourcePack, cost[i].ItemId, cost[i].Amount))
                    {
                        reason = $"missing {cost[i].Amount}× item {cost[i].ItemId}";
                        return false;
                    }
                }
                if (BuildingDB.SpawnsFullyBuilt(req.BuildingType))
                {
                    for (int i = 0; i < cost.Length; i++)
                        ConsumePack(sourcePack, cost[i].ItemId, cost[i].Amount);
                }
            }

            float3 pos = HexMeshUtil.HexToWorld(req.CenterHex.x, req.CenterHex.y, HexSize);
            pos.z = BuildingZ;

            var building = ecb.Instantiate(_buildingPrefab);
            float scale = BuildingDB.GetVisualScale(req.BuildingType);
            ecb.SetComponent(building, LocalTransform.FromPositionRotationScale(pos, quaternion.identity, scale));
            ecb.SetComponent(building, new Building
            {
                Type         = req.BuildingType,
                RootHex      = req.CenterHex,
                OwnerFaction = req.OwnerFaction,
            });
            ecb.SetComponent(building, new BuildingVisual { Value = req.BuildingType });

            ushort maxHp = BuildingDB.GetMaxHealth(req.BuildingType);
            ecb.AddComponent(building, new BuildingHealth { Value = maxHp, Max = maxHp });

            if (req.BuildingType == BuildingType.Capital)
            {
                ecb.AddComponent<CapitalTag>(building);
                ecb.AddComponent<CityTag>(building);
                ecb.AddComponent(building, new CityAdminRadius { Radius = 12 });
                ecb.AddComponent<NeedsStaffing>(building);
                ecb.AddComponent(building, new CapitalStatus { HasFood = 0 });

                var recipes = ecb.AddBuffer<ProductionRecipe>(building);
                recipes.Add(new ProductionRecipe
                {
                    Input1Id      = (ushort)ItemId.Log,     Input1Amount = 1,
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

                ecb.AddComponent(building, new TerritoryEmitter
                {
                    Center       = req.CenterHex,
                    Radius       = 4,
                    OwnerFaction = req.OwnerFaction,
                });

                ecb.AddComponent<EmpireConnected>(building);

                ecb.AddComponent(building, new ReservedRoles
                {
                    Guard   = 2,
                    Builder = 1,
                    Medic   = 1,
                });

                ecb.AddComponent(building, new ProvidesFood  { Priority = 3 });
                ecb.AddComponent(building, new ProvidesSleep { Capacity = 255 });

                var treasury = ecb.AddBuffer<CapitalLedger>(building);
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Arrow,        Count = 3500 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Timber,       Count = 8 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.StoneBlock,   Count = 5 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Log,          Count = 600 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Stone,        Count = 450 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.CactiNeedle,  Count = 350 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Berry,        Count = 1800 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Mushroom,     Count = 1200 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.CookedBeef,   Count = 750 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.CookedChicken,Count = 750 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Egg,          Count = 600 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.FreshMilk,    Count = 450 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Meal,         Count = 120 });
                treasury.Add(new CapitalLedger { Uid = UlidFactory.NewUid(), ItemId = (ushort)ItemId.Coin,         Count = 200 });
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

            for (int i = 0; i < footprint.Length; i++)
            {
                var hex = req.CenterHex + footprint[i];
                HexHoverSystem.TryGetHexEntity(hex, out var tile);
                ecb.AddComponent(tile, new HexOccupant { Building = building });
            }

            reason = null;
            return true;
        }

        bool TryFindCostSource(EntityManager em, byte buildingType, out Entity source, out bool sourceIsKing, out string reason)
        {
            source = Entity.Null;
            sourceIsKing = false;
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
                if (!em.HasBuffer<PackSlot>(source))
                {
                    reason = "King has no PackSlot buffer";
                    return false;
                }
                sourceIsKing = true;
                return true;
            }

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out source))
            {
                reason = "no Capital — build one first";
                return false;
            }
            if (!em.HasBuffer<CapitalLedger>(source))
            {
                reason = "Capital has no CapitalLedger buffer";
                return false;
            }
            return true;
        }

        static void ConsumePack(DynamicBuffer<PackSlot> pack, ushort itemId, ushort amount)
        {
            int remaining = amount;
            for (int i = 0; i < pack.Length && remaining > 0; i++)
            {
                if (!MatchesCostItem(pack[i].ItemId, itemId)) continue;
                var slot = pack[i];
                int take = slot.Count < remaining ? slot.Count : remaining;
                slot.Count = (ushort)(slot.Count - take);
                pack[i] = slot;
                remaining -= take;
            }
        }

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
            BuildingType.Lumbercamp => "Lumbercamp",
            BuildingType.MiningPit  => "Mining Pit",
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

            using var existing = em.CreateEntityQuery(ComponentType.ReadWrite<BuildingPrefabSingleton>());
            Entity singleton = existing.CalculateEntityCount() > 0
                ? existing.GetSingletonEntity()
                : em.CreateEntity(typeof(BuildingPrefabSingleton));
            em.SetComponentData(singleton, new BuildingPrefabSingleton { Prefab = _buildingPrefab });

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

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
            var ecb = new EntityCommandBuffer(Unity.Collections.Allocator.Temp);

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

            ecb.Playback(em);
            ecb.Dispose();
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

            // 2. Cost validation — find the source inventory (King for
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

            // 3. Commit — Capital draws its cost immediately from the King's pocket
            //    (it's a magical land grant). Everything else becomes a
            //    ConstructionSite; Builders haul the materials from Capital
            //    storage during the build, so nothing is deducted up front.
            if (req.BuildingType == BuildingType.Capital)
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
                ecb.AddComponent(building, new CapitalProduction
                {
                    Input1Id     = (ushort)ItemId.WoodLog,     Input1Amount = 1,
                    Input2Id     = (ushort)ItemId.CactiNeedle, Input2Amount = 1,
                    Input3Id     = (ushort)ItemId.Stone,       Input3Amount = 1,
                    OutputId     = (ushort)ItemId.Arrow,       OutputAmount = 10,
                    CycleEndsAt   = 0f,
                    CycleDuration = 18f,
                });
            }
            else
            {
                ecb.AddComponent(building, new ConstructionSite
                {
                    RootHex      = req.CenterHex,
                    OwnerFaction = req.OwnerFaction,
                });
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
                foreach (var (b, e) in
                    SystemAPI.Query<RefRO<Building>>().WithEntityAccess())
                {
                    if (b.ValueRO.Type == BuildingType.Capital) { source = e; break; }
                }
                if (source == Entity.Null) { reason = "no Capital — build one first"; return false; }
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
                if (inv[i].ItemId == itemId) total += inv[i].Count;
            return total >= amount;
        }

        // Walks slots and decrements until `amount` is satisfied. Caller
        // must have confirmed availability via HasItem first — this
        // function assumes the inventory holds enough.
        static void Consume(DynamicBuffer<InventorySlot> inv, ushort itemId, ushort amount)
        {
            int remaining = amount;
            for (int i = 0; i < inv.Length && remaining > 0; i++)
            {
                if (inv[i].ItemId != itemId) continue;
                var slot = inv[i];
                int take = slot.Count < remaining ? slot.Count : remaining;
                slot.Count = (ushort)(slot.Count - take);
                inv[i] = slot;
                remaining -= take;
            }
        }

        static string BuildingTypeName(byte t) => t switch
        {
            BuildingType.Capital  => "Capital",
            BuildingType.Farm     => "Farm",
            BuildingType.Barracks => "Barracks",
            BuildingType.Furnace  => "Furnace",
            _ => "Unknown",
        };

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

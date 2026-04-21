using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Positions footprint overlays on the cursor while build mode is
    /// active; tints red when the placement is invalid (biome bad, hex
    /// occupied, off-map, OR cost not met). Footprint shape (1-hex vs
    /// 7-hex flower) comes from <see cref="BuildingDB"/> so adding a new
    /// building automatically gets the right preview without touching
    /// this system.
    ///
    /// Allocates 7 preview entities up-front (max footprint = Capital
    /// flower); single-hex builds simply hide the extra 6.
    /// </summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(HexHoverSystem))]
    public partial class BuildPreviewSystem : SystemBase
    {
        const float HexSize    = 0.25f;
        const float HiddenZ    = 99999f;
        const float OverlayZ   = -0.95f;
        const int   MaxPreviewSlots = 7;   // matches Capital flower footprint

        // Matches HexBuildPreview.shader Properties defaults.
        static readonly float4 ValidFill     = new(0.30f, 0.90f, 0.40f, 0.35f);
        static readonly float4 ValidBorder   = new(0.30f, 0.90f, 0.40f, 0.85f);
        static readonly float4 InvalidFill   = new(0.92f, 0.22f, 0.22f, 0.40f);
        static readonly float4 InvalidBorder = new(0.92f, 0.22f, 0.22f, 0.90f);

        Entity[] _previews;    // pool of MaxPreviewSlots overlays
        bool _initialized;
        int2 _lastAnchor;
        byte _lastTarget;
        bool _wasActive;
        bool _lastValid;

        protected override void OnCreate()
        {
            RequireForUpdate<BuildMode>();
            RequireForUpdate<MouseState>();
            _lastAnchor = new int2(int.MinValue, int.MinValue);
        }

        protected override void OnDestroy() { /* entities cleaned on world teardown */ }

        protected override void OnUpdate()
        {
            if (!_initialized)
            {
                Init();
                if (!_initialized) return;
            }

            var buildMode = SystemAPI.GetSingleton<BuildMode>();
            var mouse     = SystemAPI.GetSingleton<MouseState>();
            bool active   = buildMode.Target != BuildTarget.None;

            if (!active)
            {
                if (_wasActive)
                {
                    HideAllPreviews();
                    _lastAnchor = new int2(int.MinValue, int.MinValue);
                }
                _wasActive = false;
                return;
            }

            bool justEntered  = !_wasActive;
            bool targetChanged = buildMode.Target != _lastTarget;
            _wasActive  = true;
            _lastTarget = buildMode.Target;

            // Skip unchanged frames — only repaint when the cursor moves
            // to a new hex, the target building changed, OR we just
            // entered build mode (so the initial paint reflects validity).
            bool hexChanged = !mouse.HexCoord.Equals(_lastAnchor);
            if (!justEntered && !hexChanged && !targetChanged) return;
            _lastAnchor = mouse.HexCoord;

            var em = EntityManager;
            var footprint = BuildingDB.GetFootprint(buildMode.Target);
            bool valid = IsPlacementValid(em, mouse.HexCoord, buildMode.Target, footprint);

            // Position the active preview slots, hide the rest.
            for (int i = 0; i < footprint.Length && i < MaxPreviewSlots; i++)
            {
                var hex = mouse.HexCoord + footprint[i];
                float3 pos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
                pos.z = OverlayZ;
                em.SetComponentData(_previews[i], LocalTransform.FromPosition(pos));
            }
            for (int i = footprint.Length; i < MaxPreviewSlots; i++)
            {
                em.SetComponentData(_previews[i], LocalTransform.FromPosition(
                    new float3(HiddenZ, HiddenZ, HiddenZ)));
            }

            if (justEntered || targetChanged || valid != _lastValid)
            {
                var fill   = valid ? ValidFill   : InvalidFill;
                var border = valid ? ValidBorder : InvalidBorder;
                for (int i = 0; i < footprint.Length && i < MaxPreviewSlots; i++)
                {
                    em.SetComponentData(_previews[i], new HexBuildPreviewFill   { Value = fill });
                    em.SetComponentData(_previews[i], new HexBuildPreviewBorder { Value = border });
                }
                _lastValid = valid;
            }
        }

        // Mirrors BuildingSpawnSystem's checks so the preview never lies
        // about whether a click will succeed. Rejects on:
        //   • any footprint hex off-map / unloaded
        //   • any footprint hex already occupied
        //   • any footprint hex on a disallowed biome (Ocean/River)
        //   • cost source doesn't have the required ingredients
        static bool IsPlacementValid(EntityManager em, int2 centerHex,
                                     byte buildingType, int2[] footprint)
        {
            // Footprint check — same logic as BuildingSpawnSystem.
            for (int i = 0; i < footprint.Length; i++)
            {
                var hex = centerHex + footprint[i];
                if (!HexHoverSystem.TryGetHexEntity(hex, out var tile)) return false;
                if (em.HasComponent<HexOccupant>(tile)) return false;
                if (em.HasComponent<BiomeType>(tile))
                {
                    byte biome = em.GetComponentData<BiomeType>(tile).Value;
                    if (!BuildingDB.IsBuildable(buildingType, biome)) return false;
                }
            }

            if (buildingType == BuildingType.Outpost)
            {
                if (!HasFriendlyEmitterWithin(em, centerHex,
                                              BuildingDB.OutpostAnchorRadius,
                                              FactionType.Player))
                    return false;
            }
            else if (BuildingDB.RequiresInTerritory(buildingType))
            {
                for (int i = 0; i < footprint.Length; i++)
                {
                    var hex = centerHex + footprint[i];
                    if (!HexHoverSystem.TryGetHexEntity(hex, out var tile)) return false;
                    if (!em.HasComponent<TerritoryVisual>(tile)
                        || em.GetComponentData<TerritoryVisual>(tile).Value <= 0f)
                        return false;
                }
            }

            // Cost check — find source inventory + verify each ingredient.
            // Failures here paint red same as a bad biome would, so the
            // player gets one consistent "you can't place here" signal.
            return CostSourceHasIngredients(em, buildingType);
        }

        static bool CostSourceHasIngredients(EntityManager em, byte buildingType)
        {
            var cost = BuildingDB.GetCost(buildingType);
            if (BuildingDB.GetCostSource(buildingType) == BuildingDB.CostSource.KingInventory)
            {
                var q = em.CreateEntityQuery(ComponentType.ReadOnly<KingTag>());
                if (q.CalculateEntityCount() == 0) { q.Dispose(); return false; }
                var arr = q.ToEntityArray(Unity.Collections.Allocator.Temp);
                Entity king = arr[0];
                arr.Dispose();
                q.Dispose();
                if (!em.HasBuffer<PackSlot>(king)) return false;
                var pack = em.GetBuffer<PackSlot>(king);
                for (int i = 0; i < cost.Length; i++)
                    if (!ItemSlotOps.HasBuildCost(pack, cost[i].ItemId, cost[i].Amount)) return false;
                return true;
            }
            {
                var q = em.CreateEntityQuery(ComponentType.ReadOnly<CapitalTag>());
                if (q.CalculateEntityCount() == 0) { q.Dispose(); return false; }
                Entity capital = q.GetSingletonEntity();
                q.Dispose();
                if (!em.HasBuffer<CapitalLedger>(capital)) return false;
                var inv = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
                for (int i = 0; i < cost.Length; i++)
                    if (!BankLedgerOps.HasBuildCost(inv, cost[i].ItemId, cost[i].Amount)) return false;
                return true;
            }
        }

        static bool HasFriendlyEmitterWithin(EntityManager em, int2 center, int radius, byte faction)
        {
            var q = em.CreateEntityQuery(ComponentType.ReadOnly<TerritoryEmitter>());
            if (q.CalculateEntityCount() == 0) return false;
            var arr = q.ToEntityArray(Unity.Collections.Allocator.Temp);
            try
            {
                for (int i = 0; i < arr.Length; i++)
                {
                    var e = em.GetComponentData<TerritoryEmitter>(arr[i]);
                    if (e.OwnerFaction != faction) continue;
                    if (e.Radius == 0) continue;
                    if (AxialDistance(e.Center - center) <= radius) return true;
                }
            }
            finally { arr.Dispose(); }
            return false;
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }


        void HideAllPreviews()
        {
            if (_previews == null) return;
            var em = EntityManager;
            var off = LocalTransform.FromPosition(new float3(HiddenZ, HiddenZ, HiddenZ));
            for (int i = 0; i < _previews.Length; i++)
                em.SetComponentData(_previews[i], off);
        }

        void Init()
        {
            var shader = Shader.Find("RareIcon/HexBuildPreview");
            if (shader == null)
            {
                Debug.LogError("[BuildPreviewSystem] HexBuildPreview shader not found");
                return;
            }

            // Mesh slightly larger than the tile so the ring sits outside
            // the tile edge and the fill fully covers the tile underneath.
            var mesh = HexMeshUtil.CreateHexMesh(HexSize * 1.02f);
            var material = new Material(shader) { enableInstancing = true };

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });

            _previews = new Entity[MaxPreviewSlots];
            var em = EntityManager;
            for (int i = 0; i < _previews.Length; i++)
            {
                var e = em.CreateEntity();
                em.AddComponentData(e, LocalTransform.FromPosition(new float3(HiddenZ, HiddenZ, HiddenZ)));
                // MaterialProperty components MUST be attached BEFORE
                // RenderMeshUtility.AddComponents — Entities Graphics
                // snapshots the property set at bind time.
                em.AddComponentData(e, new HexBuildPreviewFill   { Value = ValidFill });
                em.AddComponentData(e, new HexBuildPreviewBorder { Value = ValidBorder });
                RenderMeshUtility.AddComponents(
                    e, em, renderDesc, renderArray,
                    MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));
                _previews[i] = e;
            }

            _initialized = true;
        }
    }
}

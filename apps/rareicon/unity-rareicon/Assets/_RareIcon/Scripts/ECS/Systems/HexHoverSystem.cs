using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using MessagePipe;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Reads MouseState singleton, moves a single hover overlay entity
    /// to the hovered hex position. No per-entity component changes.
    /// One overlay entity, one position update per frame.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class HexHoverSystem : SystemBase
    {
        const float HexSize = 0.25f;

        static NativeHashMap<int2, Entity> _hexLookup;
        static bool _initialized;

        Entity _overlayEntity;
        bool _overlayCreated;
        int2 _lastHex;

        public static void Initialize(int capacity)
        {
            if (_initialized && _hexLookup.IsCreated) _hexLookup.Dispose();
            _hexLookup = new NativeHashMap<int2, Entity>(capacity, Allocator.Persistent);
            _initialized = true;
        }

        public static void AddHex(int2 coord, Entity entity)
        {
            if (!_initialized) Initialize(4096);
            _hexLookup.TryAdd(coord, entity);
        }

        public static void RemoveHex(int2 coord)
        {
            if (_initialized && _hexLookup.IsCreated)
                _hexLookup.Remove(coord);
        }

        /// <summary>
        /// Hex coord → entity lookup. Used by HarvestSystem and any other
        /// system that needs to resolve a hex coord into its underlying ECS
        /// entity (for resource reads / writes / per-tile queries).
        /// </summary>
        public static bool TryGetHexEntity(int2 coord, out Entity entity)
        {
            if (_initialized && _hexLookup.IsCreated)
                return _hexLookup.TryGetValue(coord, out entity);
            entity = default;
            return false;
        }

        /// <summary>Handle to the hex lookup for Burst jobs; assert IsCreated before passing in.</summary>
        public static NativeHashMap<int2, Entity> HexLookup => _hexLookup;

        public static void Cleanup()
        {
            if (_initialized && _hexLookup.IsCreated)
            {
                _hexLookup.Dispose();
                _initialized = false;
            }
        }

        protected override void OnCreate()
        {
            RequireForUpdate<MouseState>();
            _lastHex = new int2(int.MinValue, int.MinValue);
        }

        protected override void OnDestroy()
        {
            Cleanup();
        }

        protected override void OnUpdate()
        {
            if (!_initialized || !_hexLookup.IsCreated) return;

            // Create overlay entity once
            if (!_overlayCreated)
            {
                CreateOverlay();
                if (!_overlayCreated) return;
            }

            var mouse = SystemAPI.GetSingleton<MouseState>();

            // Click detection — MouseStateSource gates OverUI based on press-time
            // capture, so a click that started over UI never publishes here.
            if (mouse.LeftReleasedThisFrame && !mouse.OverUI)
            {
                bool clickIsLand = _hexLookup.TryGetValue(mouse.HexCoord, out Entity clickedEntity);
                byte clickBiome = 0;
                if (clickIsLand)
                    clickBiome = EntityManager.GetComponentData<BiomeType>(clickedEntity).Value;

                GlobalMessagePipe.GetPublisher<HexClickedMessage>().Publish(
                    new HexClickedMessage(mouse.HexCoord.x, mouse.HexCoord.y, clickBiome, clickIsLand)
                );
            }

            if (!mouse.Changed) return;
            if (mouse.HexCoord.Equals(_lastHex)) return;
            _lastHex = mouse.HexCoord;

            // Always move overlay to hovered hex position
            float3 pos = HexMeshUtil.HexToWorld(mouse.HexCoord.x, mouse.HexCoord.y, HexSize);
            pos.z = -1f;
            EntityManager.SetComponentData(_overlayEntity, LocalTransform.FromPosition(pos));

            // Publish hover info
            bool isLand = _hexLookup.TryGetValue(mouse.HexCoord, out Entity hexEntity);
            var publisher = GlobalMessagePipe.GetPublisher<HexHoverMessage>();

            // Sweep units once per hex change — find any unit standing on this hex
            // and grab its stats / first 4 inventory slots while we're at it.
            byte unitType = 0;
            float hp = 0, hpMax = 0, en = 0, enMax = 0, mp = 0, mpMax = 0;
            float hg = 0, hgMax = 0, fg = 0, fgMax = 0;
            ushort i0 = 0, c0 = 0, i1 = 0, c1 = 0, i2 = 0, c2 = 0, i3 = 0, c3 = 0;
            foreach (var (transform, unit, entity) in
                     SystemAPI.Query<RefRO<LocalTransform>, RefRO<Unit>>().WithEntityAccess())
            {
                var p = transform.ValueRO.Position;
                var unitHex = HexMeshUtil.WorldToHex(p.x, p.y, HexSize);
                if (unitHex.Equals(mouse.HexCoord))
                {
                    unitType = unit.ValueRO.Type;
                    if (EntityManager.HasComponent<Health>(entity))
                    {
                        var h = EntityManager.GetComponentData<Health>(entity);
                        hp = h.Value; hpMax = h.Max;
                    }
                    if (EntityManager.HasComponent<Energy>(entity))
                    {
                        var e = EntityManager.GetComponentData<Energy>(entity);
                        en = e.Value; enMax = e.Max;
                    }
                    if (EntityManager.HasComponent<Mana>(entity))
                    {
                        var m = EntityManager.GetComponentData<Mana>(entity);
                        mp = m.Value; mpMax = m.Max;
                    }
                    if (EntityManager.HasComponent<Hunger>(entity))
                    {
                        var h = EntityManager.GetComponentData<Hunger>(entity);
                        hg = h.Value; hgMax = h.Max;
                    }
                    if (EntityManager.HasComponent<Fatigue>(entity))
                    {
                        var f = EntityManager.GetComponentData<Fatigue>(entity);
                        fg = f.Value; fgMax = f.Max;
                    }
                    if (EntityManager.HasBuffer<InventorySlot>(entity))
                    {
                        var inv = EntityManager.GetBuffer<InventorySlot>(entity);
                        if (inv.Length > 0) { i0 = inv[0].ItemId; c0 = inv[0].Count; }
                        if (inv.Length > 1) { i1 = inv[1].ItemId; c1 = inv[1].Count; }
                        if (inv.Length > 2) { i2 = inv[2].ItemId; c2 = inv[2].Count; }
                        if (inv.Length > 3) { i3 = inv[3].ItemId; c3 = inv[3].Count; }
                    }
                    break;
                }
            }

            if (isLand)
            {
                var biome = EntityManager.GetComponentData<BiomeType>(hexEntity);
                var res = EntityManager.HasComponent<HexResources>(hexEntity)
                    ? EntityManager.GetComponentData<HexResources>(hexEntity)
                    : default;
                publisher.Publish(new HexHoverMessage(
                    mouse.HexCoord.x, mouse.HexCoord.y, biome.Value, true,
                    res.Wood, res.Stone, res.Berries, res.Mushrooms, res.Herbs,
                    res.Cactus, res.CactusVariant,
                    unitType,
                    hp, hpMax, en, enMax, mp, mpMax,
                    hg, hgMax, fg, fgMax,
                    i0, c0, i1, c1, i2, c2, i3, c3));
            }
            else
            {
                publisher.Publish(new HexHoverMessage(
                    mouse.HexCoord.x, mouse.HexCoord.y, 0, false,
                    0, 0, 0, 0, 0,
                    0, 0,
                    unitType,
                    hp, hpMax, en, enMax, mp, mpMax,
                    hg, hgMax, fg, fgMax,
                    i0, c0, i1, c1, i2, c2, i3, c3));
            }
        }

        void CreateOverlay()
        {
            var shader = Shader.Find("RareIcon/HexHoverOverlay");
            if (shader == null)
            {
                Debug.LogError("[HexHoverSystem] HexHoverOverlay shader not found");
                return;
            }

            var mesh = HexMeshUtil.CreateHexMesh(HexSize * 1.1f); // slightly larger than tile
            var material = new Material(shader);
            material.enableInstancing = true;

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false
            );

            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });

            _overlayEntity = EntityManager.CreateEntity();
            EntityManager.AddComponentData(_overlayEntity,
                LocalTransform.FromPosition(new float3(99999, 99999, 99999)));
            EntityManager.AddComponent<HexHoverOverlayTag>(_overlayEntity);

            RenderMeshUtility.AddComponents(
                _overlayEntity, EntityManager, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0)
            );

            _overlayCreated = true;
            Debug.Log("[HexHoverSystem] Hover overlay entity created");
        }
    }
}

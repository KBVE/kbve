using System;
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
    /// <summary>Moves the hover overlay entity to the hovered hex and publishes <see cref="HexHoverMessage"/> / <see cref="HexClickedMessage"/> on mouse activity.</summary>
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

            // Publish / refresh the singleton entity so Burst-compiled
            // consumer systems can read the map via SystemAPI.GetSingleton,
            // which is the only Burst-safe way to reach static data.
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            using var q = em.CreateEntityQuery(ComponentType.ReadWrite<HexLookupSingleton>());
            Entity e = q.CalculateEntityCount() == 0
                ? em.CreateEntity(typeof(HexLookupSingleton))
                : q.GetSingletonEntity();
            em.SetComponentData(e, new HexLookupSingleton { Lookup = _hexLookup });
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

            if (mouse.LeftReleasedThisFrame && !mouse.OverUI && !mouse.DragEndedThisFrame)
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
            byte unitFaction = 0;
            ushort nameFirst = 0, nameEpithet = 0;
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
                    if (EntityManager.HasComponent<Faction>(entity))
                        unitFaction = EntityManager.GetComponentData<Faction>(entity).Value;
                    if (EntityManager.HasComponent<UnitName>(entity))
                    {
                        var nm = EntityManager.GetComponentData<UnitName>(entity);
                        nameFirst = nm.FirstNameId;
                        nameEpithet = nm.EpithetId;
                    }
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
                    if (EntityManager.HasBuffer<PackSlot>(entity))
                    {
                        var inv = EntityManager.GetBuffer<PackSlot>(entity);
                        const int MaxAgg = 32;
                        Span<ushort> aggIds    = stackalloc ushort[MaxAgg];
                        Span<int>    aggCounts = stackalloc int   [MaxAgg];
                        int uniq = 0;
                        for (int k = 0; k < inv.Length; k++)
                        {
                            ushort id = inv[k].ItemId;
                            ushort cnt = inv[k].Count;
                            if (id == 0 || cnt == 0) continue;
                            int hit = -1;
                            for (int j = 0; j < uniq; j++)
                                if (aggIds[j] == id) { hit = j; break; }
                            if (hit >= 0) aggCounts[hit] += cnt;
                            else if (uniq < MaxAgg)
                            { aggIds[uniq] = id; aggCounts[uniq] = cnt; uniq++; }
                        }
                        for (int a = 1; a < uniq; a++)
                        {
                            int kc = aggCounts[a]; ushort ki = aggIds[a];
                            int b = a - 1;
                            while (b >= 0 && aggCounts[b] < kc)
                            {
                                aggCounts[b + 1] = aggCounts[b];
                                aggIds[b + 1]    = aggIds[b];
                                b--;
                            }
                            aggCounts[b + 1] = kc;
                            aggIds[b + 1]    = ki;
                        }
                        if (uniq > 0) { i0 = aggIds[0]; c0 = (ushort)math.min(aggCounts[0], ushort.MaxValue); }
                        if (uniq > 1) { i1 = aggIds[1]; c1 = (ushort)math.min(aggCounts[1], ushort.MaxValue); }
                        if (uniq > 2) { i2 = aggIds[2]; c2 = (ushort)math.min(aggCounts[2], ushort.MaxValue); }
                        if (uniq > 3) { i3 = aggIds[3]; c3 = (ushort)math.min(aggCounts[3], ushort.MaxValue); }
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
                    i0, c0, i1, c1, i2, c2, i3, c3,
                    nameFirst, nameEpithet, unitFaction));
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
                    i0, c0, i1, c1, i2, c2, i3, c3,
                    nameFirst, nameEpithet, unitFaction));
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

    /// <summary>Singleton mirror of HexHoverSystem's internal hex map; Burst-compiled systems read the NativeHashMap via SystemAPI.GetSingleton since static fields aren't Burst-accessible.</summary>
    public struct HexLookupSingleton : IComponentData
    {
        public NativeHashMap<int2, Entity> Lookup;
    }
}

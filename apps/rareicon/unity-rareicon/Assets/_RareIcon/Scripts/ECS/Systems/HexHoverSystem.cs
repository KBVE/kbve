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
    /// <summary>Moves the hover overlay entity to the hovered hex and publishes <see cref="HexHoverMessage"/> / <see cref="HexClickedMessage"/> on mouse activity. Presentation-only: mouse input + overlay rendering are client concerns. Scoped to BehaviorSystemGroup so BuildPreviewSystem's UpdateAfter resolves within the same group.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class HexHoverSystem : SystemBase
    {
        const float HexSize = 0.25f;

        Entity _overlayEntity;
        bool _overlayCreated;
        int2 _lastHex;

        static World _cachedWorld;

        static World ResolveGameplayWorld()
        {
            if (_cachedWorld != null && _cachedWorld.IsCreated) return _cachedWorld;
            _cachedWorld = null;
            foreach (var w in World.All)
            {
                if (!w.IsCreated) continue;
                using var q = w.EntityManager.CreateEntityQuery(ComponentType.ReadWrite<HexDBSingleton>());
                if ((w.Flags & WorldFlags.GameServer) != 0) continue;
                if (q.CalculateEntityCount() == 0) continue;
                _cachedWorld = w;
                break;
            }
            if (_cachedWorld == null) _cachedWorld = World.DefaultGameObjectInjectionWorld;
            return _cachedWorld;
        }

        /// <summary>Hex coord → entity lookup.</summary>
        public static bool TryGetHexEntity(int2 coord, out Entity entity)
        {
            entity = default;
            return HexDB.TryGetEntity(ResolveGameplayWorld(), coord, out entity);
        }

        /// <summary>Enqueues an Add request to the gameplay world's HexDB.</summary>
        public static void AddHex(int2 coord, Entity entity) =>
            HexDB.EnqueueAdd(ResolveGameplayWorld(), coord, entity);

        /// <summary>Enqueues a Remove request to the gameplay world's HexDB.</summary>
        public static void RemoveHex(int2 coord) =>
            HexDB.EnqueueRemove(ResolveGameplayWorld(), coord);

        protected override void OnCreate()
        {
            RequireForUpdate<MouseState>();
            RequireForUpdate<HexDBSingleton>();
            _lastHex = new int2(int.MinValue, int.MinValue);
            _cachedWorld = World;
        }

        protected override void OnUpdate()
        {
            var db = SystemAPI.GetSingleton<HexDBSingleton>();
            if (!db.Lookup.IsCreated) return;
            db.DrainHandle.Complete();

            // Create overlay entity once
            if (!_overlayCreated)
            {
                CreateOverlay();
                if (!_overlayCreated) return;
            }

            var mouse = SystemAPI.GetSingleton<MouseState>();

            if (mouse.LeftReleasedThisFrame && !mouse.OverUI && !mouse.DragEndedThisFrame)
            {
                // HexDBSingleton.Lookup is populated by HexDomainSystem's
                // Burst drain job. Exists guards against cross-world entity
                // handles in case NetCode or another world runs its own
                // spawn pass.
                bool clickIsLand = db.Lookup.TryGetValue(mouse.HexCoord, out Entity clickedEntity)
                                   && EntityManager.Exists(clickedEntity);
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
            bool isLand = db.Lookup.TryGetValue(mouse.HexCoord, out Entity hexEntity)
                          && EntityManager.Exists(hexEntity);
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
}

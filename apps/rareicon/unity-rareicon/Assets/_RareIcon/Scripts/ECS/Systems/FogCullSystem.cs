using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Hides non-Player units + buildings standing on hex tiles whose <see cref="FogVisibility"/> is unexplored. Player-faction entities always render — losing sight of your own army would be confusing. Cadence-gated to <see cref="ScanIntervalSeconds"/> so we don't pay the per-tick lookup; vision-radius reveals propagate to the next scan within half a second. Toggles <see cref="DisableRendering"/> via ECB so structural changes batch at the end of the frame.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(FogBakeSystem))]
    public partial class FogCullSystem : SystemBase
    {
        const float ScanIntervalSeconds = 0.5f;

        float _accum;

        protected override void OnCreate()
        {
            RequireForUpdate<HexDBSingleton>();
            RequireForUpdate<FogVisibility>();
        }

        protected override void OnUpdate()
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < ScanIntervalSeconds) return;
            _accum = 0f;

            var hexLookup = SystemAPI.GetSingleton<HexDBSingleton>().Lookup;
            var fogLookup = SystemAPI.GetComponentLookup<FogVisibility>(true);
            var disabledLookup = SystemAPI.GetComponentLookup<DisableRendering>(true);

            const float HexSize = 0.25f;

            var toHide   = new NativeList<Entity>(64, Allocator.Temp);
            var toReveal = new NativeList<Entity>(64, Allocator.Temp);

            foreach (var (transformRO, factionRO, entity) in
                     SystemAPI.Query<RefRO<LocalTransform>, RefRO<Faction>>()
                              .WithAll<Unit>().WithEntityAccess())
            {
                if (factionRO.ValueRO.Value == FactionType.Player) continue;
                int2 hex = HexMeshUtil.WorldToHex(
                    transformRO.ValueRO.Position.x,
                    transformRO.ValueRO.Position.y,
                    HexSize);
                ClassifyEntity(hex, entity, hexLookup, fogLookup, disabledLookup,
                               toHide, toReveal);
            }

            foreach (var (buildingRO, entity) in
                     SystemAPI.Query<RefRO<Building>>().WithEntityAccess())
            {
                if (buildingRO.ValueRO.OwnerFaction == FactionType.Player) continue;
                ClassifyEntity(buildingRO.ValueRO.RootHex, entity,
                               hexLookup, fogLookup, disabledLookup,
                               toHide, toReveal);
            }

            var em = EntityManager;
            for (int i = 0; i < toHide.Length; i++)
                em.AddComponent<DisableRendering>(toHide[i]);
            for (int i = 0; i < toReveal.Length; i++)
                em.RemoveComponent<DisableRendering>(toReveal[i]);

            toHide.Dispose();
            toReveal.Dispose();
        }

        static void ClassifyEntity(int2 hex, Entity entity,
                                   NativeHashMap<int2, Entity> hexLookup,
                                   ComponentLookup<FogVisibility> fogLookup,
                                   ComponentLookup<DisableRendering> disabledLookup,
                                   NativeList<Entity> toHide,
                                   NativeList<Entity> toReveal)
        {
            bool fogged = false;
            if (hexLookup.TryGetValue(hex, out var hexEntity)
                && fogLookup.HasComponent(hexEntity))
            {
                fogged = fogLookup[hexEntity].Value >= 1.5f;
            }

            bool currentlyDisabled = disabledLookup.HasComponent(entity);
            if (fogged && !currentlyDisabled) toHide.Add(entity);
            else if (!fogged && currentlyDisabled) toReveal.Add(entity);
        }
    }
}

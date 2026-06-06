using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Hides non-Player units + buildings standing on hex tiles whose <see cref="FogVisibility"/> is unexplored. Player-faction entities always render — losing sight of your own army would be confusing. Cadence-gated to <see cref="ScanIntervalSeconds"/> so we don't pay the per-tick lookup; vision-radius reveals propagate to the next scan within half a second. Toggles <see cref="DisableRendering"/> via EndSimulationEntityCommandBuffer ParallelWriter so structural changes batch at the end of the frame. Unit + Building classification scans now run as parallel [BurstCompile] IJobEntity passes — the prior main-thread foreach over Faction × LocalTransform + Building hit ~100k entities every half-second.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(FogBakeSystem))]
    public partial struct FogCullSystem : ISystem
    {
        const float ScanIntervalSeconds = 0.5f;
        const float HexSize             = 0.25f;

        float _accum;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<HexDBSingleton>();
            state.RequireForUpdate<FogVisibility>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < ScanIntervalSeconds) return;
            _accum = 0f;

            var hexDb = SystemAPI.GetSingleton<HexDBSingleton>();

            state.Dependency = JobHandle.CombineDependencies(state.Dependency, hexDb.DrainHandle);

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);
            var pw  = ecb.AsParallelWriter();

            var fogLookup      = SystemAPI.GetComponentLookup<FogVisibility>(true);
            var disabledLookup = SystemAPI.GetComponentLookup<DisableRendering>(true);

            var unitHandle = new ClassifyFogUnitsJob
            {
                HexLookup      = hexDb.Lookup,
                FogLookup      = fogLookup,
                DisabledLookup = disabledLookup,
                Ecb            = pw,
            }.ScheduleParallel(state.Dependency);

            var buildingHandle = new ClassifyFogBuildingsJob
            {
                HexLookup      = hexDb.Lookup,
                FogLookup      = fogLookup,
                DisabledLookup = disabledLookup,
                Ecb            = pw,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = JobHandle.CombineDependencies(unitHandle, buildingHandle);
        }

        [BurstCompile]
        public static void ClassifyHex(
            int2 hex,
            int  sortKey,
            Entity entity,
            in NativeHashMap<int2, Entity>      hexLookup,
            in ComponentLookup<FogVisibility>   fogLookup,
            in ComponentLookup<DisableRendering> disabledLookup,
            ref EntityCommandBuffer.ParallelWriter ecb)
        {
            bool fogged = false;
            if (hexLookup.TryGetValue(hex, out var hexEntity)
                && fogLookup.HasComponent(hexEntity))
            {
                fogged = fogLookup[hexEntity].Value > 0.5f;
            }

            bool currentlyDisabled = disabledLookup.HasComponent(entity);
            if (fogged && !currentlyDisabled)       ecb.AddComponent<DisableRendering>(sortKey, entity);
            else if (!fogged && currentlyDisabled)  ecb.RemoveComponent<DisableRendering>(sortKey, entity);
        }
    }

    [BurstCompile]
    [WithAll(typeof(Unit))]
    public partial struct ClassifyFogUnitsJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity>      HexLookup;
        [ReadOnly] public ComponentLookup<FogVisibility>   FogLookup;
        [ReadOnly] public ComponentLookup<DisableRendering> DisabledLookup;
        public EntityCommandBuffer.ParallelWriter           Ecb;

        void Execute([ChunkIndexInQuery] int chunkIndex, Entity entity, in LocalTransform t, in Faction f)
        {
            if (f.Value == FactionType.Player) return;
            int2 hex = HexMeshUtil.WorldToHex(t.Position.x, t.Position.y, 0.25f);
            FogCullSystem.ClassifyHex(hex, chunkIndex, entity, HexLookup, FogLookup, DisabledLookup, ref Ecb);
        }
    }

    [BurstCompile]
    public partial struct ClassifyFogBuildingsJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity>      HexLookup;
        [ReadOnly] public ComponentLookup<FogVisibility>   FogLookup;
        [ReadOnly] public ComponentLookup<DisableRendering> DisabledLookup;
        public EntityCommandBuffer.ParallelWriter           Ecb;

        void Execute([ChunkIndexInQuery] int chunkIndex, Entity entity, in Building b)
        {
            if (b.OwnerFaction == FactionType.Player) return;
            FogCullSystem.ClassifyHex(b.RootHex, chunkIndex, entity, HexLookup, FogLookup, DisabledLookup, ref Ecb);
        }
    }
}

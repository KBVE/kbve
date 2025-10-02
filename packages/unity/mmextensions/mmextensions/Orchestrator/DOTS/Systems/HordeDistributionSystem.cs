using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using KBVE.MMExtensions.Orchestrator.DOTS;

/// DOTS v2 - PREPARING

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{

    [BurstCompile]
    public partial struct HordeDistributionSystem : ISystem
    {
        [BurstCompile]
        private struct DistributeJob : IJob
        {
            [ReadOnly] public NativeList<Entity> HordeEntities;
            [ReadOnly] public NativeList<RequireMinion> RequireMinionData;
            [ReadOnly] public NativeList<Entity> MinionEntities;
            public EntityCommandBuffer ECB;
            public BufferLookup<MinionLink> MinionLink_BFE;
            [WriteOnly] public ComponentLookup<RequireMinion> RequireMinion_CDFE_WO;

            public void Execute()
            {
                if (MinionEntities.Length == 0 || HordeEntities.Length == 0)
                    return;

                var minionIndex = 0;
                var prevHordeIndex = -1;
                var hordeIndex = 0;
                DynamicBuffer<MinionLink> minionLinkBuffer = default;

                while (minionIndex < MinionEntities.Length && hordeIndex < HordeEntities.Length)
                {
                    if (hordeIndex != prevHordeIndex)
                    {
                        minionLinkBuffer = MinionLink_BFE[HordeEntities[hordeIndex]];
                        prevHordeIndex = hordeIndex;
                    }
                    var requireMinion = RequireMinionData[hordeIndex];
                    var distributionCount = math.min(MinionEntities.Length - minionIndex, requireMinion.count);
                    minionLinkBuffer.Capacity += distributionCount;

                    for (int i = minionIndex; i < distributionCount; i++)
                    {
                        var minionEntity = MinionEntities[i];
                        _ = minionLinkBuffer.Add(new MinionLink { entity = minionEntity });
                        ECB.AddComponent<InHordeMinionTag>(minionEntity);
                    }

                    minionIndex += distributionCount;

                    requireMinion.count -= distributionCount;
                    // means horde is full so we can just remove comp
                    if (requireMinion.count == 0)
                        ECB.RemoveComponent<RequireMinion>(HordeEntities[hordeIndex++]);
                    // means horde isn't full AND there is no more minions so we should update comp
                    else if (minionIndex >= MinionEntities.Length)
                        RequireMinion_CDFE_WO[HordeEntities[hordeIndex]] = requireMinion;
                }
            }
        }

        private struct SystemData : IComponentData
        {
            public EntityQuery MinionLessHordeQuery;
            public EntityQuery FreeMinionsQuery;
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            var systemData = new SystemData();

            var queryBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<RequireMinion>();
            systemData.MinionLessHordeQuery = state.GetEntityQuery(queryBuilder);

            queryBuilder.Reset();
            _ = queryBuilder
                .WithAll<MinionTag>()
                .WithNone<InHordeMinionTag>();
            systemData.FreeMinionsQuery = state.GetEntityQuery(queryBuilder);

            _ = state.EntityManager.AddComponentData(state.SystemHandle, systemData);

            queryBuilder.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var systemData = SystemAPI.GetComponent<SystemData>(state.SystemHandle);
            var hordeEntities = systemData.MinionLessHordeQuery.ToEntityListAsync(Allocator.TempJob, out var hordeEntitiesGatherHandle);
            var requireMinionData = systemData.MinionLessHordeQuery.ToComponentDataListAsync<RequireMinion>(Allocator.TempJob, state.Dependency, out var requireMinion_GatherHandle);
            var minionEntities = systemData.FreeMinionsQuery.ToEntityListAsync(Allocator.TempJob, out var minionEntitiesGatherHandle);
            var distributeJob = new DistributeJob
            {
                HordeEntities = hordeEntities,
                RequireMinionData = requireMinionData,
                MinionEntities = minionEntities,
                ECB = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>().CreateCommandBuffer(state.WorldUnmanaged),
                MinionLink_BFE = SystemAPI.GetBufferLookup<MinionLink>(false),
                RequireMinion_CDFE_WO = SystemAPI.GetComponentLookup<RequireMinion>(false)
            };

            var inputHandles = new NativeArray<JobHandle>(4, Allocator.Temp);
            inputHandles[0] = hordeEntitiesGatherHandle;
            inputHandles[1] = requireMinion_GatherHandle;
            inputHandles[2] = minionEntitiesGatherHandle;
            inputHandles[3] = state.Dependency;

            state.Dependency = distributeJob.ScheduleByRef(JobHandle.CombineDependencies(inputHandles));
            _ = hordeEntities.Dispose(state.Dependency);
            _ = requireMinionData.Dispose(state.Dependency);
            _ = minionEntities.Dispose(state.Dependency);
        }
    }
}

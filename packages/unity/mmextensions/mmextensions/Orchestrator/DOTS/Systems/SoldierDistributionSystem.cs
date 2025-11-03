using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    [BurstCompile]
    public partial struct SoldierDistributionSystem : ISystem
    {
        [BurstCompile]
        private struct DistributeJob : IJob
        {
            [ReadOnly] public NativeList<Entity> SquadEntities;
            [ReadOnly] public NativeList<RequireSoldier> RequireSoldierData;
            [ReadOnly] public NativeList<Entity> SoldierEntities;
            public EntityCommandBuffer ECB;
            public BufferLookup<SoldierLink> SoldierLink_BFE;
            [WriteOnly] public ComponentLookup<RequireSoldier> RequireSoldier_CDFE_WO;

            public void Execute()
            {
                if (SoldierEntities.Length == 0 || SquadEntities.Length == 0)
                    return;

                var soldierIndex = 0;
                var prevSquadIndex = -1;
                var squadIndex = 0;
                DynamicBuffer<SoldierLink> soldierLinkBuffer = default;

                while (soldierIndex < SoldierEntities.Length && squadIndex < SquadEntities.Length)
                {
                    if (squadIndex != prevSquadIndex)
                    {
                        soldierLinkBuffer = SoldierLink_BFE[SquadEntities[squadIndex]];
                        prevSquadIndex = squadIndex;
                    }
                    var requireSoldier = RequireSoldierData[squadIndex];
                    var distributionCount = math.min(SoldierEntities.Length - soldierIndex, requireSoldier.count);

                    // Use EnsureCapacity instead of Capacity += for efficient buffer allocation
                    var neededCapacity = soldierLinkBuffer.Length + distributionCount;
                    if (soldierLinkBuffer.Capacity < neededCapacity)
                        soldierLinkBuffer.EnsureCapacity(neededCapacity);

                    for (int i = soldierIndex; i < soldierIndex + distributionCount; i++)
                    {
                        var soldierEntity = SoldierEntities[i];
                        _ = soldierLinkBuffer.Add(new SoldierLink { entity = soldierEntity });
                        ECB.AddComponent<InSquadSoldierTag>(soldierEntity);
                    }

                    soldierIndex += distributionCount;

                    requireSoldier.count -= distributionCount;
                    // means squad is full so we can just remove comp
                    if (requireSoldier.count == 0)
                        ECB.RemoveComponent<RequireSoldier>(SquadEntities[squadIndex++]);
                    // means squad isn't full AND there is no more soldiers so we should update comp
                    else if (soldierIndex >= SoldierEntities.Length)
                        RequireSoldier_CDFE_WO[SquadEntities[squadIndex]] = requireSoldier;
                }
            }
        }

        private struct SystemData : IComponentData
        {
            public EntityQuery SoldierLessSquadQuery;
            public EntityQuery FreeSoldiersQuery;
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            var systemData = new SystemData();

            var queryBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<RequireSoldier>();
            systemData.SoldierLessSquadQuery = state.GetEntityQuery(queryBuilder);

            queryBuilder.Reset();
            _ = queryBuilder
                .WithAll<SoldierTag>()
                .WithNone<InSquadSoldierTag>();
            systemData.FreeSoldiersQuery = state.GetEntityQuery(queryBuilder);

            _ = state.EntityManager.AddComponentData(state.SystemHandle, systemData);

            queryBuilder.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var systemData = SystemAPI.GetComponent<SystemData>(state.SystemHandle);

            // Early exit if no work to do - avoids expensive ECB operations
            if (systemData.SoldierLessSquadQuery.IsEmpty || systemData.FreeSoldiersQuery.IsEmpty)
            {
                return;
            }

            var squadEntities = systemData.SoldierLessSquadQuery.ToEntityListAsync(Allocator.TempJob, out var squadEntitiesGatherHandle);
            var requireSoldierData = systemData.SoldierLessSquadQuery.ToComponentDataListAsync<RequireSoldier>(Allocator.TempJob, state.Dependency, out var requireSoldier_GatherHandle);
            var soldierEntities = systemData.FreeSoldiersQuery.ToEntityListAsync(Allocator.TempJob, out var soldierEntitiesGatherHandle);
            var distributeJob = new DistributeJob
            {
                SquadEntities = squadEntities,
                RequireSoldierData = requireSoldierData,
                SoldierEntities = soldierEntities,
                // Use BeginSimulation ECB instead of EndSimulation to avoid blocking
                // Commands will play back at the start of next frame, spreading cost
                ECB = SystemAPI.GetSingleton<BeginSimulationEntityCommandBufferSystem.Singleton>().CreateCommandBuffer(state.WorldUnmanaged),
                SoldierLink_BFE = SystemAPI.GetBufferLookup<SoldierLink>(false),
                RequireSoldier_CDFE_WO = SystemAPI.GetComponentLookup<RequireSoldier>(false)
            };

            var inputHandles = new NativeArray<JobHandle>(4, Allocator.Temp);
            inputHandles[0] = squadEntitiesGatherHandle;
            inputHandles[1] = requireSoldier_GatherHandle;
            inputHandles[2] = soldierEntitiesGatherHandle;
            inputHandles[3] = state.Dependency;

            state.Dependency = distributeJob.ScheduleByRef(JobHandle.CombineDependencies(inputHandles));

            // Note: We don't manually call AddJobHandleForProducer in Burst-compiled systems.
            // The ECB system automatically tracks dependencies through the EntityCommandBuffer
            // that was created from the singleton. The job writes to the ECB, and when the
            // BeginSimulationEntityCommandBufferSystem runs, it will properly wait for our job.

            _ = squadEntities.Dispose(state.Dependency);
            _ = requireSoldierData.Dispose(state.Dependency);
            _ = soldierEntities.Dispose(state.Dependency);
        }
    }
}
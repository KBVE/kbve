using NSprites;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Transforms;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    [BurstCompile]
    public partial struct FactorySystem : ISystem
    {
        [BurstCompile]
        private partial struct ProductionJob : IJobEntity
        {
            public float DeltaTime;
            public long TimestampMs;
            public uint RandomSeed;
            public EntityCommandBuffer.ParallelWriter ECB;

            private void Execute([ChunkIndexInQuery] int chunkIndex, ref FactoryTimer timer, in FactoryData factoryData)
            {
                timer.value -= DeltaTime;

                if (timer.value <= 0)
                {
                    timer.value += factoryData.duration;
                    var instanceEntities = new NativeArray<Entity>(factoryData.count, Allocator.Temp);
                    ECB.Instantiate(chunkIndex, factoryData.prefab, instanceEntities);

                    for (int i = 0; i < instanceEntities.Length; i++)
                    {
                        var entity = instanceEntities[i];
                        var spawnPos = factoryData.instantiatePos.ToFloat3();

                        // Set transform position
                        ECB.SetComponent(chunkIndex, entity, LocalTransform.FromPosition(spawnPos));

                        // CRITICAL FIX: Generate unique Entity ULID for each spawned soldier
                        // This ensures each soldier instance has its own unique identifier
                        var entityComponent = new EntityComponent
                        {
                            Data = new EntityData
                            {
                                Ulid = Ulid.NewUlidAsBytesWithTimestamp(TimestampMs, RandomSeed + (uint)i), // Generate unique ULID for this soldier instance
                                Type = EntityType.Monster | EntityType.Unit | EntityType.NPC | EntityType.Interactable | EntityType.Enemy, // Soldiers are combatant entities
                                ActionFlags = EntityActionFlags.CanInteract | EntityActionFlags.CanAttack,
                                WorldPos = spawnPos
                            }
                        };
                        ECB.SetComponent(chunkIndex, entity, entityComponent);
                    }
                }
            }
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<EndSimulationEntityCommandBufferSystem.Singleton>();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var productionJob = new ProductionJob
            {
                DeltaTime = SystemAPI.Time.DeltaTime,
                TimestampMs = (long)(SystemAPI.Time.ElapsedTime * 1000.0), // Convert Unity time to milliseconds
                RandomSeed = (uint)(SystemAPI.Time.ElapsedTime * 1000000.0), // Use high-precision time as random seed
                ECB = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>().CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter()
            };
            state.Dependency = productionJob.ScheduleParallelByRef(state.Dependency);
        }
    }
}
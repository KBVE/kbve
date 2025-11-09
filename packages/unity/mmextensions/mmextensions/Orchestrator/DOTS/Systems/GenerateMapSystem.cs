using Unity.Burst;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Entities;
using Unity.Jobs;
using Unity.Jobs.LowLevel.Unsafe;
using Unity.Mathematics;
using Unity.Transforms;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    [BurstCompile]
    public partial struct GenerateMapSystem : ISystem
    {
        [BurstCompile]
        private struct GenerateMapJob : IJobParallelForBatch
        {
            public EntityCommandBuffer.ParallelWriter ECB;
            public float2x2 MapSize;
            public long TimestampMs;
            [ReadOnly] public NativeArray<Entity> Resources;
            [NativeDisableParallelForRestriction] public NativeArray<Random> PosRands;
            [NativeSetThreadIndex] private int _threadIndex;

            public void Execute(int startIndex, int count)
            {
                for (int i = startIndex; i < startIndex + count; i++)
                {
                    var rand = PosRands[_threadIndex];
                    var resourceEntity = ECB.Instantiate(i, Resources[rand.NextInt(0, Resources.Length)]);

                    // Generate random world position
                    var worldPos = rand.NextFloat2(MapSize.c0, MapSize.c1).ToFloat3();

                    // Add transform component (prefabs may not have LocalTransform)
                    ECB.AddComponent(i, resourceEntity, LocalTransform.FromPosition(worldPos));

                    // CRITICAL FIX: Generate unique Entity ULID for each instantiated resource
                    // This ensures each tree/resource instance has its own unique identifier
                    var entityComponent = new EntityComponent
                    {
                        Data = new EntityData
                        {
                            Ulid = Ulid.NewUlidAsBytesWithTimestamp(TimestampMs, rand.NextUInt()), // Generate unique ULID for this instance
                            Type = EntityType.Resource | EntityType.Interactable | EntityType.Neutral,
                            ActionFlags = EntityActionFlags.CanInteract,
                            WorldPos = worldPos
                        }
                    };
                    ECB.SetComponent(i, resourceEntity, entityComponent);

                    PosRands[_threadIndex] = rand;
                }
            }
        }
        
        private struct SystemData : IComponentData
        {
            public Random Rand;
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<BeginSimulationEntityCommandBufferSystem.Singleton>();
            _ = state.EntityManager.AddComponentData(state.SystemHandle, new SystemData { Rand = new Random(1u) });
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<MapSettings>(out var mapSettings))
                return;

            // Check if we have resources to spawn
            if (mapSettings.resourceCollectionLink == Entity.Null || mapSettings.resourceCount <= 0)
            {
                state.Enabled = false;
                return;
            }

            var systemData = SystemAPI.GetComponent<SystemData>(state.SystemHandle);
            var posRands = new NativeArray<Random>(JobsUtility.MaxJobThreadCount, Allocator.TempJob);
            for (int i = 0; i < posRands.Length; i++)
                posRands[i] = new Random(systemData.Rand.NextUInt());

            var generateMapJob = new GenerateMapJob
            {
                // Use BeginSimulation ECB to avoid blocking - map entities spawn at start of next frame
                ECB = SystemAPI.GetSingleton<BeginSimulationEntityCommandBufferSystem.Singleton>().CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter(),
                MapSize = mapSettings.size,
                TimestampMs = (long)(SystemAPI.Time.ElapsedTime * 1000.0), // Convert Unity time to milliseconds
                PosRands = posRands,
                Resources = state.EntityManager.GetBuffer<PrefabLink>(mapSettings.resourceCollectionLink).Reinterpret<Entity>().AsNativeArray()
            };
            state.Dependency = generateMapJob.ScheduleBatch(mapSettings.resourceCount, 32, state.Dependency);
            _ = posRands.Dispose(state.Dependency);

            SystemAPI.SetComponent(state.SystemHandle, systemData);

            state.Enabled = false;
        }
    }
}
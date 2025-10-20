using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Transforms;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// High-performance producer system that gathers entity data in parallel
    /// Uses change filters to only process modified entities for optimal performance
    /// Employs NativeStream for lock-free parallel data collection
    /// Works with existing EntityComponent and EntityBlitContainer infrastructure
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct EntityBlitProduceSystem : ISystem
    {
        private EntityQuery _sourceQuery;
        private ComponentTypeSet _requiredComponents;

        public void OnCreate(ref SystemState state)
        {
            // Define required components for entity caching
            _requiredComponents = new ComponentTypeSet(
                ComponentType.ReadOnly<EntityComponent>(),
                ComponentType.ReadOnly<LocalToWorld>()
            );

            // Create query for entities with all required components
            _sourceQuery = state.GetEntityQuery(
                ComponentType.ReadOnly<EntityComponent>(),
                ComponentType.ReadOnly<LocalToWorld>()
            );

            // Set change filters to only wake when data changes - critical for performance
            // Unity allows max 2 change filters - using LocalToWorld and EntityComponent
            // Note: Resource damage updates trigger EntityComponent changes via EntityDataPositionSyncSystem
            _sourceQuery.SetChangedVersionFilter(typeof(LocalToWorld));
            _sourceQuery.AddChangedVersionFilter(typeof(EntityComponent));
        }

        public void OnUpdate(ref SystemState state)
        {
            // Early exit if no changed entities
            if (_sourceQuery.IsEmptyIgnoreFilter)
            {
                // Store a default completed job handle so drain system doesn't wait on stale data
                if (SystemAPI.HasSingleton<EntityFrameCacheTag>())
                {
                    var entity = SystemAPI.GetSingletonEntity<EntityFrameCacheTag>();
                    var emptyHandle = new EntityCacheJobHandle { ProducerJobHandle = default };
                    state.EntityManager.SetComponentData(entity, emptyHandle);
                }
                return;
            }

            // Check if cache singleton exists - if not, skip this frame
            if (!SystemAPI.HasSingleton<EntityFrameCacheTag>())
                return;

            // Get archetype chunks for parallel processing
            var chunks = _sourceQuery.ToArchetypeChunkArray(Allocator.TempJob);

            // Get component type handles for reading data
            var entityTypeHandle = state.GetComponentTypeHandle<EntityComponent>(true);
            var l2wTypeHandle = state.GetComponentTypeHandle<LocalToWorld>(true);

            // Create parallel stream for lock-free data gathering
            var stream = new NativeStream(chunks.Length, state.WorldUpdateAllocator);

            // Schedule parallel gather job
            var gatherJob = new GatherEntityDataJob
            {
                Chunks = chunks,
                EntityTypeHandle = entityTypeHandle,
                L2WTypeHandle = l2wTypeHandle,
                OutStream = stream.AsWriter()
            };
            var gatherDependency = gatherJob.Schedule(chunks.Length, state.Dependency);

            // Get cache singleton entity and buffer
            var cacheEntity = SystemAPI.GetSingletonEntity<EntityFrameCacheTag>();
            var cacheBuffer = state.EntityManager.GetBuffer<EntityBlitContainer>(cacheEntity);

            // Schedule merge job to consolidate stream data into cache buffer
            // This job must wait for the gather job to complete
            var mergeJob = new MergeStreamToCacheJob
            {
                InStream = stream.AsReader(),
                CacheBuffer = cacheBuffer
            };
            var mergeDependency = mergeJob.Schedule(gatherDependency);

            // Set the final dependency for other systems to wait on
            state.Dependency = mergeDependency;

            // Store the job handle in the singleton for the drain system to access
            var jobHandleComponent = new EntityCacheJobHandle { ProducerJobHandle = mergeDependency };
            state.EntityManager.SetComponentData(cacheEntity, jobHandleComponent);
        }

        /// <summary>
        /// Parallel job that gathers entity data from entity chunks
        /// Executes in parallel across multiple chunks for maximum throughput
        /// </summary>
        [BurstCompile]
        private struct GatherEntityDataJob : IJobFor
        {
            [ReadOnly] public NativeArray<ArchetypeChunk> Chunks;
            [ReadOnly] public ComponentTypeHandle<EntityComponent> EntityTypeHandle;
            [ReadOnly] public ComponentTypeHandle<LocalToWorld> L2WTypeHandle;

            public NativeStream.Writer OutStream;

            public void Execute(int chunkIndex)
            {
                var chunk = Chunks[chunkIndex];
                var entityComponents = chunk.GetNativeArray(ref EntityTypeHandle);
                var transforms = chunk.GetNativeArray(ref L2WTypeHandle);

                OutStream.BeginForEachIndex(chunkIndex);

                // Process each entity in the chunk
                for (int i = 0; i < chunk.Count; i++)
                {
                    // Create EntityBlitContainer using existing infrastructure
                    var blitContainer = new EntityBlitContainer
                    {
                        EntityData = entityComponents[i].Data,
                        // Type-specific data flags default to false
                        HasResource = false,
                        HasStructure = false,
                        HasCombatant = false,
                        HasItem = false,
                        HasPlayer = false
                    };

                    // TODO: Add logic to populate type-specific data based on additional components
                    // This could be extended to check for Resource, Structure, Combatant, etc. components
                    // and populate the corresponding data fields in the EntityBlitContainer

                    OutStream.Write(blitContainer);
                }

                OutStream.EndForEachIndex();
            }
        }

        /// <summary>
        /// Single-threaded merge job that consolidates stream data into the cache buffer
        /// Executes after all gather jobs complete
        /// </summary>
        [BurstCompile]
        private struct MergeStreamToCacheJob : IJob
        {
            public NativeStream.Reader InStream;
            public DynamicBuffer<EntityBlitContainer> CacheBuffer;

            public void Execute()
            {
                var totalCount = InStream.Count();
                if (totalCount == 0)
                    return;

                // Clear previous frame data and resize for new data
                CacheBuffer.Clear();
                CacheBuffer.ResizeUninitialized(totalCount);

                // Copy stream data directly to buffer for maximum performance
                int destinationIndex = 0;
                for (int forEachIndex = 0; forEachIndex < InStream.ForEachCount; forEachIndex++)
                {
                    InStream.BeginForEachIndex(forEachIndex);
                    while (InStream.RemainingItemCount > 0)
                    {
                        var blitContainer = InStream.Read<EntityBlitContainer>();
                        CacheBuffer[destinationIndex++] = blitContainer;
                    }
                    InStream.EndForEachIndex();
                }
            }
        }
    }
}
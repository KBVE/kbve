using Unity.Burst;
using Unity.Burst.Intrinsics;
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
        private double _nextUpdateTime;
        // PERFORMANCE FIX: Reduced from 30Hz to 2Hz
        // This cache is ONLY used for UI entity selection - 2Hz is more than enough!
        // At 20k entities: 30Hz = 600k cache writes/sec, 2Hz = 40k writes/sec (15x reduction!)
        private const double UpdateHz = 2.0;

        public void OnCreate(ref SystemState state)
        {
            // Define required components for entity caching
            _requiredComponents = new ComponentTypeSet(
                ComponentType.ReadOnly<EntityComponent>(),
                ComponentType.ReadOnly<LocalToWorld>()
            );

            // Create query for entities with all required components
            // Note: We don't require Resource/Combatant/etc. components - they are optional
            _sourceQuery = state.GetEntityQuery(
                ComponentType.ReadOnly<EntityComponent>(),
                ComponentType.ReadOnly<LocalToWorld>()
            );

            // OPTIMIZATION REMOVED: Change filters were causing static resources to disappear from cache
            // Systems like CombatantAttackResourceSystem need ALL entities in the cache, not just changed ones
            // TODO: Consider re-adding change filters with a separate "full snapshot" mode
            //_sourceQuery.SetChangedVersionFilter(typeof(LocalToWorld));
            //_sourceQuery.AddChangedVersionFilter(typeof(EntityComponent));
        }

        public void OnUpdate(ref SystemState state)
        {
            // Throttle updates to match drain system (30Hz)
            // This prevents wasted CPU cycles producing cache faster than it's consumed
            var now = SystemAPI.Time.ElapsedTime;
            if (now < _nextUpdateTime)
            {
                return; // Skip this frame - not time to update yet
            }
            _nextUpdateTime = now + (1.0 / UpdateHz);

            // Early exit if no entities match the query
            if (_sourceQuery.IsEmpty)
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

            // Get cache singleton entity BEFORE scheduling jobs
            var cacheEntity = SystemAPI.GetSingletonEntity<EntityFrameCacheTag>();

            // Calculate chunk count without materializing chunks (avoids JobHandle.Complete)
            var chunkCount = _sourceQuery.CalculateChunkCountWithoutFiltering();

            // Get component type handles for reading data
            var entityTypeHandle = state.GetComponentTypeHandle<EntityComponent>(true);
            var entityHandle = state.GetEntityTypeHandle(); // For Entity reference
            var l2wTypeHandle = state.GetComponentTypeHandle<LocalToWorld>(true);
            var resourceTypeHandle = state.GetComponentTypeHandle<Resource>(true);
            var combatantTypeHandle = state.GetComponentTypeHandle<Combatant>(true);

            // Create parallel stream for lock-free data gathering
            var stream = new NativeStream(chunkCount, Allocator.TempJob);

            // Schedule parallel gather job using IJobChunk instead of IJobFor
            // This avoids the ToArchetypeChunkArray() blocking call
            var gatherJob = new GatherEntityDataJobChunk
            {
                EntityTypeHandle = entityTypeHandle,
                EntityHandle = entityHandle,
                L2WTypeHandle = l2wTypeHandle,
                ResourceTypeHandle = resourceTypeHandle,
                CombatantTypeHandle = combatantTypeHandle,
                OutStream = stream.AsWriter()
            };
            var gatherDependency = gatherJob.ScheduleParallel(_sourceQuery, state.Dependency);

            // Get buffer accessor for async access
            var cacheBufferLookup = state.GetBufferLookup<EntityBlitContainer>(false);

            // Schedule merge job to consolidate stream data into cache buffer
            // This job must wait for the gather job to complete
            var mergeJob = new MergeStreamToCacheJob
            {
                InStream = stream.AsReader(),
                CacheBufferLookup = cacheBufferLookup,
                CacheEntity = cacheEntity
            };
            var mergeDependency = mergeJob.Schedule(gatherDependency);

            // Dispose stream after merge completes
            state.Dependency = stream.Dispose(mergeDependency);

            // Store the job handle in the singleton for the drain system to access
            var jobHandleComponent = new EntityCacheJobHandle { ProducerJobHandle = state.Dependency };
            state.EntityManager.SetComponentData(cacheEntity, jobHandleComponent);
        }

        /// <summary>
        /// Parallel job that gathers entity data from entity chunks
        /// Executes in parallel across multiple chunks for maximum throughput
        /// Uses IJobChunk to avoid ToArchetypeChunkArray blocking call
        /// Populates type-specific component data (Resource, Combatant, etc.)
        /// </summary>
        [BurstCompile]
        private struct GatherEntityDataJobChunk : IJobChunk
        {
            [ReadOnly] public ComponentTypeHandle<EntityComponent> EntityTypeHandle;
            [ReadOnly] public EntityTypeHandle EntityHandle;
            [ReadOnly] public ComponentTypeHandle<LocalToWorld> L2WTypeHandle;
            [ReadOnly] public ComponentTypeHandle<Resource> ResourceTypeHandle;
            [ReadOnly] public ComponentTypeHandle<Combatant> CombatantTypeHandle;

            public NativeStream.Writer OutStream;

            public void Execute(in ArchetypeChunk chunk, int unfilteredChunkIndex, bool useEnabledMask, in Unity.Burst.Intrinsics.v128 chunkEnabledMask)
            {
                var entityComponents = chunk.GetNativeArray(ref EntityTypeHandle);
                var entities = chunk.GetNativeArray(EntityHandle);
                var transforms = chunk.GetNativeArray(ref L2WTypeHandle);

                // Check what components this chunk has
                bool hasResource = chunk.Has(ref ResourceTypeHandle);
                bool hasCombatant = chunk.Has(ref CombatantTypeHandle);

                OutStream.BeginForEachIndex(unfilteredChunkIndex);

                // Process each entity in the chunk
                for (int i = 0; i < chunk.Count; i++)
                {
                    // Create EntityBlitContainer with base entity data
                    var blitContainer = new EntityBlitContainer
                    {
                        EntityReference = entities[i], // Store entity for O(1) cache lookups
                        EntityData = entityComponents[i].Data,
                        // Initialize all flags to false
                        HasResource = false,
                        HasStructure = false,
                        HasCombatant = false,
                        HasItem = false,
                        HasPlayer = false
                    };

                    // Populate type-specific data if components exist
                    if (hasResource)
                    {
                        var resourceArray = chunk.GetNativeArray(ref ResourceTypeHandle);
                        blitContainer.HasResource = true;
                        blitContainer.Resource = resourceArray[i].Data;
                    }

                    if (hasCombatant)
                    {
                        var combatantArray = chunk.GetNativeArray(ref CombatantTypeHandle);
                        blitContainer.HasCombatant = true;
                        blitContainer.Combatant = combatantArray[i].Data;
                    }

                    // TODO: Add Structure, Item, Player component population as needed

                    OutStream.Write(blitContainer);
                }

                OutStream.EndForEachIndex();
            }
        }

        /// <summary>
        /// Single-threaded merge job that consolidates stream data into the cache buffer
        /// Executes after all gather jobs complete
        /// Uses BufferLookup for async buffer access
        /// </summary>
        [BurstCompile]
        private struct MergeStreamToCacheJob : IJob
        {
            public NativeStream.Reader InStream;
            public BufferLookup<EntityBlitContainer> CacheBufferLookup;
            public Entity CacheEntity;

            public void Execute()
            {
                var totalCount = InStream.Count();
                if (totalCount == 0)
                    return;

                // Get buffer via lookup for async access
                var cacheBuffer = CacheBufferLookup[CacheEntity];

                // Clear previous frame data and resize for new data
                cacheBuffer.Clear();
                cacheBuffer.ResizeUninitialized(totalCount);

                // Copy stream data directly to buffer for maximum performance
                int destinationIndex = 0;
                for (int forEachIndex = 0; forEachIndex < InStream.ForEachCount; forEachIndex++)
                {
                    InStream.BeginForEachIndex(forEachIndex);
                    while (InStream.RemainingItemCount > 0)
                    {
                        var blitContainer = InStream.Read<EntityBlitContainer>();
                        cacheBuffer[destinationIndex++] = blitContainer;
                    }
                    InStream.EndForEachIndex();
                }
            }
        }
    }
}
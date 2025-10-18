using System.Runtime.CompilerServices;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Burst;
using Unity.Collections;
using Unity.Jobs;
using UnityEngine;
using KBVE.MMExtensions.Orchestrator.DOTS;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;
using KBVE.MMExtensions.Orchestrator.DOTS.Systems.Cache;
using Cysharp.Threading.Tasks;
using System.Threading;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(EntityHoverSelectSystem))]
    [UpdateAfter(typeof(EntitySpatialSystem))]
    [UpdateAfter(typeof(EntityCache))]
    public partial struct EntityToVmDrainSystem : ISystem
    {
        // Component lookups for all entity types
        private ComponentLookup<EntityTypeComponent> _typeLookup;
        private ComponentLookup<Resource> _resourceLookup;
        private ComponentLookup<ResourceID> _resourceIdLookup;
        private ComponentLookup<Structure> _structureLookup;
        private ComponentLookup<StructureID> _structureIdLookup;
        private ComponentLookup<LocalToWorld> _l2wLookup;

        // Blit component lookups for data transfer
        private ComponentLookup<EntityComponent> _entityLookup;
        private ComponentLookup<Combatant> _combatantLookup;
        private ComponentLookup<Item> _itemLookup;
        private ComponentLookup<Player> _playerLookup;

        // Native containers for Burst-managed data transfer
        private NativeReference<EntityBlitContainer> _blitContainer;
        private NativeReference<bool> _hasValidData;
        private NativeReference<Entity> _selectedEntityRef;

        // Hot swap will be handled via spatial queries after job completion

        // Debug info
        private NativeReference<int> _debugCode;

        // Selection change detection to avoid unnecessary processing
        private Entity _lastProcessedEntity;
        private bool _needsUpdate;

        // UniTask-based async job tracking
        private Unity.Jobs.JobHandle _pendingJobHandle;
        private bool _hasActivePendingJob;

        public void OnCreate(ref SystemState state)
        {
            _entityLookup = state.GetComponentLookup<EntityComponent>(true);
            _resourceLookup = state.GetComponentLookup<Resource>(true);
            _structureLookup = state.GetComponentLookup<Structure>(true);
            _combatantLookup = state.GetComponentLookup<Combatant>(true);
            _itemLookup = state.GetComponentLookup<Item>(true);
            _playerLookup = state.GetComponentLookup<Player>(true);
            _l2wLookup = state.GetComponentLookup<LocalToWorld>(true);

            _blitContainer = new NativeReference<EntityBlitContainer>(Allocator.Persistent);
            _hasValidData = new NativeReference<bool>(Allocator.Persistent);
            _selectedEntityRef = new NativeReference<Entity>(Allocator.Persistent);
            _debugCode = new NativeReference<int>(Allocator.Persistent);


            _hasValidData.Value = false;
            _lastProcessedEntity = Entity.Null;
            _needsUpdate = false;
        }

        public void OnUpdate(ref SystemState state)
        {
            // Get selected entity from universal SelectedEntity singleton
            Entity selectedEntity = Entity.Null;
            if (SystemAPI.TryGetSingleton(out SelectedEntity sel))
            {
                selectedEntity = sel.Entity;
            }

            // Check if selection changed
            bool selectionChanged = selectedEntity != _lastProcessedEntity;

            // Handle null selection
            if (selectedEntity == Entity.Null)
            {
                // Always clear if we had a selection before (even if it was already null)
                if (_lastProcessedEntity != Entity.Null)
                {
                    _lastProcessedEntity = Entity.Null;
                    ClearViewModelAsync().Forget();
                }
                return;
            }

            // Always check cache for any selected entity (allows re-hovering same entity)
            if (EntityCache.Instance.TryGetCachedEntity(selectedEntity, out var cachedData))
            {
                // Cache hit! Update ViewModel immediately
                _lastProcessedEntity = selectedEntity;
                UpdateViewModelFromCache(cachedData);
                return;
            }

            // Check if previous job completed and handle results
            if (_hasActivePendingJob && _pendingJobHandle.IsCompleted)
            {
                _hasActivePendingJob = false;

                // Capture job results synchronously before going async
                var hasValidData = _hasValidData.Value;
                var blitContainer = _blitContainer.Value;
                var jobSelectedEntity = _selectedEntityRef.Value;

                ProcessJobResultsAsync(hasValidData, blitContainer, jobSelectedEntity).Forget();
            }

            // Only schedule new job if selection changed and no job is running
            if (selectionChanged && !_hasActivePendingJob)
            {
                // Update lookups only when we need to process
                _entityLookup.Update(ref state);
                _resourceLookup.Update(ref state);
                _structureLookup.Update(ref state);
                _combatantLookup.Update(ref state);
                _itemLookup.Update(ref state);
                _playerLookup.Update(ref state);
                _l2wLookup.Update(ref state);

                // Store in native container for job
                _selectedEntityRef.Value = selectedEntity;
                _lastProcessedEntity = selectedEntity;

                // Schedule simplified job for selected entity only
                var batchGatherJob = new BatchGatherEntityDataJob
                {
                    SelectedEntity = _selectedEntityRef,
                    EntityLookup = _entityLookup,
                    ResourceLookup = _resourceLookup,
                    StructureLookup = _structureLookup,
                    CombatantLookup = _combatantLookup,
                    ItemLookup = _itemLookup,
                    PlayerLookup = _playerLookup,
                    L2wLookup = _l2wLookup,
                    BlitOutput = _blitContainer,
                    HasValidOutput = _hasValidData,
                    DebugCode = _debugCode
                };

                _pendingJobHandle = batchGatherJob.Schedule(state.Dependency);
                _hasActivePendingJob = true;
                state.Dependency = _pendingJobHandle;
            }
        }

        /// <summary>
        /// Async helper to clear ViewModel when no entity is selected
        /// </summary>
        private async UniTaskVoid ClearViewModelAsync()
        {
            await UniTask.RunOnThreadPool(() =>
            {
                UpdateViewModelThreadSafeStatic(default, false);
            });
        }

        /// <summary>
        /// Fast direct gathering of entity data on main thread - more efficient than job scheduling for single entities
        /// </summary>
        private void GatherEntityDataDirect(Entity entity)
        {
            // Early validation
            if (entity == Entity.Null)
            {
                _debugCode.Value = 1;
                _hasValidData.Value = false;
                return;
            }

            if (!_entityLookup.HasComponent(entity))
            {
                _debugCode.Value = 2;
                _hasValidData.Value = false;
                return;
            }

            // Pre-check component existence with bitwise flags
            int componentFlags = 0;
            if (_resourceLookup.HasComponent(entity)) componentFlags |= 1;    // RESOURCE_FLAG
            if (_structureLookup.HasComponent(entity)) componentFlags |= 2;   // STRUCTURE_FLAG
            if (_combatantLookup.HasComponent(entity)) componentFlags |= 4;   // COMBATANT_FLAG
            if (_itemLookup.HasComponent(entity)) componentFlags |= 8;        // ITEM_FLAG
            if (_playerLookup.HasComponent(entity)) componentFlags |= 16;     // PLAYER_FLAG

            // Early exit if no type-specific components found
            if (componentFlags == 0)
            {
                _debugCode.Value = 15;
                _hasValidData.Value = false;
                return;
            }

            // Get base entity data and update world position
            var entityData = _entityLookup[entity].Data;
            if (_l2wLookup.HasComponent(entity))
            {
                entityData.WorldPos = _l2wLookup[entity].Position;
            }

            // Create container only after validation
            var container = new EntityBlitContainer { EntityData = entityData };

            // Populate type-specific data using flags (no redundant HasComponent calls)
            if ((componentFlags & 1) != 0) container.SetResource(_resourceLookup[entity].Data);
            if ((componentFlags & 2) != 0) container.SetStructure(_structureLookup[entity].Data);
            if ((componentFlags & 4) != 0) container.SetCombatant(_combatantLookup[entity].Data);
            if ((componentFlags & 8) != 0) container.SetItem(_itemLookup[entity].Data);
            if ((componentFlags & 16) != 0) container.SetPlayer(_playerLookup[entity].Data);

            // Success - encode component flags in debug code
            _blitContainer.Value = container;
            _hasValidData.Value = true;
            _debugCode.Value = 100 + componentFlags;
        }

        /// <summary>
        /// Update ViewModel directly from cache (synchronous for immediate response)
        /// </summary>
        private void UpdateViewModelFromCache(EntityBlitContainer cachedData)
        {
            if (EntityViewModel.Instance != null)
            {
                EntityViewModel.Instance.Current.Value = cachedData;
            }
        }

        /// <summary>
        /// Process job results using UniTask on ThreadPool
        /// </summary>
        private async UniTaskVoid ProcessJobResultsAsync(bool hasValidData, EntityBlitContainer blitContainer,
            Entity selectedEntity)
        {
            // Process job results off main thread
            await UniTask.RunOnThreadPool(() =>
            {
                ProcessJobResultsOffThread(hasValidData, blitContainer);
            });

            // Cache the primary result on main thread (if valid)
            if (hasValidData && selectedEntity != Entity.Null)
            {
                // Get position for spatial caching
                var position = _l2wLookup.HasComponent(selectedEntity)
                    ? _l2wLookup[selectedEntity].Position
                    : float3.zero;

                EntityCache.Instance.CacheEntity(selectedEntity, blitContainer, position);

                // Hot swap: Query nearby entities using spatial system and cache them
                // Temporarily disabled due to ComponentLookup invalidation issues in async context
                // ProcessNearbyEntitiesForHotSwap(selectedEntity, blitContainer);
            }
        }

        /// <summary>
        /// Use spatial queries to find and cache nearby entities for hot-swap performance
        /// </summary>
        private void ProcessNearbyEntitiesForHotSwap(Entity selectedEntity, EntityBlitContainer selectedContainer)
        {
            try
            {
                // Check if entity is still valid
                if (selectedEntity == Entity.Null)
                    return;

                // Get the selected entity's position for spatial query
                if (!_l2wLookup.TryGetComponent(selectedEntity, out var selectedTransform))
                    return;

                var selectedPosition = selectedTransform.Position.xy;

                // TODO: Query spatial system for nearby entities
                // This will be implemented when spatial system integration is ready
                // For now, we'll add a placeholder that can be easily replaced

                /*
                // Future implementation:
                var spatialSystem = World.GetExistingSystemManaged<EntitySpatialSystem>();
                if (spatialSystem == null || !spatialSystem.IsInitialized)
                    return;

                var quadTree = spatialSystem.GetQuadTree();
                var nearbyEntities = new NativeList<Entity>(Allocator.Temp);

                SpatialQueryUtilities.GetEntitiesInRadius(
                    quadTree,
                    selectedPosition,
                    HOT_SWAP_RADIUS,
                    nearbyEntities
                );

                // Process each nearby entity for caching
                foreach (var nearbyEntity in nearbyEntities)
                {
                    if (nearbyEntity != selectedEntity)
                    {
                        GatherEntityDataDirect(nearbyEntity);
                        if (_hasValidData.Value)
                        {
                            var nearbyPosition = _l2wLookup.HasComponent(nearbyEntity)
                            ? _l2wLookup[nearbyEntity].Position
                            : float3.zero;
                        EntityCache.Instance.CacheEntity(nearbyEntity, _blitContainer.Value, nearbyPosition);
                        }
                    }
                }

                nearbyEntities.Dispose();
                */
            }
            catch (System.Exception ex)
            {
                // Graceful degradation - don't crash if spatial query fails
                UnityEngine.Debug.LogWarning($"Hot-swap spatial query failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Process job results off-thread (called from ThreadPool)
        /// </summary>
        private static void ProcessJobResultsOffThread(bool hasValidData, EntityBlitContainer blitContainer)
        {
            // Update ViewModel based on job results
            // This is thread-safe because EntityViewModel uses SynchronizedReactiveProperty
            if (hasValidData)
            {
                UpdateViewModelThreadSafeStatic(blitContainer, true);
            }
            else
            {
                UpdateViewModelThreadSafeStatic(default, false);
            }
        }

        public void OnDestroy(ref SystemState state)
        {
            if (_blitContainer.IsCreated) _blitContainer.Dispose();
            if (_hasValidData.IsCreated) _hasValidData.Dispose();
            if (_selectedEntityRef.IsCreated) _selectedEntityRef.Dispose();
            if (_debugCode.IsCreated) _debugCode.Dispose();
            // EntityCache is managed by the EntityCache system - no manual disposal needed
        }

        /// <summary>
        /// Thread-safe ViewModel update using SynchronizedReactiveProperty (static version for ThreadPool)
        /// </summary>
        private static void UpdateViewModelThreadSafeStatic(EntityBlitContainer container, bool hasValidData)
        {
            if (EntityViewModel.Instance != null)
            {
                if (hasValidData)
                {
                    // Thread-safe update via SynchronizedReactiveProperty
                    EntityViewModel.Instance.Current.Value = container;
                }
                else
                {
                    // Create empty container with no valid data (all HasX flags false)
                    var emptyContainer = new EntityBlitContainer();
                    emptyContainer.Clear(); // Ensures all HasX flags are false
                    // Thread-safe update via SynchronizedReactiveProperty
                    EntityViewModel.Instance.Current.Value = emptyContainer;
                }
            }
        }

        /// <summary>
        /// Helper method to decode component flags into human-readable list
        /// </summary>
        private static string GetComponentList(int flags)
        {
            var components = new System.Collections.Generic.List<string>();
            if ((flags & 1) != 0) components.Add("Resource");    // RESOURCE_FLAG
            if ((flags & 2) != 0) components.Add("Structure");   // STRUCTURE_FLAG
            if ((flags & 4) != 0) components.Add("Combatant");   // COMBATANT_FLAG
            if ((flags & 8) != 0) components.Add("Item");        // ITEM_FLAG
            if ((flags & 16) != 0) components.Add("Player");     // PLAYER_FLAG
            return string.Join(", ", components);
        }

        /// <summary>
        /// Optimized Burst-compiled job that efficiently gathers entity data from ECS components.
        /// Uses bitwise flags for better performance and improved debug tracking.
        /// </summary>
        [BurstCompile]
        private struct GatherEntityDataJob : IJob
        {
            [ReadOnly] public NativeReference<Entity> SelectedEntity;
            [ReadOnly] public ComponentLookup<EntityComponent> EntityLookup;
            [ReadOnly] public ComponentLookup<Resource> ResourceLookup;
            [ReadOnly] public ComponentLookup<Structure> StructureLookup;
            [ReadOnly] public ComponentLookup<Combatant> CombatantLookup;
            [ReadOnly] public ComponentLookup<Item> ItemLookup;
            [ReadOnly] public ComponentLookup<Player> PlayerLookup;
            [ReadOnly] public ComponentLookup<LocalToWorld> L2wLookup;

            [WriteOnly] public NativeReference<EntityBlitContainer> BlitOutput;
            [WriteOnly] public NativeReference<bool> HasValidOutput;
            [WriteOnly] public NativeReference<int> DebugCode;

            // Component type flags for efficient debug tracking
            private const int RESOURCE_FLAG = 1 << 0;  // 1
            private const int STRUCTURE_FLAG = 1 << 1; // 2
            private const int COMBATANT_FLAG = 1 << 2; // 4
            private const int ITEM_FLAG = 1 << 3;      // 8
            private const int PLAYER_FLAG = 1 << 4;    // 16

            public void Execute()
            {
                var entity = SelectedEntity.Value;

                // Early validation with minimal cost
                if (entity == Entity.Null)
                {
                    SetFailure(1); // Entity is null
                    return;
                }

                if (!EntityLookup.HasComponent(entity))
                {
                    SetFailure(2); // Entity missing EntityComponent
                    return;
                }

                // Pre-check component existence with bitwise flags for better performance
                int componentFlags = 0;
                if (ResourceLookup.HasComponent(entity)) componentFlags |= RESOURCE_FLAG;
                if (StructureLookup.HasComponent(entity)) componentFlags |= STRUCTURE_FLAG;
                if (CombatantLookup.HasComponent(entity)) componentFlags |= COMBATANT_FLAG;
                if (ItemLookup.HasComponent(entity)) componentFlags |= ITEM_FLAG;
                if (PlayerLookup.HasComponent(entity)) componentFlags |= PLAYER_FLAG;

                // Early exit if no type-specific components found
                if (componentFlags == 0)
                {
                    SetFailure(15); // No type-specific components found
                    return;
                }

                // Get base entity data and update world position efficiently
                var entityData = EntityLookup[entity].Data;
                if (L2wLookup.HasComponent(entity))
                {
                    entityData.WorldPos = L2wLookup[entity].Position;
                }

                // Create container only after validation
                var container = new EntityBlitContainer { EntityData = entityData };

                // Populate type-specific data using flags (no redundant HasComponent calls)
                if ((componentFlags & RESOURCE_FLAG) != 0)
                {
                    container.SetResource(ResourceLookup[entity].Data);
                }

                if ((componentFlags & STRUCTURE_FLAG) != 0)
                {
                    container.SetStructure(StructureLookup[entity].Data);
                }

                if ((componentFlags & COMBATANT_FLAG) != 0)
                {
                    container.SetCombatant(CombatantLookup[entity].Data);
                }

                if ((componentFlags & ITEM_FLAG) != 0)
                {
                    container.SetItem(ItemLookup[entity].Data);
                }

                if ((componentFlags & PLAYER_FLAG) != 0)
                {
                    container.SetPlayer(PlayerLookup[entity].Data);
                }

                // Success - encode component flags in debug code for better tracking
                BlitOutput.Value = container;
                HasValidOutput.Value = true;
                DebugCode.Value = 100 + componentFlags; // 100+ = success with component flags
            }

            [MethodImpl(MethodImplOptions.AggressiveInlining)]
            private void SetFailure(int code)
            {
                DebugCode.Value = code;
                HasValidOutput.Value = false;
            }
        }

        /// <summary>
        /// Simplified Burst-compiled job that gathers only the selected entity data.
        /// Nearby entity caching will be handled by the system using spatial queries.
        /// </summary>
        [BurstCompile]
        private struct BatchGatherEntityDataJob : IJob
        {
            [ReadOnly] public NativeReference<Entity> SelectedEntity;
            [ReadOnly] public ComponentLookup<EntityComponent> EntityLookup;
            [ReadOnly] public ComponentLookup<Resource> ResourceLookup;
            [ReadOnly] public ComponentLookup<Structure> StructureLookup;
            [ReadOnly] public ComponentLookup<Combatant> CombatantLookup;
            [ReadOnly] public ComponentLookup<Item> ItemLookup;
            [ReadOnly] public ComponentLookup<Player> PlayerLookup;
            [ReadOnly] public ComponentLookup<LocalToWorld> L2wLookup;

            [WriteOnly] public NativeReference<EntityBlitContainer> BlitOutput;
            [WriteOnly] public NativeReference<bool> HasValidOutput;
            [WriteOnly] public NativeReference<int> DebugCode;

            // Component type flags for efficient debug tracking
            private const int RESOURCE_FLAG = 1 << 0;  // 1
            private const int STRUCTURE_FLAG = 1 << 1; // 2
            private const int COMBATANT_FLAG = 1 << 2; // 4
            private const int ITEM_FLAG = 1 << 3;      // 8
            private const int PLAYER_FLAG = 1 << 4;    // 16

            public void Execute()
            {
                var selectedEntity = SelectedEntity.Value;

                // Process the selected entity
                if (selectedEntity == Entity.Null || !EntityLookup.HasComponent(selectedEntity))
                {
                    SetFailure(selectedEntity == Entity.Null ? 1 : 2);
                    return;
                }

                // Process selected entity
                if (ProcessSingleEntity(selectedEntity, out var selectedContainer))
                {
                    BlitOutput.Value = selectedContainer;
                    HasValidOutput.Value = true;
                    DebugCode.Value = 100; // Success
                }
                else
                {
                    SetFailure(15);
                }
            }

            private bool ProcessSingleEntity(Entity entity, out EntityBlitContainer container)
            {
                container = default;

                if (!EntityLookup.HasComponent(entity))
                    return false;

                // Pre-check component existence with bitwise flags
                int componentFlags = 0;
                if (ResourceLookup.HasComponent(entity)) componentFlags |= RESOURCE_FLAG;
                if (StructureLookup.HasComponent(entity)) componentFlags |= STRUCTURE_FLAG;
                if (CombatantLookup.HasComponent(entity)) componentFlags |= COMBATANT_FLAG;
                if (ItemLookup.HasComponent(entity)) componentFlags |= ITEM_FLAG;
                if (PlayerLookup.HasComponent(entity)) componentFlags |= PLAYER_FLAG;

                // Early exit if no type-specific components found
                if (componentFlags == 0)
                    return false;

                // Get base entity data and update world position
                var entityData = EntityLookup[entity].Data;
                if (L2wLookup.HasComponent(entity))
                {
                    entityData.WorldPos = L2wLookup[entity].Position;
                }

                // Create container
                container = new EntityBlitContainer { EntityData = entityData };

                // Populate type-specific data using flags
                if ((componentFlags & RESOURCE_FLAG) != 0)
                    container.SetResource(ResourceLookup[entity].Data);
                if ((componentFlags & STRUCTURE_FLAG) != 0)
                    container.SetStructure(StructureLookup[entity].Data);
                if ((componentFlags & COMBATANT_FLAG) != 0)
                    container.SetCombatant(CombatantLookup[entity].Data);
                if ((componentFlags & ITEM_FLAG) != 0)
                    container.SetItem(ItemLookup[entity].Data);
                if ((componentFlags & PLAYER_FLAG) != 0)
                    container.SetPlayer(PlayerLookup[entity].Data);

                return true;
            }

            [MethodImpl(MethodImplOptions.AggressiveInlining)]
            private void SetFailure(int code)
            {
                DebugCode.Value = code;
                HasValidOutput.Value = false;
            }
        }
    }
}
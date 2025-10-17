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
using Cysharp.Threading.Tasks;
using System.Threading;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    /// <summary>
    /// Burst-compatible LRU cache entry for entity data
    /// </summary>
    public struct EntityCacheEntry
    {
        public Entity Entity;
        public EntityBlitContainer Data;
        public int AccessTime; // Frame-based timestamp for LRU
        public bool IsValid;
    }

    /// <summary>
    /// Burst-compatible LRU cache for EntityBlitContainer data
    /// </summary>
    public struct EntityLRUCache
    {
        private NativeArray<EntityCacheEntry> _entries;
        private int _capacity;
        private int _currentFrame;

        public EntityLRUCache(int capacity, Allocator allocator)
        {
            _capacity = capacity;
            _entries = new NativeArray<EntityCacheEntry>(capacity, allocator);
            _currentFrame = 0;

            // Initialize all entries as invalid
            for (int i = 0; i < capacity; i++)
            {
                _entries[i] = new EntityCacheEntry { IsValid = false, AccessTime = -1 };
            }
        }

        public void IncrementFrame() => _currentFrame++;

        public bool TryGet(Entity entity, out EntityBlitContainer data)
        {
            data = default;
            for (int i = 0; i < _capacity; i++)
            {
                var entry = _entries[i];
                if (entry.IsValid && entry.Entity == entity)
                {
                    // Update access time for LRU
                    entry.AccessTime = _currentFrame;
                    _entries[i] = entry;
                    data = entry.Data;
                    return true;
                }
            }
            return false;
        }

        public void Put(Entity entity, EntityBlitContainer data)
        {
            // First, try to find existing entry
            for (int i = 0; i < _capacity; i++)
            {
                var entry = _entries[i];
                if (entry.IsValid && entry.Entity == entity)
                {
                    // Update existing entry
                    _entries[i] = new EntityCacheEntry
                    {
                        Entity = entity,
                        Data = data,
                        AccessTime = _currentFrame,
                        IsValid = true
                    };
                    return;
                }
            }

            // Find least recently used slot
            int lruIndex = 0;
            int oldestTime = _currentFrame + 1;

            for (int i = 0; i < _capacity; i++)
            {
                var entry = _entries[i];
                if (!entry.IsValid)
                {
                    // Found empty slot
                    lruIndex = i;
                    break;
                }

                if (entry.AccessTime < oldestTime)
                {
                    oldestTime = entry.AccessTime;
                    lruIndex = i;
                }
            }

            // Insert new entry
            _entries[lruIndex] = new EntityCacheEntry
            {
                Entity = entity,
                Data = data,
                AccessTime = _currentFrame,
                IsValid = true
            };
        }

        public void Clear()
        {
            for (int i = 0; i < _capacity; i++)
            {
                var entry = _entries[i];
                entry.IsValid = false;
                _entries[i] = entry;
            }
        }

        public void Dispose()
        {
            if (_entries.IsCreated)
                _entries.Dispose();
        }

        public bool IsCreated => _entries.IsCreated;
    }
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    [UpdateAfter(typeof(KBVE.MMExtensions.Orchestrator.DOTS.EntityHoverSelectSystem))]
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

        // Batch processing containers for hot swap
        private NativeArray<Entity> _batchEntities;
        private NativeArray<EntityBlitContainer> _batchContainers;
        private NativeReference<int> _batchCount;
        private const int MAX_BATCH_SIZE = 32; // Process up to 32 entities per job

        // Debug info
        private NativeReference<int> _debugCode;

        // Selection change detection to avoid unnecessary processing
        private Entity _lastProcessedEntity;
        private bool _needsUpdate;

        // LRU cache for entity data with hot swap capability
        private EntityLRUCache _entityCache;
        private const int CACHE_SIZE = 128; // Cache up to 128 entities for large scenes
        private const float HOT_SWAP_RADIUS = 50f; // Radius for nearby entity caching

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

            // Initialize batch processing containers
            _batchEntities = new NativeArray<Entity>(MAX_BATCH_SIZE, Allocator.Persistent);
            _batchContainers = new NativeArray<EntityBlitContainer>(MAX_BATCH_SIZE, Allocator.Persistent);
            _batchCount = new NativeReference<int>(Allocator.Persistent);

            // Initialize LRU cache
            _entityCache = new EntityLRUCache(CACHE_SIZE, Allocator.Persistent);

            _hasValidData.Value = false;
            _lastProcessedEntity = Entity.Null;
            _needsUpdate = false;
        }

        public void OnUpdate(ref SystemState state)
        {
            // Increment frame counter for LRU
            _entityCache.IncrementFrame();

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
                // Only clear if we had a selection before
                if (_lastProcessedEntity != Entity.Null)
                {
                    _lastProcessedEntity = Entity.Null;
                    ClearViewModelAsync().Forget();
                }
                return;
            }

            // Check cache first if selection changed
            if (selectionChanged)
            {
                if (_entityCache.TryGet(selectedEntity, out var cachedData))
                {
                    // Cache hit! Update ViewModel immediately
                    _lastProcessedEntity = selectedEntity;
                    UpdateViewModelFromCache(cachedData);
                    return;
                }
            }

            // Check if previous job completed and handle results
            if (_hasActivePendingJob && _pendingJobHandle.IsCompleted)
            {
                _hasActivePendingJob = false;
                ProcessJobResultsAsync().Forget();
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

                // Schedule enhanced batch job for hot swap caching
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
                    DebugCode = _debugCode,
                    // Batch processing outputs
                    BatchEntities = _batchEntities,
                    BatchContainers = _batchContainers,
                    BatchCount = _batchCount,
                    HotSwapRadius = HOT_SWAP_RADIUS
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
        private async UniTaskVoid ProcessJobResultsAsync()
        {
            // Capture needed data (avoid struct lambda capture issues)
            var hasValidData = _hasValidData.Value;
            var blitContainer = _blitContainer.Value;
            var selectedEntity = _selectedEntityRef.Value;

            // Process job results off main thread
            await UniTask.RunOnThreadPool(() =>
            {
                ProcessJobResultsOffThread(hasValidData, blitContainer);
            });

            // Cache the primary result on main thread (if valid)
            if (hasValidData && selectedEntity != Entity.Null)
            {
                _entityCache.Put(selectedEntity, blitContainer);
            }

            // Hot swap: Cache batch results for nearby entities
            var batchCount = _batchCount.Value;
            for (int i = 0; i < batchCount; i++)
            {
                var entity = _batchEntities[i];
                var container = _batchContainers[i];
                if (entity != Entity.Null)
                {
                    _entityCache.Put(entity, container);
                }
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
            if (_batchEntities.IsCreated) _batchEntities.Dispose();
            if (_batchContainers.IsCreated) _batchContainers.Dispose();
            if (_batchCount.IsCreated) _batchCount.Dispose();
            if (_entityCache.IsCreated) _entityCache.Dispose();
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
        /// Enhanced Burst-compiled job that gathers the selected entity data plus nearby entities for hot swap caching.
        /// Uses spatial queries to find entities within a radius for proactive caching.
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

            // Batch processing outputs
            [WriteOnly] public NativeArray<Entity> BatchEntities;
            [WriteOnly] public NativeArray<EntityBlitContainer> BatchContainers;
            [WriteOnly] public NativeReference<int> BatchCount;
            [ReadOnly] public float HotSwapRadius;

            // Component type flags for efficient debug tracking
            private const int RESOURCE_FLAG = 1 << 0;  // 1
            private const int STRUCTURE_FLAG = 1 << 1; // 2
            private const int COMBATANT_FLAG = 1 << 2; // 4
            private const int ITEM_FLAG = 1 << 3;      // 8
            private const int PLAYER_FLAG = 1 << 4;    // 16

            public void Execute()
            {
                var selectedEntity = SelectedEntity.Value;

                // First, process the selected entity (same as original job)
                if (selectedEntity == Entity.Null || !EntityLookup.HasComponent(selectedEntity))
                {
                    SetFailure(selectedEntity == Entity.Null ? 1 : 2);
                    BatchCount.Value = 0;
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
                    BatchCount.Value = 0;
                    return;
                }

                // Get selected entity position for spatial query
                var selectedPos = float3.zero;
                if (L2wLookup.HasComponent(selectedEntity))
                {
                    selectedPos = L2wLookup[selectedEntity].Position;
                }

                // Hot swap: Find nearby entities to cache proactively
                // Note: In a real implementation, you'd use a spatial data structure or
                // SystemAPI.Query with distance checks. For now, we'll simulate nearby entities.
                int batchIndex = 0;

                // TODO: Replace this with actual spatial query
                // For now, we'll just mark that we processed the selected entity in batch
                // In a real implementation, you would:
                // 1. Query entities within HotSwapRadius of selectedPos
                // 2. Process each valid entity with ProcessSingleEntity
                // 3. Store results in BatchEntities/BatchContainers

                BatchCount.Value = batchIndex;
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
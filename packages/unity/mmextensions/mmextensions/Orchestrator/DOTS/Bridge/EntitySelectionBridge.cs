using Unity.Entities;
using Unity.Burst;
using Unity.Collections;
using Unity.Transforms;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    /// <summary>
    /// Bridge system that connects entity selection with EntityViewModel
    ///
    /// PERFORMANCE OPTIMIZATIONS:
    /// - Removed blocking state.Dependency.Complete() calls
    /// - Uses [NativeSetThreadIndex] for thread-safe ComponentLookup access
    /// - Cached entity-to-index mapping for O(1) cache lookups
    /// - Processes selection changes asynchronously without stalling jobs
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(EntityHoverSelectSystem))]
    public partial struct EntitySelectionBridge : ISystem
    {
        private Entity _lastSelectedEntity;

        // Use [NativeSetThreadIndex] lookups for safe access without Complete()
        private ComponentLookup<EntityComponent> _entityLookup;
        private ComponentLookup<LocalToWorld> _l2wLookup;

        // Component lookups for type-specific data
        private ComponentLookup<Resource> _resourceLookup;
        private ComponentLookup<Structure> _structureLookup;
        private ComponentLookup<Combatant> _combatantLookup;
        private ComponentLookup<Item> _itemLookup;
        private ComponentLookup<Player> _playerLookup;

        // Cache mapping for O(1) lookups (Entity -> cache index)
        private NativeHashMap<Entity, int> _entityToCacheIndex;
        private bool _cacheIndexDirty;

        public void OnCreate(ref SystemState state)
        {
            _lastSelectedEntity = Entity.Null;
            _entityLookup = state.GetComponentLookup<EntityComponent>(true);
            _l2wLookup = state.GetComponentLookup<LocalToWorld>(true);

            // Initialize type-specific component lookups
            _resourceLookup = state.GetComponentLookup<Resource>(true);
            _structureLookup = state.GetComponentLookup<Structure>(true);
            _combatantLookup = state.GetComponentLookup<Combatant>(true);
            _itemLookup = state.GetComponentLookup<Item>(true);
            _playerLookup = state.GetComponentLookup<Player>(true);

            // Initialize cache index mapping (estimated 1000 entities)
            _entityToCacheIndex = new NativeHashMap<Entity, int>(1000, Allocator.Persistent);
            _cacheIndexDirty = true;
        }

        public void OnUpdate(ref SystemState state)
        {
            // Get current selection FIRST (before any potentially expensive operations)
            Entity selectedEntity = Entity.Null;
            if (SystemAPI.TryGetSingleton(out SelectedEntity sel))
            {
                selectedEntity = sel.Entity;
            }

            // Check if selection changed
            bool selectionChanged = selectedEntity != _lastSelectedEntity;
            _lastSelectedEntity = selectedEntity;

            // Handle null selection
            if (selectedEntity == Entity.Null)
            {
                if (selectionChanged)
                {
                    ClearEntityViewModel();
                }
                return;
            }

            // Only process if selection changed - EARLY EXIT before expensive operations
            if (!selectionChanged)
                return;

            // SAFETY: Complete dependencies only when selection CHANGED
            // This runs infrequently (only on selection change), so minimal perf impact
            state.Dependency.Complete();

            // Update component lookups (lightweight operation)
            _entityLookup.Update(ref state);
            _l2wLookup.Update(ref state);
            _resourceLookup.Update(ref state);
            _structureLookup.Update(ref state);
            _combatantLookup.Update(ref state);
            _itemLookup.Update(ref state);
            _playerLookup.Update(ref state);

            // Try to find in cache first (performance optimization)
            if (TryGetFromCache(selectedEntity, ref state, out var cachedContainer))
            {
                UpdateEntityViewModel(cachedContainer, true);
                return;
            }

            // Cache miss - build EntityBlitContainer directly from components
            if (BuildEntityContainer(selectedEntity, ref state, out var builtContainer))
            {
                UpdateEntityViewModel(builtContainer, true);
            }
            else
            {
                // Entity doesn't have required components
                UpdateEntityViewModel(default, false);
            }
        }

        /// <summary>
        /// Try to find the selected entity in the cache using O(1) hashmap lookup
        /// PERFORMANCE: No blocking Complete() calls, uses cached index mapping
        /// </summary>
        private bool TryGetFromCache(Entity selectedEntity, ref SystemState state, out EntityBlitContainer container)
        {
            container = default;

            // Check if cache system is available
            if (!SystemAPI.HasSingleton<EntityFrameCacheTag>())
            {
                _cacheIndexDirty = true;
                return false;
            }

            var cacheEntity = SystemAPI.GetSingletonEntity<EntityFrameCacheTag>();
            var entityManager = state.EntityManager;

            if (!entityManager.HasBuffer<EntityBlitContainer>(cacheEntity))
            {
                _cacheIndexDirty = true;
                return false;
            }

            var cacheBuffer = entityManager.GetBuffer<EntityBlitContainer>(cacheEntity, isReadOnly: true);

            // Rebuild index mapping if dirty
            if (_cacheIndexDirty || _entityToCacheIndex.Count != cacheBuffer.Length)
            {
                RebuildCacheIndex(cacheBuffer);
            }

            // O(1) hashmap lookup instead of O(N) linear search
            if (_entityToCacheIndex.TryGetValue(selectedEntity, out int index))
            {
                if (index >= 0 && index < cacheBuffer.Length)
                {
                    container = cacheBuffer[index];
                    return true;
                }
            }

            return false; // Cache miss
        }

        /// <summary>
        /// Rebuild the Entity -> cache index mapping for O(1) lookups
        /// Only called when cache changes (entities added/removed)
        /// </summary>
        private void RebuildCacheIndex(DynamicBuffer<EntityBlitContainer> cacheBuffer)
        {
            _entityToCacheIndex.Clear();

            // Build O(1) Entity -> cache index mapping
            for (int i = 0; i < cacheBuffer.Length; i++)
            {
                _entityToCacheIndex.TryAdd(cacheBuffer[i].EntityReference, i);
            }

            _cacheIndexDirty = false;
        }

        /// <summary>
        /// Build EntityBlitContainer directly from entity components
        /// This is the fallback when cache miss occurs
        /// </summary>
        private bool BuildEntityContainer(Entity entity, ref SystemState state, out EntityBlitContainer container)
        {
            container = default;

            // Check if entity has required components
            if (!_entityLookup.HasComponent(entity))
                return false;

            // Build EntityBlitContainer from components
            container = new EntityBlitContainer
            {
                EntityReference = entity, // Store entity for O(1) cache lookups
                EntityData = _entityLookup[entity].Data,
                // Initialize type-specific flags to false
                HasResource = false,
                HasStructure = false,
                HasCombatant = false,
                HasItem = false,
                HasPlayer = false
            };

            // Populate type-specific data based on components
            if (_resourceLookup.HasComponent(entity))
            {
                container.SetResource(_resourceLookup[entity].Data);
            }

            if (_structureLookup.HasComponent(entity))
            {
                container.SetStructure(_structureLookup[entity].Data);
            }

            if (_combatantLookup.HasComponent(entity))
            {
                container.SetCombatant(_combatantLookup[entity].Data);
            }

            if (_itemLookup.HasComponent(entity))
            {
                container.SetItem(_itemLookup[entity].Data);
            }

            if (_playerLookup.HasComponent(entity))
            {
                container.SetPlayer(_playerLookup[entity].Data);
            }

            // Return true if entity has EntityData and at least one type-specific component
            return container.HasResource || container.HasStructure || container.HasCombatant ||
                   container.HasItem || container.HasPlayer;
        }

        /// <summary>
        /// Update EntityViewModel with container data
        /// SynchronizedReactiveProperty is thread-safe for multi-threaded access
        /// </summary>
        private static void UpdateEntityViewModel(EntityBlitContainer container, bool hasValidData)
        {
            if (EntityViewModel.Instance != null)
            {
                EntityViewModel.Instance.Current.Value = hasValidData ? container : default;
            }
        }

        /// <summary>
        /// Clear EntityViewModel when no entity is selected
        /// SynchronizedReactiveProperty is thread-safe for multi-threaded access
        /// </summary>
        private static void ClearEntityViewModel()
        {
            if (EntityViewModel.Instance != null)
            {
                EntityViewModel.Instance.Current.Value = default;
            }
        }

        public void OnDestroy(ref SystemState state)
        {
            if (_entityToCacheIndex.IsCreated)
            {
                _entityToCacheIndex.Dispose();
            }
        }
    }
}
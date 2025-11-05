using Unity.Entities;
using Unity.Burst;
using Unity.Collections;
using Unity.Transforms;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    /// <summary>
    /// Bridge system that connects entity selection with EntityViewModel
    /// First checks the high-performance cache, then falls back to direct entity lookup
    /// This replaces the removed EntityToVmDrainSystem with cache-first approach
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(EntityHoverSelectSystem))]
    public partial struct EntitySelectionBridge : ISystem
    {
        private Entity _lastSelectedEntity;
        private ComponentLookup<EntityComponent> _entityLookup;
        private ComponentLookup<LocalToWorld> _l2wLookup;

        // Component lookups for type-specific data
        private ComponentLookup<Resource> _resourceLookup;
        private ComponentLookup<Structure> _structureLookup;
        private ComponentLookup<Combatant> _combatantLookup;
        private ComponentLookup<Item> _itemLookup;
        private ComponentLookup<Player> _playerLookup;

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
        }

        public void OnUpdate(ref SystemState state)
        {
            // IMPORTANT: Complete dependencies before accessing ComponentLookup
            // This system reads from multiple component types that may be written by jobs
            state.Dependency.Complete();

            //  11-04-2025 - Need to double check if the state.Dependency.Complete ends up becoming blocking.

            // Update component lookups
            _entityLookup.Update(ref state);
            _l2wLookup.Update(ref state);

            // Update type-specific lookups
            _resourceLookup.Update(ref state);
            _structureLookup.Update(ref state);
            _combatantLookup.Update(ref state);
            _itemLookup.Update(ref state);
            _playerLookup.Update(ref state);

            // Get current selection
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

            // Only process if selection changed or we need to update
            if (!selectionChanged)
                return;

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
        /// Try to find the selected entity in the cache
        /// Returns true if found, false otherwise
        /// </summary>
        private bool TryGetFromCache(Entity selectedEntity, ref SystemState state, out EntityBlitContainer container)
        {
            container = default;

            // Check if cache system is available
            if (!SystemAPI.HasSingleton<EntityFrameCacheTag>())
                return false;

            var cacheEntity = SystemAPI.GetSingletonEntity<EntityFrameCacheTag>();
            var entityManager = state.EntityManager;

            if (!entityManager.HasBuffer<EntityBlitContainer>(cacheEntity))
                return false;

            // Complete any pending producer jobs before accessing the cache buffer
            if (entityManager.HasComponent<EntityCacheJobHandle>(cacheEntity))
            {
                var jobHandleComponent = entityManager.GetComponentData<EntityCacheJobHandle>(cacheEntity);
                jobHandleComponent.ProducerJobHandle.Complete();
            }

            var cacheBuffer = entityManager.GetBuffer<EntityBlitContainer>(cacheEntity);

            // Note: This is a simple linear search. For large caches, you might want
            // to add entity->index mapping to the cache system for O(1) lookup
            for (int i = 0; i < cacheBuffer.Length; i++)
            {
                var cached = cacheBuffer[i];
                // TODO: Add proper entity identification mechanism
                // For now, this will be a cache miss until proper entity ID correlation is implemented
                // You might want to add Entity reference to EntityData or use a different approach
            }

            return false; // Cache miss for now
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
            // No cleanup needed
        }
    }
}
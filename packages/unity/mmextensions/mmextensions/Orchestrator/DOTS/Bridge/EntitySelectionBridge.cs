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

        public void OnCreate(ref SystemState state)
        {
            _lastSelectedEntity = Entity.Null;
            _entityLookup = state.GetComponentLookup<EntityComponent>(true);
            _l2wLookup = state.GetComponentLookup<LocalToWorld>(true);
        }

        public void OnUpdate(ref SystemState state)
        {
            // Update component lookups
            _entityLookup.Update(ref state);
            _l2wLookup.Update(ref state);

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

            // TODO: Add logic to populate type-specific data based on additional components
            // This would check for Resource, Structure, Combatant, etc. components
            // and populate the corresponding data fields and flags

            return true;
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
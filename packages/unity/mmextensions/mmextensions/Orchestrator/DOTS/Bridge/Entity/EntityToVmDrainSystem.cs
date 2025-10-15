using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Burst;
using Unity.Collections;
using Unity.Jobs;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    [BurstCompile]
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    [UpdateAfter(typeof(KBVE.MMExtensions.Orchestrator.DOTS.EntityHoverSelectSystem))]
    public partial struct EntityToVmDrainSystem : ISystem
    {
        // Component lookups for all entity types
        private ComponentLookup<EntityTypeComponent> _typeLookup;
        private ComponentLookup<Resource> _resourceLookup;
        private ComponentLookup<ResourceID> _resourceIdLookup;
        // private ComponentLookup<Structure> _structureLookup;
        // private ComponentLookup<StructureID> _structureIdLookup;
        // private ComponentLookup<Monster> _monsterLookup;
        // private ComponentLookup<MonsterID> _monsterIdLookup;
        // private ComponentLookup<Unit> _unitLookup;
        // private ComponentLookup<UnitID> _unitIdLookup;
        // private ComponentLookup<NPC> _npcLookup;
        // private ComponentLookup<NPCID> _npcIdLookup;
        // private ComponentLookup<Item> _itemLookup;
        // private ComponentLookup<Player> _playerLookup;
        private ComponentLookup<LocalToWorld> _l2wLookup;

        // Native containers for Burst-managed data transfer
        private NativeReference<EntityBlitContainer> _blitContainer;
        private NativeReference<bool> _hasValidData;
        private NativeReference<Entity> _selectedEntityRef;

        // Debug info
        private NativeReference<int> _debugCode;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _entityBlitLookup = state.GetComponentLookup<EntityBlit>(true);
            _resourceBlitLookup = state.GetComponentLookup<ResourceBlit>(true);
            _structureBlitLookup = state.GetComponentLookup<StructureBlit>(true);
            _combatantBlitLookup = state.GetComponentLookup<CombatantBlit>(true);
            _itemBlitLookup = state.GetComponentLookup<ItemBlit>(true);
            _l2wLookup = state.GetComponentLookup<LocalToWorld>(true);

            _blitContainer = new NativeReference<EntityBlitContainer>(Allocator.Persistent);
            _hasValidData = new NativeReference<bool>(Allocator.Persistent);
            _selectedEntityRef = new NativeReference<Entity>(Allocator.Persistent);
            _debugCode = new NativeReference<int>(Allocator.Persistent);

            _hasValidData.Value = false;
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            // Update lookups once per frame
            _entityBlitLookup.Update(ref state);
            _resourceBlitLookup.Update(ref state);
            _structureBlitLookup.Update(ref state);
            _combatantBlitLookup.Update(ref state);
            _itemBlitLookup.Update(ref state);
            _l2wLookup.Update(ref state);

            // Get selected entity from universal SelectedEntity singleton
            Entity selectedEntity = Entity.Null;
            if (SystemAPI.TryGetSingleton(out SelectedEntity sel))
            {
                selectedEntity = sel.Entity;
            }

            // Store in native container for job
            _selectedEntityRef.Value = selectedEntity;

            // Schedule Burst-compiled job
            var gatherJob = new GatherEntityDataJob
            {
                SelectedEntity = _selectedEntityRef,
                EntityBlitLookup = _entityBlitLookup,
                ResourceBlitLookup = _resourceBlitLookup,
                StructureBlitLookup = _structureBlitLookup,
                CombatantBlitLookup = _combatantBlitLookup,
                ItemBlitLookup = _itemBlitLookup,
                L2wLookup = _l2wLookup,
                BlitOutput = _blitContainer,
                HasValidOutput = _hasValidData,
                DebugCode = _debugCode
            };

            state.Dependency = gatherJob.Schedule(state.Dependency);
            state.Dependency.Complete();

            // Debug output
            int debugCode = _debugCode.Value;
            string debugMsg = debugCode switch
            {
                1 => "Entity is Null",
                2 => "Missing EntityBlit component",
                3 => "Success - has valid data",
                _ => "Unknown state"
            };

            // Update ViewModel
            if (_hasValidData.Value)
            {
                Debug.Log($"EntityJob SUCCESS: {debugMsg}");
                UpdateViewModel(_blitContainer.Value, true);
            }
            else
            {
                Debug.Log($"EntityJob FAILED: {debugMsg}, SelectedEntity={selectedEntity.Index}:{selectedEntity.Version}");
                UpdateViewModel(default, false);
            }
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state)
        {
            if (_blitContainer.IsCreated) _blitContainer.Dispose();
            if (_hasValidData.IsCreated) _hasValidData.Dispose();
            if (_selectedEntityRef.IsCreated) _selectedEntityRef.Dispose();
            if (_debugCode.IsCreated) _debugCode.Dispose();
        }

        // Managed code interaction - cannot be Burst compiled
        [BurstDiscard]
        private void UpdateViewModel(EntityBlitContainer container, bool hasValidData)
        {
            if (EntityViewModel.Instance != null)
            {
                EntityViewModel.Instance.Current.Value = hasValidData ? container : (EntityBlitContainer?)null;
            }
        }

        /// <summary>
        /// Burst-compiled job that gathers entity data from ECS components
        /// </summary>
        [BurstCompile]
        private struct GatherEntityDataJob : IJob
        {
            [ReadOnly] public NativeReference<Entity> SelectedEntity;
            [ReadOnly] public ComponentLookup<EntityBlit> EntityBlitLookup;
            [ReadOnly] public ComponentLookup<ResourceBlit> ResourceBlitLookup;
            [ReadOnly] public ComponentLookup<StructureBlit> StructureBlitLookup;
            [ReadOnly] public ComponentLookup<CombatantBlit> CombatantBlitLookup;
            [ReadOnly] public ComponentLookup<ItemBlit> ItemBlitLookup;
            [ReadOnly] public ComponentLookup<LocalToWorld> L2wLookup;

            [WriteOnly] public NativeReference<EntityBlitContainer> BlitOutput;
            [WriteOnly] public NativeReference<bool> HasValidOutput;
            [WriteOnly] public NativeReference<int> DebugCode;

            public void Execute()
            {
                var entity = SelectedEntity.Value;

                // Validate entity
                if (entity == Entity.Null)
                {
                    DebugCode.Value = 1;
                    HasValidOutput.Value = false;
                    return;
                }

                // EntityBlit is required for all entities
                if (!EntityBlitLookup.HasComponent(entity))
                {
                    DebugCode.Value = 2;
                    HasValidOutput.Value = false;
                    return;
                }

                // Get EntityBlit (universal data)
                var entityBlit = EntityBlitLookup[entity];

                // Create container with EntityBlit
                var container = new EntityBlitContainer
                {
                    Entity = entityBlit
                };

                // Add type-specific data based on what components exist
                if (ResourceBlitLookup.HasComponent(entity))
                {
                    container.Resource = ResourceBlitLookup[entity];
                }

                if (StructureBlitLookup.HasComponent(entity))
                {
                    container.Structure = StructureBlitLookup[entity];
                }

                if (CombatantBlitLookup.HasComponent(entity))
                {
                    container.Combatant = CombatantBlitLookup[entity];
                }

                if (ItemBlitLookup.HasComponent(entity))
                {
                    container.Item = ItemBlitLookup[entity];
                }

                // Write output
                BlitOutput.Value = container;
                HasValidOutput.Value = true;
                DebugCode.Value = 3;
            }
        }
    }
}
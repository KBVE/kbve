using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Burst;
using Unity.Collections;
using Unity.Jobs;
using UnityEngine;
using KBVE.MMExtensions.Orchestrator.DOTS;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

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
        private ComponentLookup<Structure> _structureLookup;
        private ComponentLookup<StructureID> _structureIdLookup;
        // private ComponentLookup<Monster> _monsterLookup;
        // private ComponentLookup<MonsterID> _monsterIdLookup;
        // private ComponentLookup<Unit> _unitLookup;
        // private ComponentLookup<UnitID> _unitIdLookup;
        // private ComponentLookup<NPC> _npcLookup;
        // private ComponentLookup<NPCID> _npcIdLookup;
        // private ComponentLookup<Item> _itemLookup;
        // private ComponentLookup<Player> _playerLookup;
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

        // Debug info
        private NativeReference<int> _debugCode;

        [BurstCompile]
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
        }

        // [BurstCompile] - Temporarily removed for debug logging
        public void OnUpdate(ref SystemState state)
        {
            UnityEngine.Debug.Log("EntityToVmDrainSystem: OnUpdate called");

            // Update lookups once per frame
            _entityLookup.Update(ref state);
            _resourceLookup.Update(ref state);
            _structureLookup.Update(ref state);
            _combatantLookup.Update(ref state);
            _itemLookup.Update(ref state);
            _playerLookup.Update(ref state);
            _l2wLookup.Update(ref state);

            // Get selected entity from universal SelectedEntity singleton
            Entity selectedEntity = Entity.Null;
            if (SystemAPI.TryGetSingleton(out SelectedEntity sel))
            {
                selectedEntity = sel.Entity;
                UnityEngine.Debug.Log($"EntityToVmDrainSystem: Found SelectedEntity singleton with entity: {selectedEntity}");
            }
            else
            {
                UnityEngine.Debug.Log("EntityToVmDrainSystem: No SelectedEntity singleton found");
            }

            // Store in native container for job
            _selectedEntityRef.Value = selectedEntity;

            // Only schedule job if we have a valid selected entity
            if (selectedEntity == Entity.Null)
            {
                UnityEngine.Debug.Log("EntityToVmDrainSystem: No entity selected, skipping job");
                return;
            }

            UnityEngine.Debug.Log($"EntityToVmDrainSystem: Scheduling job for entity {selectedEntity}");

            // Schedule Burst-compiled job
            var gatherJob = new GatherEntityDataJob
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

            state.Dependency = gatherJob.Schedule(state.Dependency);
            state.Dependency.Complete();

            UnityEngine.Debug.Log("EntityToVmDrainSystem: Job completed, calling HandleJobResults");

            // Update ViewModel (non-Burst)
            HandleJobResults();
        }

        // Non-Burst method to handle ViewModel updates
        [BurstDiscard]
        private void HandleJobResults()
        {
            int debugCode = _debugCode.Value;
            string debugMessage = debugCode switch
            {
                1 => "Entity is null",
                2 => "Entity missing EntityComponent",
                3 => "Success - data processed",
                10 => "Found Resource component",
                11 => "Found Structure component",
                12 => "Found Combatant component",
                13 => "Found Item component",
                14 => "Found Player component",
                15 => "No type-specific components found",
                _ => $"Unknown debug code: {debugCode}"
            };

            UnityEngine.Debug.Log($"EntityToVmDrainSystem Job Result: {debugMessage} (code: {debugCode})");

            // Update ViewModel based on job results
            if (_hasValidData.Value)
            {
                UnityEngine.Debug.Log($"EntityToVmDrainSystem: Valid data found, updating ViewModel");
                UpdateViewModel(_blitContainer.Value, true);
            }
            else
            {
                UnityEngine.Debug.Log($"EntityToVmDrainSystem: No valid data, clearing ViewModel");
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
                if (hasValidData)
                {
                    EntityViewModel.Instance.Current.Value = container;
                }
                else
                {
                    // Create empty container with no valid data (all HasX flags false)
                    var emptyContainer = new EntityBlitContainer();
                    emptyContainer.Clear(); // Ensures all HasX flags are false
                    EntityViewModel.Instance.Current.Value = emptyContainer;
                }
            }
        }

        /// <summary>
        /// Burst-compiled job that gathers entity data from ECS components
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

                // EntityComponent is required for all entities
                if (!EntityLookup.HasComponent(entity))
                {
                    DebugCode.Value = 2;
                    HasValidOutput.Value = false;
                    return;
                }

                // Get EntityComponent (universal data)
                var entityComponent = EntityLookup[entity];

                // Create container with EntityData, but update WorldPos from actual transform
                var entityData = entityComponent.Data;

                // Update WorldPos with current world position from LocalToWorld
                if (L2wLookup.HasComponent(entity))
                {
                    var localToWorld = L2wLookup[entity];
                    entityData.WorldPos = localToWorld.Position;
                }

                var container = new EntityBlitContainer
                {
                    EntityData = entityData
                };

                // Add type-specific data based on what components exist
                bool hasAnyTypeData = false;

                if (ResourceLookup.HasComponent(entity))
                {
                    // Convert Resource component to ResourceData for the container
                    var resourceComponent = ResourceLookup[entity];
                    container.SetResource(resourceComponent.Data);
                    hasAnyTypeData = true;
                    DebugCode.Value = 10; // Found Resource component
                }

                if (StructureLookup.HasComponent(entity))
                {
                    // Convert Structure component to StructureData for the container
                    var structureComponent = StructureLookup[entity];
                    container.SetStructure(structureComponent.Data);
                    hasAnyTypeData = true;
                    DebugCode.Value = 11; // Found Structure component
                }

                if (CombatantLookup.HasComponent(entity))
                {
                    // Convert Combatant component to CombatantData for the container
                    var combatantComponent = CombatantLookup[entity];
                    container.SetCombatant(combatantComponent.Data);
                    hasAnyTypeData = true;
                    DebugCode.Value = 12; // Found Combatant component
                }

                if (ItemLookup.HasComponent(entity))
                {
                    // Convert Item component to ItemData for the container
                    var itemComponent = ItemLookup[entity];
                    container.SetItem(itemComponent.Data);
                    hasAnyTypeData = true;
                    DebugCode.Value = 13; // Found Item component
                }

                if (PlayerLookup.HasComponent(entity))
                {
                    // Convert Player component to PlayerData for the container
                    var playerComponent = PlayerLookup[entity];
                    container.SetPlayer(playerComponent.Data);
                    hasAnyTypeData = true;
                    DebugCode.Value = 14; // Found Player component
                }

                if (!hasAnyTypeData)
                {
                    DebugCode.Value = 15; // No type-specific components found
                    HasValidOutput.Value = false;
                    return;
                }

                // Write output
                BlitOutput.Value = container;
                HasValidOutput.Value = true;
                DebugCode.Value = 3; // Success
            }
        }
    }
}
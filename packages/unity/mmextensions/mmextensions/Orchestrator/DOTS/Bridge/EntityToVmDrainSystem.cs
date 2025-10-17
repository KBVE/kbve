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

        // [BurstCompile] - Disabled: Burst compilation interferes with ViewModel updates and debug logging
        // This system heavily interacts with managed objects (EntityViewModel) making Burst less suitable
        public void OnUpdate(ref SystemState state)
        {

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
            }

            // Store in native container for job
            _selectedEntityRef.Value = selectedEntity;

            // Only schedule job if we have a valid selected entity
            if (selectedEntity == Entity.Null)
            {
                return;
            }

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
                15 => "No type-specific components found",
                _ when debugCode >= 100 => $"Success - Found components: {GetComponentList(debugCode - 100)}",
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
    }
}
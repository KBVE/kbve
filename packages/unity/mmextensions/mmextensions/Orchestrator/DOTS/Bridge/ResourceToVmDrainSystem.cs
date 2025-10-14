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
    [UpdateAfter(typeof(KBVE.MMExtensions.Orchestrator.DOTS.ResourceHoverSelectSystem))]
    public partial struct ResourceToVmDrainSystem : ISystem
    {
        private ComponentLookup<Resource> _resLookup;
        private ComponentLookup<ResourceID> _idLookup;
        private ComponentLookup<LocalToWorld> _l2wLookup;

        // Native containers for Burst-managed data transfer
        private NativeReference<ResourceBlit> _blitContainer;
        private NativeReference<bool> _hasValidData;
        private NativeReference<Entity> _selectedEntityRef;
        
        // Debug info
        private NativeReference<int> _debugCode;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _resLookup = state.GetComponentLookup<Resource>(true);
            _idLookup = state.GetComponentLookup<ResourceID>(true);
            _l2wLookup = state.GetComponentLookup<LocalToWorld>(true);

            _blitContainer = new NativeReference<ResourceBlit>(Allocator.Persistent);
            _hasValidData = new NativeReference<bool>(Allocator.Persistent);
            _selectedEntityRef = new NativeReference<Entity>(Allocator.Persistent);
            _debugCode = new NativeReference<int>(Allocator.Persistent);

            _hasValidData.Value = false;
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            // Update lookups once per frame
            _resLookup.Update(ref state);
            _idLookup.Update(ref state);
            _l2wLookup.Update(ref state);

            // Get selected entity (if exists)
            Entity selectedEntity = Entity.Null;
            if (SystemAPI.TryGetSingleton(out SelectedResource sel))
            {
                selectedEntity = sel.Entity;
            }

            // Store in native container for job
            _selectedEntityRef.Value = selectedEntity;

            // Schedule Burst-compiled job
            var gatherJob = new GatherResourceDataJob
            {
                SelectedEntity = _selectedEntityRef,
                ResLookup = _resLookup,
                IdLookup = _idLookup,
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
                2 => "Missing Resource or ResourceID component",
                3 => "Success - has valid data",
                _ => "Unknown state"
            };

            // SIMPLIFIED: Always update, no change detection
            if (_hasValidData.Value)
            {
                Debug.Log($"Job SUCCESS: {debugMsg}");
                UpdateViewModel(_blitContainer.Value, true);
            }
            else
            {
                Debug.Log($"Job FAILED: {debugMsg}, SelectedEntity={selectedEntity.Index}:{selectedEntity.Version}");
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
        private void UpdateViewModel(ResourceBlit blit, bool hasValidData)
        {
            if (ResourceViewModel.Instance != null)
            {
                ResourceViewModel.Instance.Current.Value = hasValidData ? blit : (ResourceBlit?)null;
            }
        }

        /// <summary>
        /// Burst-compiled job that gathers resource data from ECS components
        /// </summary>
        [BurstCompile]
        private struct GatherResourceDataJob : IJob
        {
            [ReadOnly] public NativeReference<Entity> SelectedEntity;
            [ReadOnly] public ComponentLookup<Resource> ResLookup;
            [ReadOnly] public ComponentLookup<ResourceID> IdLookup;
            [ReadOnly] public ComponentLookup<LocalToWorld> L2wLookup;

            [WriteOnly] public NativeReference<ResourceBlit> BlitOutput;
            [WriteOnly] public NativeReference<bool> HasValidOutput;
            [WriteOnly] public NativeReference<int> DebugCode;

            public void Execute()
            {
                var entity = SelectedEntity.Value;

                // Validate entity and required components
                if (entity == Entity.Null)
                {
                    DebugCode.Value = 1;
                    HasValidOutput.Value = false;
                    return;
                }

                if (!ResLookup.HasComponent(entity) || !IdLookup.HasComponent(entity))
                {
                    DebugCode.Value = 2;
                    HasValidOutput.Value = false;
                    return;
                }

                // Gather component data
                var res = ResLookup[entity];
                var id = IdLookup[entity];

                // Get position if available
                float3 pos = float3.zero;
                if (L2wLookup.HasComponent(entity))
                {
                    pos = L2wLookup[entity].Position;
                }

                // Build blit structure
                var blit = new ResourceBlit
                {
                    Ulid = id.ulid,
                    Type = (byte)res.type,
                    Flags = (byte)res.flags,
                    Amount = res.amount,
                    MaxAmount = res.maxAmount,
                    HarvestYield = res.harvestYield,
                    HarvestTime = res.harvestTime,
                    WorldPos = pos
                };

                // Write output
                BlitOutput.Value = blit;
                HasValidOutput.Value = true;
                DebugCode.Value = 3;
            }
        }
    }
}
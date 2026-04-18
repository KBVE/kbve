using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using UnityEngine;

namespace NSprites
{
    /// <summary>
    /// Phase 1: Schedules chunk calculation and property sync jobs for sprite rendering.
    /// Runs before SpriteRenderingDrawSystem in the PresentationSystemGroup.
    /// </summary>
    [WorldSystemFilter(WorldSystemFilterFlags.Default | WorldSystemFilterFlags.Editor)]
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial struct SpriteRenderingUpdateSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
#if NSPRITES_REACTIVE_DISABLE && NSPRITES_STATIC_DISABLE && NSPRITES_EACH_UPDATE_DISABLE
            throw new NSpritesException($"You can't disable {nameof(PropertyUpdateMode.Reactive)}, {nameof(PropertyUpdateMode.Static)} and {nameof(PropertyUpdateMode.EachUpdate)} properties modes at the same time, there should be at least one mode if you want system to work. Please, enable at least one mode.");
#endif
            // instantiate and initialize system data
            var renderArchetypeStorage = new RenderArchetypeStorage{ SystemData = new SystemData { Query = state.GetEntityQuery(NSpritesUtils.GetDefaultComponentTypes()) }};
            renderArchetypeStorage.Initialize();
            state.EntityManager.AddComponentObject(state.SystemHandle, renderArchetypeStorage);
        }

        public void OnDestroy(ref SystemState state)
        {
            SystemAPI.ManagedAPI.GetComponent<RenderArchetypeStorage>(state.SystemHandle).Dispose();
        }

        public void OnUpdate(ref SystemState state)
        {
            var renderArchetypeStorage = SystemAPI.ManagedAPI.GetComponent<RenderArchetypeStorage>(state.SystemHandle);
#if UNITY_EDITOR
            if (!Application.isPlaying && renderArchetypeStorage.Quad == null)
                renderArchetypeStorage.Quad = NSpritesUtils.ConstructQuad();
#endif
            // update state to pass to render archetypes
#if !NSPRITES_REACTIVE_DISABLE || !NSPRITES_STATIC_DISABLE
            var systemData = renderArchetypeStorage.SystemData;
            systemData.LastSystemVersion = state.LastSystemVersion;
            systemData.PropertyPointer_CTH_RW = SystemAPI.GetComponentTypeHandle<PropertyPointer>(false);
            systemData.PropertyPointerChunk_CTH_RW = SystemAPI.GetComponentTypeHandle<PropertyPointerChunk>(false);
            systemData.PropertyPointerChunk_CTH_RO = SystemAPI.GetComponentTypeHandle<PropertyPointerChunk>(true);
#endif
            systemData.InputDeps = state.Dependency;

            var archetypes = renderArchetypeStorage.RenderArchetypes;
            var count = archetypes.Count;

            // PHASE 1: Schedule all chunk calculation jobs in parallel
            var calcHandles = new NativeArray<JobHandle>(count, Allocator.Temp);
            for (int i = 0; i < count; i++)
                calcHandles[i] = archetypes[i].ScheduleChunkCalculation(systemData, ref state);

            // Push calculation jobs to worker threads
            JobHandle.ScheduleBatchedJobs();

            // Complete all calculation jobs ONCE (batched sync point)
            var allCalcs = JobHandle.CombineDependencies(calcHandles);
            calcHandles.Dispose();
            allCalcs.Complete();

            // PHASE 2: Make allocation decisions and schedule property sync jobs
            var syncHandles = new NativeArray<JobHandle>(count, Allocator.Temp);
            for (int i = 0; i < count; i++)
                syncHandles[i] = archetypes[i].CompleteCalculationAndScheduleSync(systemData, ref state);

            // Push sync jobs to worker threads
            JobHandle.ScheduleBatchedJobs();

            // Return combined handles for SpriteRenderingDrawSystem to complete
            state.Dependency = JobHandle.CombineDependencies(syncHandles);
            syncHandles.Dispose();
        }
    }

    /// <summary>
    /// Phase 2: Completes property sync jobs and draws all sprite archetypes.
    /// Runs after SpriteRenderingUpdateSystem in the PresentationSystemGroup.
    /// </summary>
    [WorldSystemFilter(WorldSystemFilterFlags.Default | WorldSystemFilterFlags.Editor)]
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    [UpdateAfter(typeof(SpriteRenderingUpdateSystem))]
    public partial struct SpriteRenderingDrawSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            // Access the same render archetype storage (shared via entity manager)
            var updateSystemHandle = state.World.Unmanaged.GetExistingUnmanagedSystem<SpriteRenderingUpdateSystem>();
            var renderArchetypeStorage = SystemAPI.ManagedAPI.GetComponent<RenderArchetypeStorage>(updateSystemHandle);

            // Complete all property sync jobs ONCE (batched sync point)
            state.Dependency.Complete();

            // Draw all archetypes (CompleteAndDraw now just finalizes buffers + draws)
            for (int i = 0; i < renderArchetypeStorage.RenderArchetypes.Count; i++)
                renderArchetypeStorage.RenderArchetypes[i].CompleteAndDraw();
        }
    }
}
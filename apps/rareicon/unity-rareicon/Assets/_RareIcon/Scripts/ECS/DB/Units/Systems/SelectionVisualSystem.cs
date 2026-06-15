using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Mirrors <see cref="SelectedTag"/> into the per-instance <see cref="UnitSelectedVisual"/> so HexUnit.shader can draw the selection ring. Also back-fills the visual component onto any Unit entity that spawned without it, keeping this system the single source of truth for selection rendering. Two parallel IJobEntity passes (selected → 1f, unselected → 0f) replace the prior main-thread foreach scans so the per-frame UnitSelectedVisual sweep stays off the main thread at scale.</summary>
    [BurstCompile]
    public partial struct SelectionVisualSystem : ISystem
    {
        EntityQuery _missingVisual;

        public void OnCreate(ref SystemState state)
        {
            _missingVisual = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Unit>()
                .WithNone<UnitSelectedVisual>()
                .Build(ref state);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!_missingVisual.IsEmpty)
            {
                var ecb = SystemAPI
                    .GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                    .CreateCommandBuffer(state.WorldUnmanaged);
                using var arr = _missingVisual.ToEntityArray(Allocator.Temp);
                for (int i = 0; i < arr.Length; i++)
                    ecb.AddComponent(arr[i], new UnitSelectedVisual { Value = 0f });
            }

            var selectedHandle   = new MarkSelectedVisualJob   { Target = 1f }.ScheduleParallel(state.Dependency);
            var unselectedHandle = new MarkUnselectedVisualJob { Target = 0f }.ScheduleParallel(selectedHandle);

            state.Dependency = unselectedHandle;
        }
    }

    [BurstCompile]
    [WithAll(typeof(SelectedTag))]
    public partial struct MarkSelectedVisualJob : IJobEntity
    {
        public float Target;

        void Execute(ref UnitSelectedVisual vis)
        {
            if (vis.Value != Target) vis.Value = Target;
        }
    }

    [BurstCompile]
    [WithNone(typeof(SelectedTag))]
    public partial struct MarkUnselectedVisualJob : IJobEntity
    {
        public float Target;

        void Execute(ref UnitSelectedVisual vis)
        {
            if (vis.Value != Target) vis.Value = Target;
        }
    }
}

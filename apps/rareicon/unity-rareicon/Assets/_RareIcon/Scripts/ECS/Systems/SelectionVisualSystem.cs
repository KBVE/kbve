using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Mirrors <see cref="SelectedTag"/> into the per-instance <see cref="UnitSelectedVisual"/> so HexUnit.shader can draw the selection ring. Also back-fills the visual component onto any Unit entity that spawned without it, keeping this system the single source of truth for selection rendering.</summary>
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

            foreach (var vis in SystemAPI.Query<RefRW<UnitSelectedVisual>>()
                                          .WithAll<SelectedTag>())
            {
                if (vis.ValueRO.Value != 1f) vis.ValueRW.Value = 1f;
            }

            foreach (var vis in SystemAPI.Query<RefRW<UnitSelectedVisual>>()
                                          .WithNone<SelectedTag>())
            {
                if (vis.ValueRO.Value != 0f) vis.ValueRW.Value = 0f;
            }
        }
    }
}

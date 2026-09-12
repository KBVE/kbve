using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Writes ConstructionProgressVisual each frame: 1 for completed buildings, sum(delivered)/sum(needed) for active construction sites.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct ConstructionProgressSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            state.Dependency = new ResetConstructionProgressJob().ScheduleParallel(state.Dependency);
            state.Dependency = new SetConstructionProgressJob().ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    partial struct ResetConstructionProgressJob : IJobEntity
    {
        void Execute(ref ConstructionProgressVisual vis) => vis.Value = 1f;
    }

    [BurstCompile]
    [WithAll(typeof(ConstructionSite))]
    partial struct SetConstructionProgressJob : IJobEntity
    {
        void Execute(in DynamicBuffer<ConstructionMaterial> mats, ref ConstructionProgressVisual vis)
        {
            int delivered = 0;
            int needed = 0;
            for (int i = 0; i < mats.Length; i++)
            {
                delivered += mats[i].Delivered;
                needed += mats[i].Needed;
            }
            vis.Value = needed <= 0 ? 0f : (float)delivered / needed;
        }
    }
}

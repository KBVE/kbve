using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Mirrors Unit equipment slots (Weapon / Helmet / Shield) onto their MaterialProperty visuals so the shader sprite follows whatever the unit has equipped.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial struct EquipmentVisualMirrorSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            new MirrorWeaponVisualJob().ScheduleParallel();
            new MirrorHelmetVisualJob().ScheduleParallel();
            new MirrorShieldVisualJob().ScheduleParallel();
        }
    }

    [BurstCompile]
    public partial struct MirrorWeaponVisualJob : IJobEntity
    {
        void Execute(in Unit unit, ref UnitWeaponVisual visual)
        {
            float v = (float)unit.Weapon;
            if (visual.Value != v) visual.Value = v;
        }
    }

    [BurstCompile]
    public partial struct MirrorHelmetVisualJob : IJobEntity
    {
        void Execute(in Unit unit, ref UnitHelmetVisual visual)
        {
            float v = (float)unit.Helmet;
            if (visual.Value != v) visual.Value = v;
        }
    }

    [BurstCompile]
    public partial struct MirrorShieldVisualJob : IJobEntity
    {
        void Execute(in Unit unit, ref UnitShieldVisual visual)
        {
            float v = (float)unit.Shield;
            if (visual.Value != v) visual.Value = v;
        }
    }
}

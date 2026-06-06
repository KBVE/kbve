using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Passive ambient heal applied to Player units in Eat or Sleep relief standing on a ProvidesHealing-tagged building's footprint. Ticks BonusHealPerSecond × dt into Health.Value up to Max — independent of Medkit consumption so a unit eating or sleeping at a Barracks still benefits after its RegenBuff expires. Runs after BarracksHealExecutor so Medkit-driven instant/regen happens first; this is the supplementary trickle. Parallel IJobEntity walks Player units in Eat/Sleep relief; HexLookup / HexOccupant / ProvidesHealing read-only across worker threads.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(BarracksHealExecutor))]
    public partial struct BarracksRestBonusSystem : ISystem
    {
        const float BonusHealPerSecond = 1.5f;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<HexDBSingleton>();
            state.RequireForUpdate<ReliefIntent>();
        }

        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float dt = SystemAPI.Time.DeltaTime;
            if (dt <= 0f) return;

            var hexDB = SystemAPI.GetSingleton<HexDBSingleton>();

            state.Dependency = new BarracksRestBonusJob
            {
                Dt                  = dt,
                BonusHealPerSecond  = BonusHealPerSecond,
                HexLookup           = hexDB.Lookup,
                HexOccupantLookup   = SystemAPI.GetComponentLookup<HexOccupant>(true),
                ProvidesHealLookup  = SystemAPI.GetComponentLookup<ProvidesHealing>(true),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct BarracksRestBonusJob : IJobEntity
    {
        public float Dt;
        public float BonusHealPerSecond;
        [ReadOnly] public NativeHashMap<int2, Entity>     HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>    HexOccupantLookup;
        [ReadOnly] public ComponentLookup<ProvidesHealing> ProvidesHealLookup;

        void Execute(in ReliefIntent intent, in UnitMovement movement, ref Health health, in Faction faction)
        {
            if (faction.Value != FactionType.Player) return;
            byte kind = intent.Kind;
            if (kind != ReliefKind.Eat && kind != ReliefKind.Sleep) return;
            if (health.Value >= health.Max) return;

            if (!HexLookup.TryGetValue(movement.CurrentHex, out var tile)) return;
            if (!HexOccupantLookup.HasComponent(tile)) return;
            var building = HexOccupantLookup[tile].Building;
            if (!ProvidesHealLookup.HasComponent(building)) return;

            health.Value = math.min(health.Max, health.Value + BonusHealPerSecond * Dt);
        }
    }
}

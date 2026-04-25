using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Passive ambient heal applied to Player units in Eat or Sleep relief standing on a ProvidesHealing-tagged building's footprint. Ticks BonusHealPerSecond × dt into Health.Value up to Max — independent of Medkit consumption so a unit eating or sleeping at a Barracks still benefits after its RegenBuff expires. Runs after BarracksHealExecutor so Medkit-driven instant/regen happens first; this is the supplementary trickle.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(BarracksHealExecutor))]
    public partial struct BarracksRestBonusSystem : ISystem
    {
        const float BonusHealPerSecond = 1.5f;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<HexDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float dt = SystemAPI.Time.DeltaTime;
            if (dt <= 0f) return;

            if (!SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexLookup)) return;

            var hexOccupantLookup   = SystemAPI.GetComponentLookup<HexOccupant>(true);
            var providesHealLookup  = SystemAPI.GetComponentLookup<ProvidesHealing>(true);

            foreach (var (intentRO, movementRO, healthRW, factionRO) in
                     SystemAPI.Query<RefRO<ReliefIntent>, RefRO<UnitMovement>, RefRW<Health>, RefRO<Faction>>())
            {
                if (factionRO.ValueRO.Value != FactionType.Player) continue;
                byte kind = intentRO.ValueRO.Kind;
                if (kind != ReliefKind.Eat && kind != ReliefKind.Sleep) continue;

                ref var health = ref healthRW.ValueRW;
                if (health.Value >= health.Max) continue;

                if (!hexLookup.Lookup.TryGetValue(movementRO.ValueRO.CurrentHex, out var tile)) continue;
                if (!hexOccupantLookup.HasComponent(tile)) continue;
                var building = hexOccupantLookup[tile].Building;
                if (!providesHealLookup.HasComponent(building)) continue;

                health.Value = math.min(health.Max, health.Value + BonusHealPerSecond * dt);
            }
        }
    }
}

using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Executor for ReliefKind.Heal on any ProvidesHealing-tagged building. Wounded Player unit on the building's footprint with no active RegenBuff consumes one MedKit out of the building's ledger (direct CurrentAmounts decrement — LedgerMirrorSystem reflects it to the buffer next frame). Applies the item's instant RestoreHealth and grants a RegenBuff of its RegenPerSecond / RegenDuration. Runs in BehaviorSystemGroup after ReliefSystem so the latest ReliefIntent drives consumption.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ReliefSystem))]
    public partial struct BarracksHealExecutor : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
            state.RequireForUpdate<ItemDBSingleton>();
            state.RequireForUpdate<HexLookupSingleton>();
            state.RequireForUpdate<EndSimulationEntityCommandBufferSystem.Singleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;
            var itemDB = SystemAPI.GetSingleton<ItemDBSingleton>();

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            db.PipelineHandle.Complete();
            state.CompleteDependency();

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                .CreateCommandBuffer(state.WorldUnmanaged);

            var hexOccupantLookup   = SystemAPI.GetComponentLookup<HexOccupant>(true);
            var providesHealLookup  = SystemAPI.GetComponentLookup<ProvidesHealing>(true);
            var regenBuffLookup     = SystemAPI.GetComponentLookup<RegenBuff>(true);

            float medkitInstant     = itemDB.HealthValue((ushort)ItemId.MedKit);
            float medkitRegenPerSec = itemDB.RegenPerSecond((ushort)ItemId.MedKit);
            float medkitRegenDur    = itemDB.RegenDuration((ushort)ItemId.MedKit);

            var medkitKey = new LedgerKey { Bank = default, ItemId = (ushort)ItemId.MedKit };

            foreach (var (intentRO, movementRO, healthRW, factionRO, entity) in
                     SystemAPI.Query<RefRO<ReliefIntent>, RefRO<UnitMovement>, RefRW<Health>, RefRO<Faction>>()
                              .WithEntityAccess())
            {
                if (intentRO.ValueRO.Kind != ReliefKind.Heal) continue;
                if (factionRO.ValueRO.Value != FactionType.Player) continue;

                ref var health = ref healthRW.ValueRW;
                if (health.Value >= health.Max) continue;
                if (regenBuffLookup.HasComponent(entity)) continue;

                if (!hexLookup.Lookup.TryGetValue(movementRO.ValueRO.CurrentHex, out var tile)) continue;
                if (!hexOccupantLookup.HasComponent(tile)) continue;
                var building = hexOccupantLookup[tile].Building;
                if (!providesHealLookup.HasComponent(building)) continue;

                medkitKey.Bank = building;
                if (!db.CurrentAmounts.TryGetValue(medkitKey, out var stock) || stock <= 0) continue;

                db.CurrentAmounts[medkitKey] = stock - 1;

                health.Value = math.min(health.Max, health.Value + medkitInstant);

                ecb.AddComponent(entity, new RegenBuff
                {
                    AmountPerSecond = medkitRegenPerSec,
                    TimeRemaining   = medkitRegenDur,
                });
            }
        }
    }
}

using Unity.Entities;

namespace RareIcon
{
    /// <summary>Periodic wood-to-HP conversion for Fishing Boats. Every <see cref="Interval"/> seconds, each damaged boat pulls 1 Log from the Capital's CapitalLedger and restores <see cref="HealPerTick"/> HP. If the Capital has no wood, boats sit damaged — the user's spec: "requires wood for repair, not too much".</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class BoatRepairSystem : SystemBase
    {
        const float Interval    = 5.0f;
        const float HealPerTick = 10f;
        const ushort WoodCost   = 1;

        float _timer;

        protected override void OnCreate()
        {
            RequireForUpdate<FishingBoatTag>();
        }

        protected override void OnUpdate()
        {
            _timer += SystemAPI.Time.DeltaTime;
            if (_timer < Interval) return;
            _timer = 0f;

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!EntityManager.HasBuffer<CapitalLedger>(capital)) return;

            var em = EntityManager;
            var capitalBuf = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();

            foreach (var healthRef in
                     SystemAPI.Query<RefRW<Health>>().WithAll<FishingBoatTag>())
            {
                var h = healthRef.ValueRO;
                if (h.Value >= h.Max) continue;

                if (BankLedgerOps.CountOf(capitalBuf, (ushort)ItemId.Log) < WoodCost)
                    return;

                BankLedgerOps.RemoveItem(ref capitalBuf, (ushort)ItemId.Log, WoodCost);
                h.Value = Unity.Mathematics.math.min(h.Max, h.Value + HealPerTick);
                healthRef.ValueRW = h;
            }
        }
    }
}

using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Ticks any entity carrying a PassiveProduction component — currently only forest-placed Furnaces (free coal stream). Output lands in the Capital treasury (CapitalLedger). WorldClock value-capture pattern same as other production systems.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup), OrderFirst = true)]
    public partial struct PassiveProductionSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<CapitalLedger>(capital)) return;

            state.Dependency = new PassiveTickJob
            {
                Capital       = capital,
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(false),
                Now           = now,
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct PassiveTickJob : IJobEntity
    {
        public Entity Capital;
        public BufferLookup<CapitalLedger> CapitalLookup;
        public float Now;

        public void Execute(ref PassiveProduction prod)
        {
            if (prod.CycleEndsAt == 0f)
            {
                prod.CycleEndsAt = Now + prod.CycleDuration;
                return;
            }

            if (Now < prod.CycleEndsAt) return;

            var storage = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
            BankLedgerOps.AddItem(ref storage, prod.OutputId, prod.OutputAmount, default);
            prod.CycleEndsAt = prod.CycleEndsAt + prod.CycleDuration;
        }
    }
}

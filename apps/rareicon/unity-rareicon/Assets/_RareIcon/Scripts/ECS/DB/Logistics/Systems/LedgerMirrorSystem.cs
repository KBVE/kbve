using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Phase 6: mirrors committed CurrentAmounts back into per-entity DynamicBuffer&lt;*Ledger&gt; views (Capital/Furnace/Farm/Barracks/GoblinCave/Lumbercamp/MiningPit). Walks the keys in PendingDeltas (the subset that changed this frame) and pushes each value to the matching ledger buffer. Sole writer of every bank buffer now that the DB is authoritative.</summary>
    [UpdateInGroup(typeof(LogisticsEndGroup))]
    [UpdateAfter(typeof(PackApplySystem))]
    public partial struct LedgerMirrorSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;

            var dep = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            state.Dependency = new LedgerMirrorJob
            {
                PendingDeltas    = db.PendingDeltas,
                CurrentAmounts   = db.CurrentAmounts,
                CapitalLookup    = SystemAPI.GetBufferLookup<CapitalLedger>(false),
                FurnaceLookup    = SystemAPI.GetBufferLookup<FurnaceLedger>(false),
                FarmLookup       = SystemAPI.GetBufferLookup<FarmLedger>(false),
                BarracksLookup   = SystemAPI.GetBufferLookup<BarracksLedger>(false),
                GoblinCaveLookup = SystemAPI.GetBufferLookup<GoblinCaveLedger>(false),
                LumbercampLookup = SystemAPI.GetBufferLookup<LumbercampLedger>(false),
                MiningPitLookup  = SystemAPI.GetBufferLookup<MiningPitLedger>(false),
            }.Schedule(dep);

            db.PipelineHandle = state.Dependency;
        }
    }

    [BurstCompile]
    public struct LedgerMirrorJob : IJob
    {
        [ReadOnly] public NativeParallelMultiHashMap<LedgerKey, int> PendingDeltas;
        [ReadOnly] public NativeParallelHashMap<LedgerKey, int>      CurrentAmounts;

        public BufferLookup<CapitalLedger>    CapitalLookup;
        public BufferLookup<FurnaceLedger>    FurnaceLookup;
        public BufferLookup<FarmLedger>       FarmLookup;
        public BufferLookup<BarracksLedger>   BarracksLookup;
        public BufferLookup<GoblinCaveLedger> GoblinCaveLookup;
        public BufferLookup<LumbercampLedger> LumbercampLookup;
        public BufferLookup<MiningPitLedger>  MiningPitLookup;

        public void Execute()
        {
            var unique = PendingDeltas.GetUniqueKeyArray(Allocator.Temp);
            var keys = unique.Item1;
            int keyCount = unique.Item2;

            for (int k = 0; k < keyCount; k++)
            {
                var key = keys[k];
                CurrentAmounts.TryGetValue(key, out var amount);

                if (CapitalLookup.HasBuffer(key.Bank))
                {
                    var view = CapitalLookup[key.Bank].Reinterpret<BankLedgerBase>();
                    SetSlotCount(view, key.ItemId, amount);
                }
                else if (FurnaceLookup.HasBuffer(key.Bank))
                {
                    var view = FurnaceLookup[key.Bank].Reinterpret<BankLedgerBase>();
                    SetSlotCount(view, key.ItemId, amount);
                }
                else if (FarmLookup.HasBuffer(key.Bank))
                {
                    var view = FarmLookup[key.Bank].Reinterpret<BankLedgerBase>();
                    SetSlotCount(view, key.ItemId, amount);
                }
                else if (BarracksLookup.HasBuffer(key.Bank))
                {
                    var view = BarracksLookup[key.Bank].Reinterpret<BankLedgerBase>();
                    SetSlotCount(view, key.ItemId, amount);
                }
                else if (GoblinCaveLookup.HasBuffer(key.Bank))
                {
                    var view = GoblinCaveLookup[key.Bank].Reinterpret<BankLedgerBase>();
                    SetSlotCount(view, key.ItemId, amount);
                }
                else if (LumbercampLookup.HasBuffer(key.Bank))
                {
                    var view = LumbercampLookup[key.Bank].Reinterpret<BankLedgerBase>();
                    SetSlotCount(view, key.ItemId, amount);
                }
                else if (MiningPitLookup.HasBuffer(key.Bank))
                {
                    var view = MiningPitLookup[key.Bank].Reinterpret<BankLedgerBase>();
                    SetSlotCount(view, key.ItemId, amount);
                }
            }

            keys.Dispose();
        }

        static void SetSlotCount(DynamicBuffer<BankLedgerBase> buf, ushort itemId, int amount)
        {
            int capped = math.min(amount, (int)ushort.MaxValue);
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].ItemId != itemId) continue;
                var slot = buf[i];
                slot.Count = (ushort)math.max(0, capped);
                buf[i] = slot;
                return;
            }
            if (capped > 0)
            {
                buf.Add(new BankLedgerBase
                {
                    Uid    = default,
                    ItemId = itemId,
                    Count  = (ushort)capped,
                });
            }
        }
    }
}

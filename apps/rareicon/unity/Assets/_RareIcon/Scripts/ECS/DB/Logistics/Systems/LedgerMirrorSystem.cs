using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
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
                BankKindLookup   = SystemAPI.GetComponentLookup<BankKind>(true),
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
        [ReadOnly] public ComponentLookup<BankKind>                  BankKindLookup;

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
                if (!BankKindLookup.HasComponent(key.Bank)) continue;
                CurrentAmounts.TryGetValue(key, out var amount);

                switch ((BankKindId)BankKindLookup[key.Bank].Value)
                {
                    case BankKindId.Capital:
                        SetSlotCount(CapitalLookup[key.Bank].Reinterpret<BankLedgerBase>(), key.ItemId, amount);
                        break;
                    case BankKindId.Furnace:
                        SetSlotCount(FurnaceLookup[key.Bank].Reinterpret<BankLedgerBase>(), key.ItemId, amount);
                        break;
                    case BankKindId.Farm:
                        SetSlotCount(FarmLookup[key.Bank].Reinterpret<BankLedgerBase>(), key.ItemId, amount);
                        break;
                    case BankKindId.Barracks:
                        SetSlotCount(BarracksLookup[key.Bank].Reinterpret<BankLedgerBase>(), key.ItemId, amount);
                        break;
                    case BankKindId.GoblinCave:
                        SetSlotCount(GoblinCaveLookup[key.Bank].Reinterpret<BankLedgerBase>(), key.ItemId, amount);
                        break;
                    case BankKindId.Lumbercamp:
                        SetSlotCount(LumbercampLookup[key.Bank].Reinterpret<BankLedgerBase>(), key.ItemId, amount);
                        break;
                    case BankKindId.MiningPit:
                        SetSlotCount(MiningPitLookup[key.Bank].Reinterpret<BankLedgerBase>(), key.ItemId, amount);
                        break;
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

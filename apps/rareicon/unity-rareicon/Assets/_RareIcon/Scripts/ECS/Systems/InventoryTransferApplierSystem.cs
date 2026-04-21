using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Single-threaded applier for PendingItemTransfer entities. Parallel producers (EmpireDepositSystem, EmpireWithdrawSystem, BuildingSurplusTransferSystem, future producers) emit transfers via ECB.ParallelWriter; this system drains them at the end of EconomySystemGroup and folds each into the Target's bank ledger. Dispatches on whichever ledger type the Target entity carries (CapitalLedger, FurnaceLedger, FarmLedger, BarracksLedger, GoblinCaveLedger) — per-bank typed buffers mean Unity's job-safety system schedules this applier's read/write lanes independently for each bank. Each ledger's buffer is Reinterpret'd to BankLedgerBase so one Apply helper handles them all.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BuildingSurplusTransferSystem))]
    public partial struct InventoryTransferApplierSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<PendingItemTransfer>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            var capitalLookup   = SystemAPI.GetBufferLookup<CapitalLedger>(false);
            var furnaceLookup   = SystemAPI.GetBufferLookup<FurnaceLedger>(false);
            var farmLookup      = SystemAPI.GetBufferLookup<FarmLedger>(false);
            var barracksLookup  = SystemAPI.GetBufferLookup<BarracksLedger>(false);
            var goblinCaveLookup= SystemAPI.GetBufferLookup<GoblinCaveLedger>(false);

            foreach (var (transferRO, entity) in
                     SystemAPI.Query<RefRO<PendingItemTransfer>>().WithEntityAccess())
            {
                var t = transferRO.ValueRO;
                if (t.Delta != 0)
                {
                    if (capitalLookup.HasBuffer(t.Target))
                    {
                        var view = capitalLookup[t.Target].Reinterpret<BankLedgerBase>();
                        Apply(view, t.ItemId, t.Delta);
                    }
                    else if (furnaceLookup.HasBuffer(t.Target))
                    {
                        var view = furnaceLookup[t.Target].Reinterpret<BankLedgerBase>();
                        Apply(view, t.ItemId, t.Delta);
                    }
                    else if (farmLookup.HasBuffer(t.Target))
                    {
                        var view = farmLookup[t.Target].Reinterpret<BankLedgerBase>();
                        Apply(view, t.ItemId, t.Delta);
                    }
                    else if (barracksLookup.HasBuffer(t.Target))
                    {
                        var view = barracksLookup[t.Target].Reinterpret<BankLedgerBase>();
                        Apply(view, t.ItemId, t.Delta);
                    }
                    else if (goblinCaveLookup.HasBuffer(t.Target))
                    {
                        var view = goblinCaveLookup[t.Target].Reinterpret<BankLedgerBase>();
                        Apply(view, t.ItemId, t.Delta);
                    }
                }
                ecb.DestroyEntity(entity);
            }
        }

        static void Apply(DynamicBuffer<BankLedgerBase> buf, ushort itemId, int delta)
        {
            if (delta > 0)
            {
                for (int i = 0; i < buf.Length; i++)
                {
                    if (buf[i].ItemId != itemId) continue;
                    var slot = buf[i];
                    slot.Count = (ushort)math.min(slot.Count + delta, ushort.MaxValue);
                    buf[i] = slot;
                    return;
                }
                buf.Add(new BankLedgerBase
                {
                    Uid    = default,
                    ItemId = itemId,
                    Count  = (ushort)math.min(delta, ushort.MaxValue),
                });
                return;
            }

            int remaining = -delta;
            for (int i = 0; i < buf.Length && remaining > 0; i++)
            {
                if (buf[i].ItemId != itemId) continue;
                var slot = buf[i];
                int take = math.min(slot.Count, remaining);
                slot.Count = (ushort)(slot.Count - take);
                buf[i] = slot;
                remaining -= take;
            }
        }
    }
}

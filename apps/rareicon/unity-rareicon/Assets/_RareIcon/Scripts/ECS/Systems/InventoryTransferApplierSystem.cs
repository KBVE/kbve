using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Sole RW writer of every bank ledger (Capital/Furnace/Farm/Barracks/GoblinCave). Drains BankTransferQueue.Queue in one sequential IJob per frame and applies each transaction to its Target's ledger. Producers enqueue from ScheduleParallel worker threads via NativeQueue&lt;BankTransfer&gt;.ParallelWriter; this system owns the RW BufferLookup for every ledger type, so cross-producer safety races on ledger access are structurally impossible. Runs last in EconomySystemGroup after every producer has committed its writes.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup), OrderLast = true)]
    public partial struct InventoryTransferApplierSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<BankTransferQueue>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var queue = SystemAPI.GetSingleton<BankTransferQueue>().Queue;
            if (queue.Count == 0) return;

            state.Dependency = new ApplyBankTransfersJob
            {
                Queue            = queue,
                CapitalLookup    = SystemAPI.GetBufferLookup<CapitalLedger>(false),
                FurnaceLookup    = SystemAPI.GetBufferLookup<FurnaceLedger>(false),
                FarmLookup       = SystemAPI.GetBufferLookup<FarmLedger>(false),
                BarracksLookup   = SystemAPI.GetBufferLookup<BarracksLedger>(false),
                GoblinCaveLookup = SystemAPI.GetBufferLookup<GoblinCaveLedger>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public struct ApplyBankTransfersJob : IJob
    {
        public NativeQueue<BankTransfer>    Queue;
        public BufferLookup<CapitalLedger>    CapitalLookup;
        public BufferLookup<FurnaceLedger>    FurnaceLookup;
        public BufferLookup<FarmLedger>       FarmLookup;
        public BufferLookup<BarracksLedger>   BarracksLookup;
        public BufferLookup<GoblinCaveLedger> GoblinCaveLookup;

        public void Execute()
        {
            while (Queue.TryDequeue(out var t))
            {
                if (t.Delta == 0) continue;

                if (CapitalLookup.HasBuffer(t.Target))
                {
                    var view = CapitalLookup[t.Target].Reinterpret<BankLedgerBase>();
                    Apply(view, t.ItemId, t.Delta);
                }
                else if (FurnaceLookup.HasBuffer(t.Target))
                {
                    var view = FurnaceLookup[t.Target].Reinterpret<BankLedgerBase>();
                    Apply(view, t.ItemId, t.Delta);
                }
                else if (FarmLookup.HasBuffer(t.Target))
                {
                    var view = FarmLookup[t.Target].Reinterpret<BankLedgerBase>();
                    Apply(view, t.ItemId, t.Delta);
                }
                else if (BarracksLookup.HasBuffer(t.Target))
                {
                    var view = BarracksLookup[t.Target].Reinterpret<BankLedgerBase>();
                    Apply(view, t.ItemId, t.Delta);
                }
                else if (GoblinCaveLookup.HasBuffer(t.Target))
                {
                    var view = GoblinCaveLookup[t.Target].Reinterpret<BankLedgerBase>();
                    Apply(view, t.ItemId, t.Delta);
                }
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

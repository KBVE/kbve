using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Sole RW writer of every bank ledger. Chains one drain job per producer queue so producers run fully in parallel; drain jobs serialize against each other through the ledger BufferLookup RW handles. Reads the combined producer JobHandle from BankTransferQueueSystem and gates the first drain on it.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup), OrderLast = true)]
    public partial class InventoryTransferApplierSystem : SystemBase
    {
        BankTransferQueueSystem _bus;

        protected override void OnCreate()
        {
            _bus = World.GetExistingSystemManaged<BankTransferQueueSystem>()
                ?? World.CreateSystemManaged<BankTransferQueueSystem>();
        }

        protected override void OnUpdate()
        {
            var queues = _bus.Queues;
            if (queues.Count == 0) return;

            var capitalLookup    = SystemAPI.GetBufferLookup<CapitalLedger>(false);
            var furnaceLookup    = SystemAPI.GetBufferLookup<FurnaceLedger>(false);
            var farmLookup       = SystemAPI.GetBufferLookup<FarmLedger>(false);
            var barracksLookup   = SystemAPI.GetBufferLookup<BarracksLedger>(false);
            var goblinCaveLookup = SystemAPI.GetBufferLookup<GoblinCaveLedger>(false);

            var dep = JobHandle.CombineDependencies(Dependency, _bus.GetProducerHandle());

            for (int i = 0; i < queues.Count; i++)
            {
                dep = new ApplyBankTransfersJob
                {
                    Queue            = queues[i],
                    CapitalLookup    = capitalLookup,
                    FurnaceLookup    = furnaceLookup,
                    FarmLookup       = farmLookup,
                    BarracksLookup   = barracksLookup,
                    GoblinCaveLookup = goblinCaveLookup,
                }.Schedule(dep);
            }

            Dependency = dep;
            _bus.ResetProducerHandle();
        }
    }

    [BurstCompile]
    public struct ApplyBankTransfersJob : IJob
    {
        public NativeQueue<BankTransfer>      Queue;
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

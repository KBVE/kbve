using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BarracksProductionSystem))]
    public partial struct BarracksCraftingSystem : ISystem
    {
        NativeQueue<BankTransfer> _queue;

        public void OnCreate(ref SystemState state)
        {
            var bus = state.World.GetExistingSystemManaged<BankTransferQueueSystem>()
                      ?? state.World.CreateSystemManaged<BankTransferQueueSystem>();
            _queue = bus.AllocateProducerQueue();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookupSingleton)) return;

            var craftsmen = new NativeList<CraftsmanStation>(8, Allocator.TempJob);
            foreach (var (intent, movement) in
                     SystemAPI.Query<RefRO<JobIntent>, RefRO<UnitMovement>>().WithAll<JobPriorities>())
            {
                var ji = intent.ValueRO;
                if (ji.Kind != JobKind.Craftsman) continue;
                if (ji.TargetEntity == Entity.Null) continue;
                if (!movement.ValueRO.TargetHex.Equals(movement.ValueRO.CurrentHex)) continue;
                if (movement.ValueRO.DwellTimer > 0f) continue;
                craftsmen.Add(new CraftsmanStation { Barracks = ji.TargetEntity });
            }

            if (craftsmen.Length == 0)
            {
                craftsmen.Dispose();
                return;
            }

            var handle = new BarracksArrowCraftJob
            {
                Craftsmen      = craftsmen.AsDeferredJobArray(),
                BarracksLookup = SystemAPI.GetBufferLookup<BarracksLedger>(true),
                BarracksLkup   = SystemAPI.GetComponentLookup<BarracksTag>(true),
                Queue          = _queue.AsParallelWriter(),
            }.Schedule(state.Dependency);

            state.World.GetExistingSystemManaged<BankTransferQueueSystem>().AddJobHandleForProducer(handle);
            state.Dependency = craftsmen.Dispose(handle);
        }

        struct CraftsmanStation { public Entity Barracks; }

        [BurstCompile]
        partial struct BarracksArrowCraftJob : IJob
        {
            [ReadOnly] public NativeArray<CraftsmanStation>     Craftsmen;
            [ReadOnly] public ComponentLookup<BarracksTag>      BarracksLkup;
            [ReadOnly] public BufferLookup<BarracksLedger>      BarracksLookup;
            public NativeQueue<BankTransfer>.ParallelWriter     Queue;

            public void Execute()
            {
                const ushort WoodLogCost    = 1;
                const ushort NeedleCost     = 1;
                const ushort ArrowsProduced = 5;

                for (int i = 0; i < Craftsmen.Length; i++)
                {
                    var barracks = Craftsmen[i].Barracks;
                    if (!BarracksLkup.HasComponent(barracks)) continue;
                    if (!BarracksLookup.HasBuffer(barracks)) continue;

                    var inv = BarracksLookup[barracks].Reinterpret<BankLedgerBase>();
                    if (BankLedgerOps.CountOf(inv, (ushort)ItemId.WoodLog) < WoodLogCost) continue;
                    if (BankLedgerOps.CountOf(inv, (ushort)ItemId.CactiNeedle) < NeedleCost) continue;

                    Queue.Enqueue(new BankTransfer { Target = barracks, ItemId = (ushort)ItemId.WoodLog,     Delta = -WoodLogCost });
                    Queue.Enqueue(new BankTransfer { Target = barracks, ItemId = (ushort)ItemId.CactiNeedle, Delta = -NeedleCost });
                    Queue.Enqueue(new BankTransfer { Target = barracks, ItemId = (ushort)ItemId.Arrow,       Delta =  ArrowsProduced });
                }
            }
        }
    }
}

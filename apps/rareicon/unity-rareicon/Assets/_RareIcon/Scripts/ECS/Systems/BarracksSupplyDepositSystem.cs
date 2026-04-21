using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Two-phase transport for Looter / Farmer haulers targeting a Barracks. Reads CapitalLedger + BarracksLedger RO; enqueues -Capital / +Barracks BankTransfers via the applier queue. Pack (unit-side) writes happen directly — per-entity, safe.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireSharingSystem))]
    public partial struct BarracksSupplyDepositSystem : ISystem
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
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            var handle = new BarracksSupplyDepositJob
            {
                Capital        = capital,
                HexLookup      = hexLookup.Lookup,
                OccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                BarracksTag    = SystemAPI.GetComponentLookup<BarracksTag>(true),
                ProdLookup     = SystemAPI.GetComponentLookup<BarracksProduction>(true),
                CapLookup      = SystemAPI.GetComponentLookup<StorageCapacity>(true),
                BuildingLookup = SystemAPI.GetComponentLookup<Building>(true),
                PackLookup     = SystemAPI.GetBufferLookup<PackSlot>(false),
                CapitalLookup  = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                BarracksLookup = SystemAPI.GetBufferLookup<BarracksLedger>(true),
                Queue          = _queue.AsParallelWriter(),
            }.Schedule(state.Dependency);

            state.World.GetExistingSystemManaged<BankTransferQueueSystem>().AddJobHandleForProducer(handle);
            state.Dependency = handle;
        }
    }

    [BurstCompile]
    public partial struct BarracksSupplyDepositJob : IJobEntity
    {
        public Entity Capital;

        [ReadOnly] public NativeHashMap<int2, Entity>         HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>        OccupantLookup;
        [ReadOnly] public ComponentLookup<BarracksTag>        BarracksTag;
        [ReadOnly] public ComponentLookup<BarracksProduction> ProdLookup;
        [ReadOnly] public ComponentLookup<StorageCapacity>    CapLookup;
        [ReadOnly] public ComponentLookup<Building>           BuildingLookup;
        [ReadOnly] public BufferLookup<CapitalLedger>         CapitalLookup;
        [ReadOnly] public BufferLookup<BarracksLedger>        BarracksLookup;

        [NativeDisableParallelForRestriction] public BufferLookup<PackSlot> PackLookup;

        public NativeQueue<BankTransfer>.ParallelWriter Queue;

        void Execute(Entity entity, in JobIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != JobKind.Looter) return;
            if (intent.TargetEntity == Entity.Null) return;
            var target = intent.TargetEntity;
            if (!BarracksTag.HasComponent(target)) return;
            if (!CapLookup.HasComponent(target)) return;
            if (!ProdLookup.HasComponent(target)) return;
            if (!BuildingLookup.HasComponent(target)) return;
            if (!PackLookup.HasBuffer(entity)) return;
            if (!BarracksLookup.HasBuffer(target)) return;

            var unitPack = PackLookup[entity];
            var rootHex  = BuildingLookup[target].RootHex;
            var prod     = ProdLookup[target];
            ushort cap   = CapLookup[target].Total;
            var here     = movement.CurrentHex;
            var storage  = BarracksLookup[target].Reinterpret<BankLedgerBase>();

            if (here.Equals(rootHex))
            {
                DepositSupply(ref unitPack, storage, cap, target, ref Queue);
                return;
            }

            if (!IsOnCapital(here)) return;
            if (!CapitalLookup.HasBuffer(Capital)) return;

            int total = BankLedgerOps.TotalCount(storage);
            if (total >= cap) return;

            int coinShortfall = math.max(0, prod.CoinCost - BankLedgerOps.CountOf(storage, (ushort)ItemId.BanditCoin));
            int foodShortfall = math.max(0, prod.FoodCost - FoodItems.Count(storage));

            var capitalInv = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
            if (coinShortfall > 0) TryPickupOne(capitalInv, ref unitPack, (ushort)ItemId.BanditCoin, Capital, ref Queue);
            else if (foodShortfall > 0) TryPickupFood(capitalInv, ref unitPack, Capital, ref Queue);
        }

        bool IsOnCapital(int2 here)
        {
            if (!HexLookup.TryGetValue(here, out var tile)) return false;
            if (!OccupantLookup.HasComponent(tile)) return false;
            return OccupantLookup[tile].Building == Capital;
        }

        static void TryPickupOne(in DynamicBuffer<BankLedgerBase> capInv,
                                 ref DynamicBuffer<PackSlot> unitPack,
                                 ushort itemId,
                                 Entity capital,
                                 ref NativeQueue<BankTransfer>.ParallelWriter q)
        {
            if (BankLedgerOps.CountOf(capInv, itemId) == 0) return;
            q.Enqueue(new BankTransfer { Target = capital, ItemId = itemId, Delta = -1 });
            MergeOrAddPack(ref unitPack, itemId, 1);
        }

        static void TryPickupFood(in DynamicBuffer<BankLedgerBase> capInv,
                                  ref DynamicBuffer<PackSlot> unitPack,
                                  Entity capital,
                                  ref NativeQueue<BankTransfer>.ParallelWriter q)
        {
            for (int i = 0; i < capInv.Length; i++)
            {
                if (capInv[i].Count == 0) continue;
                if (!FoodItems.IsFood(capInv[i].ItemId)) continue;
                ushort id = capInv[i].ItemId;
                q.Enqueue(new BankTransfer { Target = capital, ItemId = id, Delta = -1 });
                MergeOrAddPack(ref unitPack, id, 1);
                return;
            }
        }

        static void DepositSupply(ref DynamicBuffer<PackSlot> unitPack,
                                  in DynamicBuffer<BankLedgerBase> storage,
                                  ushort capacity,
                                  Entity target,
                                  ref NativeQueue<BankTransfer>.ParallelWriter q)
        {
            int remaining = capacity - BankLedgerOps.TotalCount(storage);
            if (remaining <= 0) return;

            for (int i = 0; i < unitPack.Length && remaining > 0; i++)
            {
                if (unitPack[i].Count == 0) continue;
                ushort id = unitPack[i].ItemId;
                if (id != (ushort)ItemId.BanditCoin && !FoodItems.IsFood(id)) continue;

                int take = math.min(unitPack[i].Count, remaining);
                var uslot = unitPack[i];
                uslot.Count = (ushort)(uslot.Count - take);
                unitPack[i] = uslot;
                remaining -= take;
                q.Enqueue(new BankTransfer { Target = target, ItemId = id, Delta = take });
            }
        }

        static void MergeOrAddPack(ref DynamicBuffer<PackSlot> pack, ushort itemId, ushort amount)
        {
            for (int i = 0; i < pack.Length; i++)
            {
                if (pack[i].ItemId == itemId)
                {
                    var slot = pack[i];
                    slot.Count = (ushort)math.min(slot.Count + amount, ushort.MaxValue);
                    pack[i] = slot;
                    return;
                }
            }
            pack.Add(new PackSlot { ItemId = itemId, Count = amount });
        }
    }
}

using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Two-phase transport for Looter / Farmer haulers targeting a Barracks: on the Capital hex with an empty-of-supply pack, pick up 1 BanditCoin or 1 food item from CapitalLedger; on the Barracks root hex, deposit matching carried items into the Barracks' BarracksLedger buffer, respecting StorageCapacity. Burst ISystem — single-worker Schedule keeps shared Capital + Barracks writes safe.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireSharingSystem))]
    public partial struct BarracksSupplyDepositSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            state.Dependency = new BarracksSupplyDepositJob
            {
                Capital        = capital,
                HexLookup      = hexLookup.Lookup,
                OccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                BarracksTag    = SystemAPI.GetComponentLookup<BarracksTag>(true),
                ProdLookup     = SystemAPI.GetComponentLookup<BarracksProduction>(true),
                CapLookup      = SystemAPI.GetComponentLookup<StorageCapacity>(true),
                BuildingLookup = SystemAPI.GetComponentLookup<Building>(true),
                PackLookup     = SystemAPI.GetBufferLookup<PackSlot>(false),
                CapitalLookup  = SystemAPI.GetBufferLookup<CapitalLedger>(false),
                BarracksLookup = SystemAPI.GetBufferLookup<BarracksLedger>(false),
            }.Schedule(state.Dependency);
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

        [NativeDisableParallelForRestriction] public BufferLookup<PackSlot>       PackLookup;
        [NativeDisableParallelForRestriction] public BufferLookup<CapitalLedger>  CapitalLookup;
        [NativeDisableParallelForRestriction] public BufferLookup<BarracksLedger> BarracksLookup;

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
                DepositSupply(ref unitPack, ref storage, cap);
                return;
            }

            if (!IsOnCapital(here)) return;
            if (!CapitalLookup.HasBuffer(Capital)) return;

            int total = BankLedgerOps.TotalCount(storage);
            if (total >= cap) return;

            int coinShortfall = math.max(0, prod.CoinCost - BankLedgerOps.CountOf(storage, (ushort)ItemId.BanditCoin));
            int foodShortfall = math.max(0, prod.FoodCost - FoodItems.Count(storage));

            var capitalInv = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
            if (coinShortfall > 0) TryPickupOne(ref capitalInv, ref unitPack, (ushort)ItemId.BanditCoin);
            else if (foodShortfall > 0) TryPickupFood(ref capitalInv, ref unitPack);
        }

        bool IsOnCapital(int2 here)
        {
            if (!HexLookup.TryGetValue(here, out var tile)) return false;
            if (!OccupantLookup.HasComponent(tile)) return false;
            return OccupantLookup[tile].Building == Capital;
        }

        static void TryPickupOne(ref DynamicBuffer<BankLedgerBase> capInv,
                                 ref DynamicBuffer<PackSlot> unitPack,
                                 ushort itemId)
        {
            if (BankLedgerOps.RemoveItem(ref capInv, itemId, 1) == 0) return;
            MergeOrAddPack(ref unitPack, itemId, 1);
        }

        static void TryPickupFood(ref DynamicBuffer<BankLedgerBase> capInv,
                                  ref DynamicBuffer<PackSlot> unitPack)
        {
            for (int i = 0; i < capInv.Length; i++)
            {
                if (capInv[i].Count == 0) continue;
                if (!FoodItems.IsFood(capInv[i].ItemId)) continue;
                ushort id = capInv[i].ItemId;
                var slot = capInv[i];
                slot.Count -= 1;
                capInv[i] = slot;
                MergeOrAddPack(ref unitPack, id, 1);
                return;
            }
        }

        static void DepositSupply(ref DynamicBuffer<PackSlot> unitPack,
                                  ref DynamicBuffer<BankLedgerBase> storage,
                                  ushort capacity)
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
                BankLedgerOps.AddItem(ref storage, id, (ushort)take, default);
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

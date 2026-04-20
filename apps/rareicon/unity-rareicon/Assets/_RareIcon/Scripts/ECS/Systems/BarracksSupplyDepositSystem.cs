using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Two-phase transport for Looter / Farmer haulers targeting a Barracks: on the Capital hex with an empty-of-supply inventory, pick up 1 BanditCoin or 1 food item; on the Barracks root hex, deposit matching carried items into the Barracks' InventorySlot buffer, respecting StorageCapacity. Burst ISystem — single-worker Schedule keeps shared Capital writes safe before we split into parallel jobs.</summary>
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
                InvLookup      = SystemAPI.GetBufferLookup<InventorySlot>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct BarracksSupplyDepositJob : IJobEntity
    {
        public Entity Capital;

        [ReadOnly] public NativeHashMap<int2, Entity>       HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>      OccupantLookup;
        [ReadOnly] public ComponentLookup<BarracksTag>      BarracksTag;
        [ReadOnly] public ComponentLookup<BarracksProduction> ProdLookup;
        [ReadOnly] public ComponentLookup<StorageCapacity>  CapLookup;
        [ReadOnly] public ComponentLookup<Building>         BuildingLookup;

        [NativeDisableParallelForRestriction]
        public BufferLookup<InventorySlot> InvLookup;

        void Execute(Entity entity, in JobIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != JobKind.Looter) return;
            if (intent.TargetEntity == Entity.Null) return;
            var target = intent.TargetEntity;
            if (!BarracksTag.HasComponent(target)) return;
            if (!CapLookup.HasComponent(target)) return;
            if (!ProdLookup.HasComponent(target)) return;
            if (!BuildingLookup.HasComponent(target)) return;
            if (!InvLookup.HasBuffer(entity)) return;

            var unitInv = InvLookup[entity];
            var rootHex = BuildingLookup[target].RootHex;
            var prod    = ProdLookup[target];
            ushort cap  = CapLookup[target].Total;
            var here    = movement.CurrentHex;

            if (here.Equals(rootHex))
            {
                var storage = InvLookup[target];
                DepositSupply(unitInv, storage, cap);
                return;
            }

            if (!IsOnCapital(here)) return;

            var barracksStorage = InvLookup[target];
            int total = StorageTotal(barracksStorage);
            if (total >= cap) return;

            int coinShortfall = math.max(0, prod.CoinCost - StorageCount(barracksStorage, (ushort)ItemId.BanditCoin));
            int foodShortfall = math.max(0, prod.FoodCost - FoodItems.Count(barracksStorage));

            var capitalInv = InvLookup[Capital];
            if (coinShortfall > 0) TryPickupOne(capitalInv, unitInv, (ushort)ItemId.BanditCoin);
            else if (foodShortfall > 0) TryPickupFood(capitalInv, unitInv);
        }

        bool IsOnCapital(int2 here)
        {
            if (!HexLookup.TryGetValue(here, out var tile)) return false;
            if (!OccupantLookup.HasComponent(tile)) return false;
            return OccupantLookup[tile].Building == Capital;
        }

        static int StorageTotal(DynamicBuffer<InventorySlot> inv)
        {
            int t = 0;
            for (int i = 0; i < inv.Length; i++) t += inv[i].Count;
            return t;
        }

        static int StorageCount(DynamicBuffer<InventorySlot> inv, ushort itemId)
        {
            int t = 0;
            for (int i = 0; i < inv.Length; i++)
                if (inv[i].ItemId == itemId) t += inv[i].Count;
            return t;
        }

        static void TryPickupOne(DynamicBuffer<InventorySlot> capInv,
                                 DynamicBuffer<InventorySlot> unitInv,
                                 ushort itemId)
        {
            for (int i = 0; i < capInv.Length; i++)
            {
                if (capInv[i].ItemId != itemId || capInv[i].Count == 0) continue;
                var slot = capInv[i];
                slot.Count -= 1;
                capInv[i] = slot;
                MergeOrAdd(unitInv, itemId, 1);
                return;
            }
        }

        static void TryPickupFood(DynamicBuffer<InventorySlot> capInv,
                                  DynamicBuffer<InventorySlot> unitInv)
        {
            for (int i = 0; i < capInv.Length; i++)
            {
                if (capInv[i].Count == 0) continue;
                if (!FoodItems.IsFood(capInv[i].ItemId)) continue;
                ushort id = capInv[i].ItemId;
                var slot = capInv[i];
                slot.Count -= 1;
                capInv[i] = slot;
                MergeOrAdd(unitInv, id, 1);
                return;
            }
        }

        static void DepositSupply(DynamicBuffer<InventorySlot> unitInv,
                                  DynamicBuffer<InventorySlot> storage,
                                  ushort capacity)
        {
            int remaining = capacity - StorageTotal(storage);
            if (remaining <= 0) return;

            for (int i = 0; i < unitInv.Length && remaining > 0; i++)
            {
                if (unitInv[i].Count == 0) continue;
                ushort id = unitInv[i].ItemId;
                if (id != (ushort)ItemId.BanditCoin && !FoodItems.IsFood(id)) continue;

                int take = math.min(unitInv[i].Count, remaining);
                var uslot = unitInv[i];
                uslot.Count = (ushort)(uslot.Count - take);
                unitInv[i] = uslot;
                remaining -= take;
                MergeOrAdd(storage, id, (ushort)take);
            }
        }

        static void MergeOrAdd(DynamicBuffer<InventorySlot> inv, ushort itemId, ushort amount)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].ItemId == itemId)
                {
                    var slot = inv[i];
                    slot.Count = (ushort)math.min(slot.Count + amount, ushort.MaxValue);
                    inv[i] = slot;
                    return;
                }
            }
            inv.Add(new InventorySlot { ItemId = itemId, Count = amount });
        }
    }
}

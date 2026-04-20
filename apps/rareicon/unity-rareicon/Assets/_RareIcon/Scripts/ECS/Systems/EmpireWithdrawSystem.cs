using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Hungry Player unit on a Capital-claimed hex pulls one edible from storage into its inventory. Burst ISystem off the main thread — single-worker Schedule keeps the shared Capital-buffer writes serialized until the claim system lands.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireDepositSystem))]
    public partial struct EmpireWithdrawSystem : ISystem
    {
        const float HungerTrigger = 0.50f;

        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            state.Dependency = new EmpireWithdrawJob
            {
                Capital        = capital,
                HexLookup      = hexLookup.Lookup,
                OccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                InvLookup      = SystemAPI.GetBufferLookup<InventorySlot>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct EmpireWithdrawJob : IJobEntity
    {
        const float HungerTrigger = 0.50f;

        public Entity Capital;

        [ReadOnly] public NativeHashMap<int2, Entity>  HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant> OccupantLookup;

        [NativeDisableParallelForRestriction]
        public BufferLookup<InventorySlot> InvLookup;

        void Execute(Entity entity, in UnitMovement movement, in Faction faction, in Hunger hunger)
        {
            if (faction.Value != FactionType.Player) return;
            if (hunger.Max <= 0f) return;
            if (hunger.Value / hunger.Max < HungerTrigger) return;
            if (!InvLookup.HasBuffer(entity)) return;

            var unitInv = InvLookup[entity];
            if (HasEdible(unitInv)) return;

            if (!HexLookup.TryGetValue(movement.CurrentHex, out var tile)) return;
            if (!OccupantLookup.HasComponent(tile)) return;
            if (OccupantLookup[tile].Building != Capital) return;

            var storage = InvLookup[Capital];
            PullOneFoodItem(storage, unitInv);
        }

        static bool HasEdible(in DynamicBuffer<InventorySlot> inv)
        {
            for (int i = 0; i < inv.Length; i++)
                if (inv[i].Count > 0 && FoodItems.IsFood(inv[i].ItemId)) return true;
            return false;
        }

        static void PullOneFoodItem(DynamicBuffer<InventorySlot> storage,
                                    DynamicBuffer<InventorySlot> unitInv)
        {
            for (int i = 0; i < storage.Length; i++)
            {
                var slot = storage[i];
                if (slot.Count == 0 || !FoodItems.IsFood(slot.ItemId)) continue;

                slot.Count -= 1;
                storage[i] = slot;

                for (int j = 0; j < unitInv.Length; j++)
                {
                    if (unitInv[j].ItemId == slot.ItemId)
                    {
                        var u = unitInv[j];
                        u.Count = (ushort)math.min(u.Count + 1, ushort.MaxValue);
                        unitInv[j] = u;
                        return;
                    }
                }
                unitInv.Add(new InventorySlot { ItemId = slot.ItemId, Count = 1 });
                return;
            }
        }
    }
}

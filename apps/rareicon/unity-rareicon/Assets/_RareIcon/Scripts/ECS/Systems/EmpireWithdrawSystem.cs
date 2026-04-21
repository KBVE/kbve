using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Hungry Player unit on a Capital-claimed hex pulls one edible from storage into its inventory. Parallel Burst job — unit inventory grows directly (per-entity write), Capital subtract queues through a PendingItemTransfer for InventoryTransferApplierSystem. Because the subtract is deferred, two parallel withdraws on the last food item will both succeed locally and the applier clamps the total; practical effect is a one-tick over-serve at near-starvation, which is cheaper than dragging in the full reservation/claim path.</summary>
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
            if (!SystemAPI.HasBuffer<InventorySlot>(capital)) return;

            var capitalInv = SystemAPI.GetBuffer<InventorySlot>(capital);
            var snapshot = new NativeList<FoodSlotSnapshot>(capitalInv.Length, Allocator.TempJob);
            for (int i = 0; i < capitalInv.Length; i++)
            {
                if (capitalInv[i].Count == 0) continue;
                if (!FoodItems.IsFood(capitalInv[i].ItemId)) continue;
                snapshot.Add(new FoodSlotSnapshot { ItemId = capitalInv[i].ItemId });
            }

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            ItemDBSingleton itemDb = default;
            if (SystemAPI.HasSingleton<ItemDBSingleton>())
                itemDb = SystemAPI.GetSingleton<ItemDBSingleton>();

            state.Dependency = new EmpireWithdrawJob
            {
                Capital         = capital,
                HexLookup       = hexLookup.Lookup,
                OccupantLookup  = SystemAPI.GetComponentLookup<HexOccupant>(true),
                CapitalFoods    = snapshot.AsDeferredJobArray(),
                ItemDb          = itemDb,
                Ecb             = ecb,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = snapshot.Dispose(state.Dependency);
        }
    }

    public struct FoodSlotSnapshot
    {
        public ushort ItemId;
    }

    [BurstCompile]
    public partial struct EmpireWithdrawJob : IJobEntity
    {
        const float HungerTrigger = 0.50f;

        public Entity Capital;

        [ReadOnly] public NativeHashMap<int2, Entity>  HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant> OccupantLookup;
        [ReadOnly] public NativeArray<FoodSlotSnapshot> CapitalFoods;
        [ReadOnly] public ItemDBSingleton ItemDb;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute([ChunkIndexInQuery] int chunkIdx,
                     in UnitMovement movement,
                     in Faction faction,
                     in Hunger hunger,
                     ref DynamicBuffer<PackSlot> unitPack,
                     in DynamicBuffer<EquippedBag> bags)
        {
            if (faction.Value != FactionType.Player) return;
            if (hunger.Max <= 0f || hunger.Value / hunger.Max < HungerTrigger) return;
            if (HasEdible(unitPack)) return;
            if (CapitalFoods.Length == 0) return;

            if (!HexLookup.TryGetValue(movement.CurrentHex, out var tile)) return;
            if (!OccupantLookup.HasComponent(tile)) return;
            if (OccupantLookup[tile].Building != Capital) return;

            ushort take = CapitalFoods[0].ItemId;

            ushort added = unitPack.AddItemCapped(bags, ItemDb, take, 1);
            if (added == 0) return;

            var req = Ecb.CreateEntity(chunkIdx);
            Ecb.AddComponent(chunkIdx, req, new PendingItemTransfer
            {
                Target = Capital,
                ItemId = take,
                Delta  = (sbyte)-added,
            });
        }

        static bool HasEdible(in DynamicBuffer<PackSlot> inv)
        {
            for (int i = 0; i < inv.Length; i++)
                if (inv[i].Count > 0 && FoodItems.IsFood(inv[i].ItemId)) return true;
            return false;
        }
    }
}

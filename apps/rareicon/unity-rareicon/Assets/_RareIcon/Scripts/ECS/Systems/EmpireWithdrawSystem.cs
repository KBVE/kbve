using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Hungry Player unit on a Capital-claimed hex pulls one edible from storage into its inventory. Parallel Burst job — unit inventory grows directly (per-entity write), Capital subtract queues through a PendingItemTransfer for InventoryTransferApplierSystem. Snapshot build is itself a Burst IJob so the Capital InventorySlot read participates in the job dep graph and can't race SurplusTransferJob or any other InventorySlot writer.</summary>
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
            if (!SystemAPI.TryGetSingleton<ItemDBSingleton>(out var itemDb)) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            var snapshot = new NativeList<FoodSlotSnapshot>(8, Allocator.TempJob);

            var snapshotHandle = new CapitalFoodSnapshotJob
            {
                Capital  = capital,
                InvLookup = SystemAPI.GetBufferLookup<InventorySlot>(true),
                Snapshot = snapshot,
            }.Schedule(state.Dependency);

            state.Dependency = new EmpireWithdrawJob
            {
                Capital         = capital,
                HexLookup       = hexLookup.Lookup,
                OccupantLookup  = SystemAPI.GetComponentLookup<HexOccupant>(true),
                CapitalFoods    = snapshot.AsDeferredJobArray(),
                ItemDb          = itemDb,
                Ecb             = ecb,
            }.ScheduleParallel(snapshotHandle);

            state.Dependency = snapshot.Dispose(state.Dependency);
        }
    }

    public struct FoodSlotSnapshot
    {
        public ushort ItemId;
    }

    /// <summary>Burst IJob that reads Capital.InventorySlot via BufferLookup (tracked by the scheduler) and emits one FoodSlotSnapshot per non-zero food slot into a deferred NativeList. Replaces the main-thread snapshot loop that was racing BuildingSurplusTransferSystem's writer.</summary>
    [BurstCompile]
    public struct CapitalFoodSnapshotJob : IJob
    {
        public Entity Capital;
        [ReadOnly] public BufferLookup<InventorySlot> InvLookup;
        public NativeList<FoodSlotSnapshot> Snapshot;

        public void Execute()
        {
            if (!InvLookup.HasBuffer(Capital)) return;
            var inv = InvLookup[Capital];
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count == 0) continue;
                if (!FoodItems.IsFood(inv[i].ItemId)) continue;
                Snapshot.Add(new FoodSlotSnapshot { ItemId = inv[i].ItemId });
            }
        }
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

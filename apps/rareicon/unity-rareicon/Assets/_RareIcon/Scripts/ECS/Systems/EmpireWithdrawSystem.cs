using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Hungry Player unit on a Capital-claimed hex submits a Pickup reservation for one edible item from Capital. PackApplySystem credits the pack once resolver grants.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireDepositSystem))]
    public partial struct EmpireWithdrawSystem : ISystem
    {
        const float HungerTrigger = 0.50f;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;
            if (!SystemAPI.HasBuffer<CapitalLedger>(capital)) return;
            if (!SystemAPI.TryGetSingleton<ItemDBSingleton>(out var itemDb)) return;

            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            var snapshot = new NativeList<FoodSlotSnapshot>(8, Allocator.TempJob);

            var snapshotHandle = new CapitalFoodSnapshotJob
            {
                Capital   = capital,
                InvLookup = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                Snapshot  = snapshot,
            }.Schedule(state.Dependency);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep = JobHandle.CombineDependencies(snapshotHandle, db.PipelineHandle);

            var handle = new EmpireWithdrawJob
            {
                Capital        = capital,
                Tick           = tick,
                HexLookup      = hexLookup.Lookup,
                OccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                CapitalFoods   = snapshot.AsDeferredJobArray(),
                ItemDb         = itemDb,
                Reservations   = db.Reservations.AsParallelWriter(),
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency = snapshot.Dispose(handle);
        }
    }

    public struct FoodSlotSnapshot
    {
        public ushort ItemId;
    }

    /// <summary>Burst IJob that reads Capital.CapitalLedger and emits one FoodSlotSnapshot per non-zero food slot.</summary>
    [BurstCompile]
    public struct CapitalFoodSnapshotJob : IJob
    {
        public Entity Capital;
        [ReadOnly] public BufferLookup<CapitalLedger> InvLookup;
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
        public uint   Tick;

        [ReadOnly] public NativeHashMap<int2, Entity>  HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant> OccupantLookup;
        [ReadOnly] public NativeArray<FoodSlotSnapshot> CapitalFoods;
        [ReadOnly] public ItemDBSingleton ItemDb;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity,
                     in UnitMovement movement,
                     in Faction faction,
                     in Hunger hunger,
                     in DynamicBuffer<PackSlot> unitPack)
        {
            if (faction.Value != FactionType.Player) return;
            if (hunger.Max <= 0f || hunger.Value / hunger.Max < HungerTrigger) return;
            if (HasEdible(unitPack)) return;
            if (CapitalFoods.Length == 0) return;

            if (!HexLookup.TryGetValue(movement.CurrentHex, out var tile)) return;
            if (!OccupantLookup.HasComponent(tile)) return;
            if (OccupantLookup[tile].Building != Capital) return;

            ushort take = CapitalFoods[0].ItemId;

            Reservations.Add(ReservationOps.Key(Capital, take), ReservationOps.Pickup(entity, 1, Tick));
        }

        static bool HasEdible(in DynamicBuffer<PackSlot> inv)
        {
            for (int i = 0; i < inv.Length; i++)
                if (inv[i].Count > 0 && FoodItems.IsFood(inv[i].ItemId)) return true;
            return false;
        }
    }
}

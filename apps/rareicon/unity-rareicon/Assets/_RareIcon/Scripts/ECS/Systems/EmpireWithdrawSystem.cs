using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Hungry Player unit on any ProvidesFood-tagged building footprint submits a Pickup reservation for one edible item from that building's ledger. Works for Capital/Farm/Inn via per-type BufferLookup branching. PackApplySystem credits the pack once resolver grants.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireDepositSystem))]
    public partial struct EmpireWithdrawSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexLookup)) return;

            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new EmpireWithdrawJob
            {
                Tick                = tick,
                HexLookup           = hexLookup.Lookup,
                OccupantLookup      = SystemAPI.GetComponentLookup<HexOccupant>(true),
                BuildingLookup      = SystemAPI.GetComponentLookup<Building>(true),
                ProvidesFoodLookup  = SystemAPI.GetComponentLookup<ProvidesFood>(true),
                CapitalLedgerLookup = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                FarmLedgerLookup    = SystemAPI.GetBufferLookup<FarmLedger>(true),
                InnLedgerLookup     = SystemAPI.GetBufferLookup<InnLedger>(true),
                Reservations        = db.Reservations.AsParallelWriter(),
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    public partial struct EmpireWithdrawJob : IJobEntity
    {
        const float HungerTrigger = 0.50f;

        public uint Tick;

        [ReadOnly] public NativeHashMap<int2, Entity>       HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>      OccupantLookup;
        [ReadOnly] public ComponentLookup<Building>         BuildingLookup;
        [ReadOnly] public ComponentLookup<ProvidesFood>     ProvidesFoodLookup;
        [ReadOnly] public BufferLookup<CapitalLedger>       CapitalLedgerLookup;
        [ReadOnly] public BufferLookup<FarmLedger>          FarmLedgerLookup;
        [ReadOnly] public BufferLookup<InnLedger>           InnLedgerLookup;

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

            if (!HexLookup.TryGetValue(movement.CurrentHex, out var tile)) return;
            if (!OccupantLookup.HasComponent(tile)) return;

            Entity building = OccupantLookup[tile].Building;
            if (!ProvidesFoodLookup.HasComponent(building)) return;
            if (!BuildingLookup.HasComponent(building)) return;

            byte type = BuildingLookup[building].Type;
            if (!TryFirstFood(type, building, out ushort takeId)) return;

            Reservations.Add(ReservationOps.Key(building, takeId), ReservationOps.Pickup(entity, 1, Tick));
        }

        bool TryFirstFood(byte type, Entity building, out ushort itemId)
        {
            itemId = 0;
            switch (type)
            {
                case BuildingType.Capital:
                    if (!CapitalLedgerLookup.HasBuffer(building)) return false;
                    return FirstFoodIn(CapitalLedgerLookup[building].Reinterpret<BankLedgerBase>(), out itemId);
                case BuildingType.Farm:
                    if (!FarmLedgerLookup.HasBuffer(building)) return false;
                    return FirstFoodIn(FarmLedgerLookup[building].Reinterpret<BankLedgerBase>(), out itemId);
                case BuildingType.Inn:
                    if (!InnLedgerLookup.HasBuffer(building)) return false;
                    return FirstFoodIn(InnLedgerLookup[building].Reinterpret<BankLedgerBase>(), out itemId);
                default:
                    return false;
            }
        }

        static bool FirstFoodIn(DynamicBuffer<BankLedgerBase> buf, out ushort itemId)
        {
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                if (!FoodItems.IsFood(buf[i].ItemId)) continue;
                itemId = buf[i].ItemId;
                return true;
            }
            itemId = 0;
            return false;
        }

        static bool HasEdible(in DynamicBuffer<PackSlot> inv)
        {
            for (int i = 0; i < inv.Length; i++)
                if (inv[i].Count > 0 && FoodItems.IsFood(inv[i].ItemId)) return true;
            return false;
        }
    }
}

using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    public static class ArcherRefillConfig
    {
        public const ushort QuiverMax = 20;
    }

    /// <summary>Player-faction RangedAttack units on a Capital- or Barracks-owned hex submit a Refill reservation against that bank's ledger up to QuiverMax; PackApplySystem credits the pack once resolver grants.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireDepositSystem))]
    public partial struct ArcherRefillSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexLookup)) return;

            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new ArcherRefillJob
            {
                HexLookup         = hexLookup.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                BuildingLookup    = SystemAPI.GetComponentLookup<Building>(true),
                CapitalLookup     = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                BarracksLookup    = SystemAPI.GetBufferLookup<BarracksLedger>(true),
                Reservations      = db.Reservations.AsParallelWriter(),
                Tick              = tick,
            }.Schedule(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    public partial struct ArcherRefillJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity> HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant> HexOccupantLookup;
        [ReadOnly] public ComponentLookup<Building>    BuildingLookup;
        [ReadOnly] public BufferLookup<CapitalLedger>  CapitalLookup;
        [ReadOnly] public BufferLookup<BarracksLedger> BarracksLookup;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        public uint Tick;

        void Execute(Entity entity, in RangedAttack attack, in Faction faction, in UnitMovement movement, in DynamicBuffer<PackSlot> pack)
        {
            if (faction.Value != FactionType.Player) return;
            byte pt = attack.ProjectileType;
            if (pt != ProjectileType.Arrow && pt != ProjectileType.Bolt) return;

            int carrying = CountOfPack(pack, (ushort)ItemId.Arrow);
            if (carrying >= ArcherRefillConfig.QuiverMax) return;

            if (!HexLookup.TryGetValue(movement.CurrentHex, out Entity tile)) return;
            if (!HexOccupantLookup.HasComponent(tile)) return;

            Entity building = HexOccupantLookup[tile].Building;
            if (!BuildingLookup.HasComponent(building)) return;
            byte btype = BuildingLookup[building].Type;

            DynamicBuffer<BankLedgerBase> storage;
            if (btype == BuildingType.Capital && CapitalLookup.HasBuffer(building))
                storage = CapitalLookup[building].Reinterpret<BankLedgerBase>();
            else if (btype == BuildingType.Barracks && BarracksLookup.HasBuffer(building))
                storage = BarracksLookup[building].Reinterpret<BankLedgerBase>();
            else return;

            int available = BankLedgerOps.CountOf(storage, (ushort)ItemId.Arrow);
            if (available <= 0) return;

            int room = ArcherRefillConfig.QuiverMax - carrying;
            int transfer = math.min(room, available);
            if (transfer <= 0) return;

            Reservations.Add(ReservationOps.Key(building, (ushort)ItemId.Arrow), ReservationOps.Refill(entity, transfer, Tick));
        }

        static int CountOfPack(in DynamicBuffer<PackSlot> buf, ushort itemId)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
                if (buf[i].ItemId == itemId) total += buf[i].Count;
            return total;
        }
    }
}

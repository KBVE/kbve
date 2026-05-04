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

            int carrying = CountAnyArrow(pack);
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

            int room = ArcherRefillConfig.QuiverMax - carrying;
            if (room <= 0) return;

            ReserveTier(storage, building, entity, (ushort)ItemId.StoneheadArrow, ref room);
            if (room <= 0) return;
            ReserveTier(storage, building, entity, (ushort)ItemId.NeedleArrow,    ref room);
            if (room <= 0) return;
            ReserveTier(storage, building, entity, (ushort)ItemId.Arrow,          ref room);
        }

        void ReserveTier(in DynamicBuffer<BankLedgerBase> storage, Entity building, Entity unit, ushort itemId, ref int room)
        {
            int available = BankLedgerOps.CountOf(storage, itemId);
            if (available <= 0) return;
            int transfer = math.min(room, available);
            if (transfer <= 0) return;
            Reservations.Add(ReservationOps.Key(building, itemId), ReservationOps.Refill(unit, transfer, Tick));
            room -= transfer;
        }

        static int CountAnyArrow(in DynamicBuffer<PackSlot> buf)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
                if (AmmoOps.IsArrow(buf[i].ItemId)) total += buf[i].Count;
            return total;
        }
    }
}

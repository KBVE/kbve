using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Two-phase transport for Looter / Farmer haulers targeting a Barracks. On Barracks root hex: pre-debit pack + Deposit reservations. On Capital hex: Pickup reservations for one coin or one food to cover shortfall.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireSharingSystem))]
    public partial struct BarracksSupplyDepositSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new BarracksSupplyDepositJob
            {
                Capital        = capital,
                Tick           = tick,
                HexLookup      = hexLookup.Lookup,
                OccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                BarracksTag    = SystemAPI.GetComponentLookup<BarracksTag>(true),
                ProdLookup     = SystemAPI.GetComponentLookup<BarracksProduction>(true),
                CapLookup      = SystemAPI.GetComponentLookup<StorageCapacity>(true),
                BuildingLookup = SystemAPI.GetComponentLookup<Building>(true),
                PackLookup     = SystemAPI.GetBufferLookup<PackSlot>(false),
                CapitalLookup  = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                BarracksLookup = SystemAPI.GetBufferLookup<BarracksLedger>(true),
                Reservations   = db.Reservations.AsParallelWriter(),
            }.Schedule(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    public partial struct BarracksSupplyDepositJob : IJobEntity
    {
        public Entity Capital;
        public uint   Tick;

        [ReadOnly] public NativeHashMap<int2, Entity>         HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>        OccupantLookup;
        [ReadOnly] public ComponentLookup<BarracksTag>        BarracksTag;
        [ReadOnly] public ComponentLookup<BarracksProduction> ProdLookup;
        [ReadOnly] public ComponentLookup<StorageCapacity>    CapLookup;
        [ReadOnly] public ComponentLookup<Building>           BuildingLookup;
        [ReadOnly] public BufferLookup<CapitalLedger>         CapitalLookup;
        [ReadOnly] public BufferLookup<BarracksLedger>        BarracksLookup;

        [NativeDisableParallelForRestriction] public BufferLookup<PackSlot> PackLookup;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

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
                DepositSupply(ref unitPack, storage, cap, target, entity, Tick, ref Reservations);
                return;
            }

            if (!IsOnCapital(here)) return;
            if (!CapitalLookup.HasBuffer(Capital)) return;

            int total = BankLedgerOps.TotalCount(storage);
            if (total >= cap) return;

            int coinShortfall = math.max(0, prod.CoinCost - BankLedgerOps.CountOf(storage, (ushort)ItemId.BanditCoin));
            int foodShortfall = math.max(0, prod.FoodCost - FoodItems.Count(storage));

            var capitalInv = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
            if (coinShortfall > 0)      TryReserveOne(capitalInv, (ushort)ItemId.BanditCoin, Capital, entity, Tick, ref Reservations);
            else if (foodShortfall > 0) TryReserveFood(capitalInv, Capital, entity, Tick, ref Reservations);
        }

        bool IsOnCapital(int2 here)
        {
            if (!HexLookup.TryGetValue(here, out var tile)) return false;
            if (!OccupantLookup.HasComponent(tile)) return false;
            return OccupantLookup[tile].Building == Capital;
        }

        static void TryReserveOne(in DynamicBuffer<BankLedgerBase> capInv,
                                  ushort itemId,
                                  Entity capital,
                                  Entity requester,
                                  uint tick,
                                  ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter reservations)
        {
            if (BankLedgerOps.CountOf(capInv, itemId) == 0) return;
            reservations.Add(ReservationOps.Key(capital, itemId), ReservationOps.Pickup(requester, 1, tick));
        }

        static void TryReserveFood(in DynamicBuffer<BankLedgerBase> capInv,
                                   Entity capital,
                                   Entity requester,
                                   uint tick,
                                   ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter reservations)
        {
            for (int i = 0; i < capInv.Length; i++)
            {
                if (capInv[i].Count == 0) continue;
                if (!FoodItems.IsFood(capInv[i].ItemId)) continue;
                reservations.Add(ReservationOps.Key(capital, capInv[i].ItemId), ReservationOps.Pickup(requester, 1, tick));
                return;
            }
        }

        static void DepositSupply(ref DynamicBuffer<PackSlot> unitPack,
                                  in DynamicBuffer<BankLedgerBase> storage,
                                  ushort capacity,
                                  Entity target,
                                  Entity requester,
                                  uint tick,
                                  ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter reservations)
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
                reservations.Add(ReservationOps.Key(target, id), ReservationOps.Deposit(requester, take, tick));
            }
        }
    }
}

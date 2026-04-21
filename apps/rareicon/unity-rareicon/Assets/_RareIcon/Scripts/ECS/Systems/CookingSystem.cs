using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Chef units on the Capital convert one raw wildlife drop → cooked per tick, awarding Culinary XP. Reads Capital ledger RO, submits Consume/Produce reservation pair on the Capital key.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BuilderDepositSystem))]
    public partial struct CookingSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<CapitalLedger>(capital)) return;
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookupSingleton)) return;

            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new CookingJob
            {
                Capital           = capital,
                HexLookup         = hexLookupSingleton.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                CapitalLookup     = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                SkillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(false),
                Reservations      = db.Reservations.AsParallelWriter(),
                Tick              = tick,
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    public partial struct CookingJob : IJobEntity
    {
        const ushort XPPerCook = 15;

        public Entity Capital;

        [ReadOnly] public NativeHashMap<int2, Entity>   HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>  HexOccupantLookup;
        [ReadOnly] public BufferLookup<CapitalLedger>   CapitalLookup;

        [NativeDisableParallelForRestriction] public ComponentLookup<SkillXP> SkillXpLookup;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        public uint Tick;

        void Execute(Entity entity, in JobIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != JobKind.Chef) return;
            if (!IsOnCapital(movement.CurrentHex)) return;
            if (!CapitalLookup.HasBuffer(Capital)) return;

            var inv = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
            if (!TryQueueCook(ref Reservations, Capital, inv, Tick)) return;

            if (SkillXpLookup.HasComponent(entity))
            {
                var xp = SkillXpLookup[entity];
                int next = xp.Get(SkillKind.Culinary) + XPPerCook;
                xp.Set(SkillKind.Culinary, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                SkillXpLookup[entity] = xp;
            }
        }

        bool IsOnCapital(int2 unitHex)
        {
            if (!HexLookup.TryGetValue(unitHex, out var tile)) return false;
            if (!HexOccupantLookup.HasComponent(tile)) return false;
            return HexOccupantLookup[tile].Building == Capital;
        }

        static bool TryQueueCook(ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res, Entity capital, in DynamicBuffer<BankLedgerBase> inv, uint tick)
        {
            return TryConvert(ref res, capital, inv, (ushort)ItemId.RawChicken, (ushort)ItemId.CookedChicken, tick)
                || TryConvert(ref res, capital, inv, (ushort)ItemId.RawMutton,  (ushort)ItemId.CookedMutton,  tick)
                || TryConvert(ref res, capital, inv, (ushort)ItemId.RawBeef,    (ushort)ItemId.CookedBeef,    tick)
                || TryConvert(ref res, capital, inv, (ushort)ItemId.Egg,        (ushort)ItemId.CookedEgg,     tick)
                || TryConvert(ref res, capital, inv, (ushort)ItemId.Milk,       (ushort)ItemId.Cheese,        tick);
        }

        static bool TryConvert(ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res, Entity capital, in DynamicBuffer<BankLedgerBase> inv, ushort rawId, ushort cookedId, uint tick)
        {
            if (BankLedgerOps.CountOf(inv, rawId) == 0) return false;
            res.Add(ReservationOps.Key(capital, rawId),    ReservationOps.Consume(capital, 1, tick));
            res.Add(ReservationOps.Key(capital, cookedId), ReservationOps.Produce(capital, 1, tick));
            return true;
        }
    }
}

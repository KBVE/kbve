using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BarracksProductionSystem))]
    public partial struct BarracksCraftingSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexLookupSingleton)) return;

            var craftsmen = new NativeList<CraftsmanStation>(8, Allocator.TempJob);
            foreach (var (intent, movement) in
                     SystemAPI.Query<RefRO<ProfessionIntent>, RefRO<UnitMovement>>().WithAll<ProfessionPriorities>())
            {
                var ji = intent.ValueRO;
                if (ji.Kind != ProfessionKind.Craftsman) continue;
                if (ji.TargetEntity == Entity.Null) continue;
                if (!movement.ValueRO.TargetHex.Equals(movement.ValueRO.CurrentHex)) continue;
                if (movement.ValueRO.DwellTimer > 0f) continue;
                craftsmen.Add(new CraftsmanStation { Barracks = ji.TargetEntity });
            }

            if (craftsmen.Length == 0)
            {
                craftsmen.Dispose();
                return;
            }

            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new BarracksArrowCraftJob
            {
                Craftsmen      = craftsmen.AsDeferredJobArray(),
                BarracksLookup = SystemAPI.GetBufferLookup<BarracksLedger>(true),
                BarracksLkup   = SystemAPI.GetComponentLookup<BarracksTag>(true),
                Reservations   = db.Reservations.AsParallelWriter(),
                Tick           = tick,
            }.Schedule(dep);

            db.PipelineHandle = handle;
            state.Dependency  = craftsmen.Dispose(handle);
        }

        struct CraftsmanStation { public Entity Barracks; }

        [BurstCompile]
        partial struct BarracksArrowCraftJob : IJob
        {
            [ReadOnly] public NativeArray<CraftsmanStation> Craftsmen;
            [ReadOnly] public ComponentLookup<BarracksTag>  BarracksLkup;
            [ReadOnly] public BufferLookup<BarracksLedger>  BarracksLookup;
            public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
            public uint Tick;

            public void Execute()
            {
                const ushort WoodLogCost           = 1;
                const ushort NeedleCost            = 1;
                const ushort ArrowsBasic           = 5;  // log-only fallback so production never stalls
                const ushort ArrowsTipped          = 12; // log + cacti needle (premium) — rewards full chain

                const ushort HerbCost        = 3;
                const ushort MedKitsProduced = 1;

                for (int i = 0; i < Craftsmen.Length; i++)
                {
                    var barracks = Craftsmen[i].Barracks;
                    if (!BarracksLkup.HasComponent(barracks)) continue;
                    if (!BarracksLookup.HasBuffer(barracks)) continue;

                    var inv = BarracksLookup[barracks].Reinterpret<BankLedgerBase>();

                    if (BankLedgerOps.CountOf(inv, (ushort)ItemId.Log) >= WoodLogCost)
                    {
                        bool hasNeedle = BankLedgerOps.CountOf(inv, (ushort)ItemId.CactiNeedle) >= NeedleCost;
                        ushort produced = hasNeedle ? ArrowsTipped : ArrowsBasic;

                        Reservations.Add(ReservationOps.Key(barracks, (ushort)ItemId.Log),   ReservationOps.Consume(barracks, WoodLogCost, Tick));
                        if (hasNeedle)
                            Reservations.Add(ReservationOps.Key(barracks, (ushort)ItemId.CactiNeedle), ReservationOps.Consume(barracks, NeedleCost, Tick));
                        Reservations.Add(ReservationOps.Key(barracks, (ushort)ItemId.Arrow), ReservationOps.Produce(barracks, produced, Tick));
                    }

                    if (BankLedgerOps.CountOf(inv, (ushort)ItemId.Herb) >= HerbCost)
                    {
                        Reservations.Add(ReservationOps.Key(barracks, (ushort)ItemId.Herb),   ReservationOps.Consume(barracks, HerbCost,        Tick));
                        Reservations.Add(ReservationOps.Key(barracks, (ushort)ItemId.Medkit), ReservationOps.Produce(barracks, MedKitsProduced, Tick));
                    }
                }
            }
        }
    }
}

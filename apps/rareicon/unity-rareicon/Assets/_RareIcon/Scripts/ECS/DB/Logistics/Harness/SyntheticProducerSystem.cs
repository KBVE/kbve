#if UNITY_EDITOR
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Editor-only harness. Seeds a handful of synthetic bank entities on first tick, then submits pull-style reservations between them every frame via a Burst job. Never compiles in player builds.</summary>
    [UpdateInGroup(typeof(LogisticsSystemGroup))]
    [UpdateAfter(typeof(LogisticsDomainSystem))]
    [UpdateBefore(typeof(ReservationResolveSystem))]
    public partial struct SyntheticProducerSystem : ISystem
    {
        const int    BankCount           = 4;
        const ushort ItemCount           = 3;
        const int    StartingAmount      = 1000;
        const int    ReservationsPerTick = 6;
        const uint   RngSeed             = 0x5EEDu;

        NativeList<Entity> _banks;
        bool               _seeded;
        uint               _tick;
        uint               _rng;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
            _banks = new NativeList<Entity>(BankCount, Allocator.Persistent);
            _rng   = RngSeed;
        }

        public void OnDestroy(ref SystemState state)
        {
            if (_banks.IsCreated) _banks.Dispose();
        }

        public void OnUpdate(ref SystemState state)
        {
            if (!_seeded)
            {
                state.CompleteDependency();
                var db = SystemAPI.GetSingleton<LogisticsDBSingleton>();

                _banks.Clear();
                for (int i = 0; i < BankCount; i++)
                {
                    var e = state.EntityManager.CreateEntity();
                    _banks.Add(e);
                    for (ushort item = 1; item <= ItemCount; item++)
                        db.CurrentAmounts[new LedgerKey { Bank = e, ItemId = item }] = StartingAmount;
                }
                _seeded = true;
            }

            _tick++;

            var reservations = SystemAPI.GetSingleton<LogisticsDBSingleton>().Reservations;

            state.Dependency = new SyntheticReservationJob
            {
                Banks        = _banks.AsDeferredJobArray(),
                Reservations = reservations.AsParallelWriter(),
                Tick         = _tick,
                Seed         = _rng,
                PerTick      = ReservationsPerTick,
                Items        = ItemCount,
            }.Schedule(state.Dependency);

            _rng = Scramble(_rng);
        }

        static uint Scramble(uint r)
        {
            r ^= r << 13;
            r ^= r >> 17;
            r ^= r << 5;
            return r;
        }
    }

    [BurstCompile]
    public struct SyntheticReservationJob : IJob
    {
        [ReadOnly] public NativeArray<Entity> Banks;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        public uint   Tick;
        public uint   Seed;
        public int    PerTick;
        public ushort Items;

        public void Execute()
        {
            if (Banks.Length < 2) return;

            uint r = Seed;
            for (int n = 0; n < PerTick; n++)
            {
                r ^= r << 13;
                r ^= r >> 17;
                r ^= r << 5;

                int srcIdx = (int)(r % (uint)Banks.Length);
                int dstIdx = (int)((r / 7u) % (uint)Banks.Length);
                if (srcIdx == dstIdx) dstIdx = (dstIdx + 1) % Banks.Length;

                ushort itemId = (ushort)(1 + (r % Items));
                int    amount = 5 + (int)((r >> 3) % 20);

                var key = new LedgerKey { Bank = Banks[srcIdx], ItemId = itemId };
                Reservations.Add(key, new ReservationRecord
                {
                    Requester = Banks[dstIdx],
                    Dest      = Banks[dstIdx],
                    Amount    = amount,
                    Priority  = 128,
                    Intent    = (byte)ReservationIntent.Surplus,
                    Tick      = Tick,
                });
            }
        }
    }
}
#endif

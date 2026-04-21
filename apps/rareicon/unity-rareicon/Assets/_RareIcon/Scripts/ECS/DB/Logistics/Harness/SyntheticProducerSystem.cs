using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Harness-only producer that seeds a handful of synthetic bank entities with starting balances, then submits random pull-style reservations between them every tick. Starts disabled; toggle via ComponentSystemBase.Enabled from the debug overlay.</summary>
    [UpdateInGroup(typeof(LogisticsSystemGroup))]
    [UpdateAfter(typeof(LogisticsDomainSystem))]
    [UpdateBefore(typeof(ReservationResolveSystem))]
    public partial class SyntheticProducerSystem : SystemBase
    {
        public const int    BankCount           = 4;
        public const ushort ItemCount           = 3;
        public const int    StartingAmount      = 1000;
        public const int    ReservationsPerTick = 6;
        public const uint   RngSeed             = 0x5EEDu;

        NativeList<Entity> _banks;
        bool               _seeded;
        uint               _tick;
        uint               _rng;

        protected override void OnCreate()
        {
            RequireForUpdate<LogisticsDBSingleton>();
            _banks  = new NativeList<Entity>(BankCount, Allocator.Persistent);
            _rng    = RngSeed;
            Enabled = false;
        }

        protected override void OnDestroy()
        {
            if (_banks.IsCreated) _banks.Dispose();
        }

        protected override void OnUpdate()
        {
            CompleteDependency();

            var db = SystemAPI.GetSingleton<LogisticsDBSingleton>();

            if (!_seeded)
            {
                _banks.Clear();
                for (int i = 0; i < BankCount; i++)
                {
                    var e = EntityManager.CreateEntity();
                    EntityManager.SetName(e, $"SyntheticBank_{i}");
                    _banks.Add(e);
                    for (ushort item = 1; item <= ItemCount; item++)
                        db.CurrentAmounts[new LedgerKey { Bank = e, ItemId = item }] = StartingAmount;
                }
                _seeded = true;
            }

            _tick++;

            for (int n = 0; n < ReservationsPerTick; n++)
            {
                uint r = NextRng();
                int srcIdx = (int)(r % (uint)_banks.Length);
                int dstIdx = (int)((r / 7u) % (uint)_banks.Length);
                if (srcIdx == dstIdx) dstIdx = (dstIdx + 1) % _banks.Length;

                ushort itemId = (ushort)(1 + (r % ItemCount));
                int amount = 5 + (int)((r >> 3) % 20);

                var key = new LedgerKey { Bank = _banks[srcIdx], ItemId = itemId };
                db.Reservations.Add(key, new ReservationRecord
                {
                    Requester = _banks[dstIdx],
                    Dest      = _banks[dstIdx],
                    Amount    = amount,
                    Priority  = 128,
                    Intent    = (byte)ReservationIntent.Surplus,
                    Tick      = _tick,
                });
            }
        }

        uint NextRng()
        {
            _rng ^= _rng << 13;
            _rng ^= _rng >> 17;
            _rng ^= _rng << 5;
            return _rng;
        }
    }
}

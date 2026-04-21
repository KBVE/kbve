using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Owns the LogisticsDBSingleton lifecycle: bootstraps persistent containers on first tick, clears per-frame state and reallocates the Deliveries stream every frame, disposes on world teardown.</summary>
    [UpdateInGroup(typeof(LogisticsSystemGroup), OrderFirst = true)]
    public partial class LogisticsDomainSystem : SystemBase
    {
        Entity _singleton;
        bool   _initialized;

        protected override void OnUpdate()
        {
            if (!_initialized)
            {
                var db = new LogisticsDBSingleton
                {
                    CurrentAmounts = new NativeParallelHashMap<LedgerKey, int>(1024, Allocator.Persistent),
                    Reservations   = new NativeParallelMultiHashMap<LedgerKey, ReservationRecord>(1024, Allocator.Persistent),
                    PendingDeltas  = new NativeParallelMultiHashMap<LedgerKey, int>(1024, Allocator.Persistent),
                    Deliveries     = default,
                };
                _singleton = EntityManager.CreateEntity(typeof(LogisticsDBSingleton));
                EntityManager.SetName(_singleton, "LogisticsDB");
                EntityManager.SetComponentData(_singleton, db);
                _initialized = true;
            }

            CompleteDependency();

            var live = EntityManager.GetComponentData<LogisticsDBSingleton>(_singleton);

            if (live.Deliveries.IsCreated) live.Deliveries.Dispose();
            live.Reservations.Clear();
            live.PendingDeltas.Clear();
            live.Deliveries = new NativeStream(1, Allocator.TempJob);

            EntityManager.SetComponentData(_singleton, live);
        }

        protected override void OnDestroy()
        {
            if (!_initialized) return;
            if (!EntityManager.Exists(_singleton)) return;
            var db = EntityManager.GetComponentData<LogisticsDBSingleton>(_singleton);
            if (db.CurrentAmounts.IsCreated) db.CurrentAmounts.Dispose();
            if (db.Reservations.IsCreated)   db.Reservations.Dispose();
            if (db.PendingDeltas.IsCreated)  db.PendingDeltas.Dispose();
            if (db.Deliveries.IsCreated)     db.Deliveries.Dispose();
        }
    }
}

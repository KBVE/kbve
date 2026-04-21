using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Owns the LogisticsDBSingleton lifecycle. Persistent containers bootstrap in OnCreate; the per-frame reset (complete pipeline handle, clear per-frame maps, swap the event double-buffer, recycle the Deliveries stream) runs under Burst. Managed CreateEntity / SetName / SetComponentData are isolated to OnCreate so they only happen once per world.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(LogisticsBeginGroup), OrderFirst = true)]
    public partial struct LogisticsDomainSystem : ISystem
    {
        Entity _singleton;

        public void OnCreate(ref SystemState state)
        {
            var db = new LogisticsDBSingleton
            {
                CurrentAmounts = new NativeParallelHashMap<LedgerKey, int>(1024, Allocator.Persistent),
                Reservations   = new NativeParallelMultiHashMap<LedgerKey, ReservationRecord>(1024, Allocator.Persistent),
                PendingDeltas  = new NativeParallelMultiHashMap<LedgerKey, int>(1024, Allocator.Persistent),
                PackDeliveries = new NativeParallelMultiHashMap<Entity, PackDelivery>(256, Allocator.Persistent),
                WriteBuffer    = new NativeList<InventoryChangedMessage>(256, Allocator.Persistent),
                ReadBuffer     = new NativeList<InventoryChangedMessage>(256, Allocator.Persistent),
                Deliveries     = default,
                PipelineHandle = default,
            };
            _singleton = state.EntityManager.CreateEntity(typeof(LogisticsDBSingleton));
            state.EntityManager.SetName(_singleton, "LogisticsDB");
            state.EntityManager.SetComponentData(_singleton, db);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ref var live = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;

            live.PipelineHandle.Complete();

            if (live.Deliveries.IsCreated) live.Deliveries.Dispose();
            live.Reservations.Clear();
            live.PendingDeltas.Clear();
            live.PackDeliveries.Clear();

            var tmp          = live.ReadBuffer;
            live.ReadBuffer  = live.WriteBuffer;
            live.WriteBuffer = tmp;
            live.WriteBuffer.Clear();

            live.Deliveries     = new NativeStream(1, Allocator.TempJob);
            live.PipelineHandle = default;
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!state.EntityManager.Exists(_singleton)) return;
            var db = state.EntityManager.GetComponentData<LogisticsDBSingleton>(_singleton);
            if (db.CurrentAmounts.IsCreated) db.CurrentAmounts.Dispose();
            if (db.Reservations.IsCreated)   db.Reservations.Dispose();
            if (db.PendingDeltas.IsCreated)  db.PendingDeltas.Dispose();
            if (db.PackDeliveries.IsCreated) db.PackDeliveries.Dispose();
            if (db.WriteBuffer.IsCreated)    db.WriteBuffer.Dispose();
            if (db.ReadBuffer.IsCreated)     db.ReadBuffer.Dispose();
            if (db.Deliveries.IsCreated)     db.Deliveries.Dispose();
        }
    }
}

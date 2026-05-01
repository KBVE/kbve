using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Owns CombatDBSingleton lifecycle. Allocates the persistent threat snapshot containers + event stream double-buffers in OnCreate, clears the per-frame snapshot + swaps Write→Read on every event stream in OnUpdate so producers write into a clean WriteBuffer while consumers drain last frame's ReadBuffer. ISystem, OrderFirst in BehaviorSystemGroup, Burst-compiled on the hot path.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup), OrderFirst = true)]
    public partial struct CombatDomainSystem : ISystem
    {
        Entity _singleton;

        public void OnCreate(ref SystemState state)
        {
            var db = new CombatDBSingleton
            {
                Threats                      = new NativeList<ThreatRecord>(64, Allocator.Persistent),
                FriendlyEmitters             = new NativeList<TerritoryEmitter>(4, Allocator.Persistent),
                HostileEmitters              = new NativeList<TerritoryEmitter>(4, Allocator.Persistent),
                PipelineHandle               = default,

                PreviousFrameThreats         = new NativeParallelHashSet<Entity>(64, Allocator.Persistent),

                ThreatDetectedWriteBuffer    = new NativeList<ThreatDetectedRecord>(16, Allocator.Persistent),
                ThreatDetectedReadBuffer     = new NativeList<ThreatDetectedRecord>(16, Allocator.Persistent),
                ThreatClearedWriteBuffer     = new NativeList<ThreatClearedRecord>(16, Allocator.Persistent),
                ThreatClearedReadBuffer      = new NativeList<ThreatClearedRecord>(16, Allocator.Persistent),
                UnitKilledWriteBuffer        = new NativeList<UnitKilledRecord>(16, Allocator.Persistent),
                UnitKilledReadBuffer         = new NativeList<UnitKilledRecord>(16, Allocator.Persistent),
                BuildingDestroyedWriteBuffer = new NativeList<BuildingDestroyedRecord>(8, Allocator.Persistent),
                BuildingDestroyedReadBuffer  = new NativeList<BuildingDestroyedRecord>(8, Allocator.Persistent),
            };
            _singleton = state.EntityManager.CreateEntity(typeof(CombatDBSingleton));
            state.EntityManager.SetName(_singleton, "CombatDB");
            state.EntityManager.SetComponentData(_singleton, db);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ref var live = ref SystemAPI.GetSingletonRW<CombatDBSingleton>().ValueRW;
            live.PipelineHandle.Complete();

            live.Threats.Clear();
            live.FriendlyEmitters.Clear();
            live.HostileEmitters.Clear();
            live.PipelineHandle = default;

            // Swap Write→Read on every event stream: last frame's producers
            // filled the WriteBuffer; this frame's consumers read it via the
            // ReadBuffer; new producers write into a freshly cleared
            // WriteBuffer. NativeList swap is a header-level exchange — no
            // element copies. Inlined (generic static helpers trip Burst).
            var td = live.ThreatDetectedWriteBuffer;
            live.ThreatDetectedWriteBuffer = live.ThreatDetectedReadBuffer;
            live.ThreatDetectedReadBuffer  = td;
            live.ThreatDetectedWriteBuffer.Clear();

            var tc = live.ThreatClearedWriteBuffer;
            live.ThreatClearedWriteBuffer = live.ThreatClearedReadBuffer;
            live.ThreatClearedReadBuffer  = tc;
            live.ThreatClearedWriteBuffer.Clear();

            var uk = live.UnitKilledWriteBuffer;
            live.UnitKilledWriteBuffer = live.UnitKilledReadBuffer;
            live.UnitKilledReadBuffer  = uk;
            live.UnitKilledWriteBuffer.Clear();

            var bd = live.BuildingDestroyedWriteBuffer;
            live.BuildingDestroyedWriteBuffer = live.BuildingDestroyedReadBuffer;
            live.BuildingDestroyedReadBuffer  = bd;
            live.BuildingDestroyedWriteBuffer.Clear();
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!state.EntityManager.Exists(_singleton)) return;
            var db = state.EntityManager.GetComponentData<CombatDBSingleton>(_singleton);
            if (db.Threats.IsCreated)                      db.Threats.Dispose();
            if (db.FriendlyEmitters.IsCreated)             db.FriendlyEmitters.Dispose();
            if (db.HostileEmitters.IsCreated)              db.HostileEmitters.Dispose();
            if (db.PreviousFrameThreats.IsCreated)         db.PreviousFrameThreats.Dispose();
            if (db.ThreatDetectedWriteBuffer.IsCreated)    db.ThreatDetectedWriteBuffer.Dispose();
            if (db.ThreatDetectedReadBuffer.IsCreated)     db.ThreatDetectedReadBuffer.Dispose();
            if (db.ThreatClearedWriteBuffer.IsCreated)     db.ThreatClearedWriteBuffer.Dispose();
            if (db.ThreatClearedReadBuffer.IsCreated)      db.ThreatClearedReadBuffer.Dispose();
            if (db.UnitKilledWriteBuffer.IsCreated)        db.UnitKilledWriteBuffer.Dispose();
            if (db.UnitKilledReadBuffer.IsCreated)         db.UnitKilledReadBuffer.Dispose();
            if (db.BuildingDestroyedWriteBuffer.IsCreated) db.BuildingDestroyedWriteBuffer.Dispose();
            if (db.BuildingDestroyedReadBuffer.IsCreated)  db.BuildingDestroyedReadBuffer.Dispose();
        }
    }
}

using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Owns CombatDBSingleton lifecycle. Bootstraps the persistent threat/emitter lists on first tick, completes the pipeline handle each frame, and clears the per-frame lists so CombatThreatScanSystem writes into a clean slate. ISystem — pure native-container orchestration, OrderFirst in BehaviorSystemGroup so downstream consumers (ProfessionDispatchSystem) see fresh data the same tick it's built.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup), OrderFirst = true)]
    public partial struct CombatDomainSystem : ISystem
    {
        Entity _singleton;
        bool   _initialized;

        public void OnUpdate(ref SystemState state)
        {
            if (!_initialized)
            {
                var db = new CombatDBSingleton
                {
                    Threats                      = new NativeList<ThreatRecord>(64, Allocator.Persistent),
                    FriendlyEmitters             = new NativeList<TerritoryEmitter>(4, Allocator.Persistent),
                    AnyThreatInFriendlyTerritory = false,
                    PipelineHandle               = default,
                };
                _singleton = state.EntityManager.CreateEntity(typeof(CombatDBSingleton));
                state.EntityManager.SetName(_singleton, "CombatDB");
                state.EntityManager.SetComponentData(_singleton, db);
                _initialized = true;
            }

            ref var live = ref SystemAPI.GetSingletonRW<CombatDBSingleton>().ValueRW;
            live.PipelineHandle.Complete();
            live.Threats.Clear();
            live.FriendlyEmitters.Clear();
            live.AnyThreatInFriendlyTerritory = false;
            live.PipelineHandle = default;
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!_initialized) return;
            if (!state.EntityManager.Exists(_singleton)) return;
            var db = state.EntityManager.GetComponentData<CombatDBSingleton>(_singleton);
            if (db.Threats.IsCreated)          db.Threats.Dispose();
            if (db.FriendlyEmitters.IsCreated) db.FriendlyEmitters.Dispose();
        }
    }
}

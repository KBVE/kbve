using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Owns CombatDBSingleton lifecycle. Bootstraps the persistent threat/emitter lists in OnCreate and clears the per-frame lists in OnUpdate so CombatThreatScanSystem writes into a clean slate. ISystem, OrderFirst in BehaviorSystemGroup, Burst-compiled on the hot path.</summary>
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
                AnyThreatInFriendlyTerritory = false,
                PipelineHandle               = default,
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
            live.AnyThreatInFriendlyTerritory = false;
            live.PipelineHandle = default;
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!state.EntityManager.Exists(_singleton)) return;
            var db = state.EntityManager.GetComponentData<CombatDBSingleton>(_singleton);
            if (db.Threats.IsCreated)          db.Threats.Dispose();
            if (db.FriendlyEmitters.IsCreated) db.FriendlyEmitters.Dispose();
        }
    }
}

using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Owns the ProfessionsDBSingleton lifecycle: bootstraps the CommittedEvents list on first tick, clears it per frame, disposes on teardown. Runs in BehaviorSystemGroup OrderFirst so the dispatcher downstream sees an empty list.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup), OrderFirst = true)]
    public partial class ProfessionsDomainSystem : SystemBase
    {
        Entity _singleton;
        bool   _initialized;

        protected override void OnUpdate()
        {
            if (!_initialized)
            {
                var db = new ProfessionsDBSingleton
                {
                    CommittedEvents = new NativeList<ProfessionChangedMessage>(64, Allocator.Persistent),
                    PipelineHandle  = default,
                };
                _singleton = EntityManager.CreateEntity(typeof(ProfessionsDBSingleton));
                EntityManager.SetName(_singleton, "ProfessionsDB");
                EntityManager.SetComponentData(_singleton, db);
                _initialized = true;
            }

            ref var live = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;
            live.PipelineHandle.Complete();
            live.CommittedEvents.Clear();
            live.PipelineHandle = default;
        }

        protected override void OnDestroy()
        {
            if (!_initialized) return;
            if (!EntityManager.Exists(_singleton)) return;
            var db = EntityManager.GetComponentData<ProfessionsDBSingleton>(_singleton);
            if (db.CommittedEvents.IsCreated) db.CommittedEvents.Dispose();
        }
    }
}

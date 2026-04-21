using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Owns ProfessionsDBSingleton lifecycle and runs the double-buffer swap each tick. Producers append to WriteBuffer; this system swaps ReadBuffer↔WriteBuffer and clears the new WriteBuffer, so ProfessionMessagePipeBridgeSystem drains ReadBuffer with zero write contention. ISystem — pure native-container orchestration, Burst-ready.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup), OrderFirst = true)]
    public partial struct ProfessionsDomainSystem : ISystem
    {
        Entity _singleton;
        bool   _initialized;

        public void OnUpdate(ref SystemState state)
        {
            if (!_initialized)
            {
                var db = new ProfessionsDBSingleton
                {
                    WriteBuffer    = new NativeList<ProfessionChangedMessage>(256, Allocator.Persistent),
                    ReadBuffer     = new NativeList<ProfessionChangedMessage>(256, Allocator.Persistent),
                    PipelineHandle = default,
                };
                _singleton = state.EntityManager.CreateEntity(typeof(ProfessionsDBSingleton));
                state.EntityManager.SetName(_singleton, "ProfessionsDB");
                state.EntityManager.SetComponentData(_singleton, db);
                _initialized = true;
            }

            ref var db2 = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;
            db2.PipelineHandle.Complete();

            var tmp         = db2.ReadBuffer;
            db2.ReadBuffer  = db2.WriteBuffer;
            db2.WriteBuffer = tmp;
            db2.WriteBuffer.Clear();

            db2.PipelineHandle = default;
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!_initialized) return;
            if (!state.EntityManager.Exists(_singleton)) return;
            var db = state.EntityManager.GetComponentData<ProfessionsDBSingleton>(_singleton);
            if (db.WriteBuffer.IsCreated) db.WriteBuffer.Dispose();
            if (db.ReadBuffer.IsCreated)  db.ReadBuffer.Dispose();
        }
    }
}

using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Owns ProfessionsDBSingleton lifecycle and runs the double-buffer swap each tick. Producers append to WriteBuffer; this system swaps ReadBuffer↔WriteBuffer and clears the new WriteBuffer, so ProfessionMessagePipeBridgeSystem drains ReadBuffer with zero write contention. ISystem — init moved to OnCreate so OnUpdate stays Burst-compiled (no managed calls on the hot path).</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup), OrderFirst = true)]
    public partial struct ProfessionsDomainSystem : ISystem
    {
        Entity _singleton;

        public void OnCreate(ref SystemState state)
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
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;
            db.PipelineHandle.Complete();

            var tmp        = db.ReadBuffer;
            db.ReadBuffer  = db.WriteBuffer;
            db.WriteBuffer = tmp;
            db.WriteBuffer.Clear();

            db.PipelineHandle = default;
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!state.EntityManager.Exists(_singleton)) return;
            var db = state.EntityManager.GetComponentData<ProfessionsDBSingleton>(_singleton);
            if (db.WriteBuffer.IsCreated) db.WriteBuffer.Dispose();
            if (db.ReadBuffer.IsCreated)  db.ReadBuffer.Dispose();
        }
    }
}

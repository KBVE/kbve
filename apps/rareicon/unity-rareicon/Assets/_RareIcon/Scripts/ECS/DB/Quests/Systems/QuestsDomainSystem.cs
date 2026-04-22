using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Owns <see cref="QuestDBSingleton"/> lifecycle. OnCreate allocates the persistent containers, mirrors managed <see cref="QuestDB"/> into Defs, and seeds the tutorial quest onto PendingStart. Per-frame: completes the pipeline handle and swaps WriteBuffer↔ReadBuffer for both Started and Completed event streams so producers always see an empty WriteBuffer and the bridge drains a stable ReadBuffer. Mirrors <see cref="LogisticsDomainSystem"/> / <see cref="ProfessionsDomainSystem"/>.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial struct QuestsDomainSystem : ISystem
    {
        Entity _singleton;

        public void OnCreate(ref SystemState state)
        {
            var db = new QuestDBSingleton
            {
                Defs                 = new NativeHashMap<ushort, QuestDefRuntime>(32, Allocator.Persistent),
                PendingStart         = new NativeQueue<ushort>(Allocator.Persistent),
                StartedWriteBuffer   = new NativeList<QuestStartedMessage>(16, Allocator.Persistent),
                StartedReadBuffer    = new NativeList<QuestStartedMessage>(16, Allocator.Persistent),
                CompletedWriteBuffer = new NativeList<QuestCompletedMessage>(16, Allocator.Persistent),
                CompletedReadBuffer  = new NativeList<QuestCompletedMessage>(16, Allocator.Persistent),
                PipelineHandle       = default,
                LastEvaluatedTurn    = uint.MaxValue,
            };

            // One-time managed crossing — mirror QuestDB into the Burst map.
            QuestDB.PopulateRuntime(ref db.Defs);

            // Tutorial auto-start — the player's first quest lands the instant
            // QuestSeedSystem sees the Player singleton.
            db.PendingStart.Enqueue(QuestId.FoundingOrder);

            _singleton = state.EntityManager.CreateEntity(typeof(QuestDBSingleton));
            state.EntityManager.SetName(_singleton, "QuestsDB");
            state.EntityManager.SetComponentData(_singleton, db);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ref var live = ref SystemAPI.GetSingletonRW<QuestDBSingleton>().ValueRW;

            live.PipelineHandle.Complete();

            // Double-buffer swap — producers wrote to Write last frame, bridge
            // will drain the old Write (now Read) this frame.
            var startedTmp          = live.StartedReadBuffer;
            live.StartedReadBuffer  = live.StartedWriteBuffer;
            live.StartedWriteBuffer = startedTmp;
            live.StartedWriteBuffer.Clear();

            var completedTmp          = live.CompletedReadBuffer;
            live.CompletedReadBuffer  = live.CompletedWriteBuffer;
            live.CompletedWriteBuffer = completedTmp;
            live.CompletedWriteBuffer.Clear();

            live.PipelineHandle = default;
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!state.EntityManager.Exists(_singleton)) return;
            var db = state.EntityManager.GetComponentData<QuestDBSingleton>(_singleton);
            if (db.Defs.IsCreated)                 db.Defs.Dispose();
            if (db.PendingStart.IsCreated)         db.PendingStart.Dispose();
            if (db.StartedWriteBuffer.IsCreated)   db.StartedWriteBuffer.Dispose();
            if (db.StartedReadBuffer.IsCreated)    db.StartedReadBuffer.Dispose();
            if (db.CompletedWriteBuffer.IsCreated) db.CompletedWriteBuffer.Dispose();
            if (db.CompletedReadBuffer.IsCreated)  db.CompletedReadBuffer.Dispose();
        }
    }
}
